/**
 * Auth Routes — Supabase Auth Integration
 * =========================================
 * All auth operations go through Supabase Auth.
 * Custom users table (public.users) stores role & name,
 * linked to auth.users via auth_id column.
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { supabase } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import dotenv from 'dotenv';
import nodemailer from 'nodemailer';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

const router = express.Router();

// Memory store for short-lived password reset OTPs
const otpStore = new Map();

// Admin client for server-side auth operations
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

// ── POST /api/auth/register ──────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (!name || !email || !password || !role) {
    return res.status(400).json({ error: 'All fields (name, email, password, role) are required' });
  }
  if (!['employee', 'md'].includes(role)) {
    return res.status(400).json({ error: 'Role must be either employee or md' });
  }

  try {
    // 0. Check if email is whitelisted
    const { data: allowedEmail, error: whitelistError } = await supabaseAdmin
      .from('allowed_emails')
      .select('id')
      .ilike('email', email.trim())
      .maybeSingle();

    if (whitelistError) {
      console.error('[Auth] Whitelist check failed:', whitelistError.message);
      if (whitelistError.message.includes('does not exist')) {
        return res.status(500).json({ error: 'allowed_emails table is not created in Supabase database. Please run the SQL commands from schema.sql in your Supabase SQL Editor.' });
      }
    } else if (!allowedEmail) {
      return res.status(403).json({ error: 'This email is not whitelisted by the Managing Director. Registration restricted.' });
    }

    // 1. Create user in Supabase Auth (This fires the trigger which auto-inserts into public.users)
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,         
      user_metadata: { name, role }, 
    });

    if (authError) {
      if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
        return res.status(400).json({ error: 'User with this email already exists' });
      }
      throw authError;
    }

    const authUser = authData.user;

    // 2. Upsert the profile in public.users to ensure it matches and link the auth_id
    // This resolves the double-insert conflict with the handle_new_auth_user trigger.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .upsert({
        email,
        auth_id:       authUser.id,  
        role,
        name,
        password_hash: '[managed-by-supabase-auth]',
      }, { onConflict: 'email' })
      .select()
      .single();

    if (profileError) {
      // Rollback auth user if profile creation fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      throw profileError;
    }

    console.log(`[Auth] Registered: ${email} (${role})`);
    return res.status(201).json({
      message: 'User registered successfully',
      userId: profile.id,
    });

  } catch (err) {
    console.error('[Auth] Register error:', err.message);
    res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// ── POST /api/auth/login ─────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    // Check if email is whitelisted
    const { data: allowedEmail, error: whitelistError } = await supabaseAdmin
      .from('allowed_emails')
      .select('id')
      .ilike('email', email.trim())
      .maybeSingle();

    if (whitelistError) {
      console.error('[Auth] Whitelist check failed:', whitelistError.message);
      if (whitelistError.message.includes('does not exist')) {
        return res.status(500).json({ error: 'allowed_emails table is not created in Supabase database. Please run the SQL commands from schema.sql in your Supabase SQL Editor.' });
      }
    } else if (!allowedEmail) {
      return res.status(403).json({ error: 'Access denied: your email is not whitelisted by the Managing Director.' });
    }

    // Sign in via Supabase Auth — returns access_token + user
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }

    // Fetch role/name from public.users profile
    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('id, role, name, email, avatar_url')
      .eq('auth_id', data.user.id)
      .single();

    const userProfile = profile || {
      id:    data.user.id,
      role:  data.user.user_metadata?.role  || 'employee',
      name:  data.user.user_metadata?.name  || email,
      email: data.user.email,
      avatar_url: null,
    };

    console.log(`[Auth] Login: ${email} (${userProfile.role})`);

    res.json({
      token: data.session.access_token,   // Supabase JWT — use this as Bearer token
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
      user: userProfile,
    });

  } catch (err) {
    console.error('[Auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ── POST /api/auth/refresh ───────────────────────────────────────
router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'refresh_token required' });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token });
    if (error) throw error;

    res.json({
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      expires_at: data.session.expires_at,
    });
  } catch (err) {
    res.status(401).json({ error: 'Token refresh failed' });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────
router.post('/logout', authenticateToken, async (req, res) => {
  // Supabase tokens expire automatically — client should clear local storage
  // Server-side signout can revoke the session via admin API
  res.json({ message: 'Logged out successfully' });
});

// ── GET /api/auth/me ─────────────────────────────────────────────
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // req.user is set by middleware — may have auth_id-based profile or metadata fallback
    const { data: profile, error } = await supabaseAdmin
      .from('users')
      .select('id, role, name, email, avatar_url, created_at')
      .or(`id.eq.${req.user.id},auth_id.eq.${req.user.id}`)
      .limit(1)
      .single();

    if (error || !profile) {
      // Return whatever the middleware assembled
      return res.json({
        id:    req.user.id,
        role:  req.user.role,
        name:  req.user.name,
        email: req.user.email,
      });
    }

    res.json(profile);
  } catch (err) {
    console.error('[Auth] Fetch profile error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve profile' });
  }
});

// ── GET /api/auth/employees ──────────────────────────────────────
router.get('/employees', authenticateToken, async (req, res) => {
  try {
    const { data: employees, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, avatar_url')
      .eq('role', 'employee');
      
    if (error) throw error;
    res.json(employees);
  } catch (err) {
    console.error('[Auth] Fetch employees error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve employees list' });
  }
});

// ── GET /api/auth/md-profile ──────────────────────────────────────
router.get('/md-profile', authenticateToken, async (req, res) => {
  try {
    const { data: mdProfile, error } = await supabaseAdmin
      .from('users')
      .select('id, name, email, avatar_url')
      .eq('role', 'md')
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    res.json(mdProfile || { name: 'Managing Director', avatar_url: null });
  } catch (err) {
    console.error('[Auth] Fetch MD profile error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve MD profile' });
  }
});

// ── POST /api/auth/forgot-password ───────────────────────────────
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // 1. Verify user profile exists in database
    const { data: userProfile, error } = await supabaseAdmin
      .from('users')
      .select('id, email, auth_id')
      .ilike('email', email.trim())
      .maybeSingle();

    if (error) throw error;
    if (!userProfile) {
      return res.status(404).json({ error: 'No account registered with this email address' });
    }

    // 2. Generate a random 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    
    // Store in OTP memory map, expires in 10 minutes
    otpStore.set(email.trim().toLowerCase(), {
      otp,
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minutes
    });

    console.log(`[OTP] Generated password reset OTP for ${email}: ${otp}`);

    // 3. Setup Nodemailer Transporter
    const hasSmtpConfig = process.env.EMAIL_USER && 
                          process.env.EMAIL_PASS && 
                          process.env.EMAIL_USER !== 'your-email@gmail.com' &&
                          process.env.EMAIL_PASS !== 'your-gmail-app-password';
    let sentEmail = false;
    let smtpError = null;

    if (hasSmtpConfig) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
          }
        });

        await transporter.sendMail({
          from: `"Akash AI Platform" <${process.env.EMAIL_USER}>`,
          to: email.trim().toLowerCase(),
          subject: "Your OTP for Password Reset",
          text: `Hello,\n\nYou requested to reset your password. Your 6-digit One-Time Password (OTP) is:\n\n${otp}\n\nThis OTP is valid for 10 minutes.\n\nIf you did not request this, please ignore this email.`,
          html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 500px; margin: auto; border: 1px solid #e2e8f0; border-radius: 12px; background: #ffffff;">
              <h2 style="color: #F58533; text-align: center; margin-bottom: 24px;">Akash AI Password Reset</h2>
              <p>Hello,</p>
              <p>You requested to reset your password. Please use the following One-Time Password (OTP) to proceed:</p>
              <div style="background: #f8fafc; border: 1px dashed #F58533; border-radius: 8px; padding: 16px; text-align: center; font-size: 28px; font-weight: 700; color: #052341; letter-spacing: 4px; margin: 24px 0;">
                ${otp}
              </div>
              <p style="font-size: 13px; color: #718096;">This OTP is valid for 10 minutes. If you did not make this request, you can safely ignore this email.</p>
              <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
              <p style="font-size: 11px; text-align: center; color: #a0aec0;">Akash Blowers Pvt. Ltd. &bull; Peace of mind, Delivered.</p>
            </div>
          `
        });
        sentEmail = true;
      } catch (smtpErr) {
        console.error(`[OTP] SMTP send failed to ${email}:`, smtpErr.message);
        smtpError = smtpErr.message;
      }
    }

    if (hasSmtpConfig && !sentEmail) {
      return res.json({
        message: `OTP generated, but failed to send email: ${smtpError || 'Unknown SMTP error'}. The OTP has been printed to the server terminal console for testing.`,
        smtpActive: false
      });
    }

    return res.json({
      message: sentEmail 
        ? 'A 6-digit OTP code has been sent to your Gmail.' 
        : 'OTP generated successfully. (SMTP not configured, OTP printed to server terminal for testing)',
      smtpActive: sentEmail
    });

  } catch (err) {
    console.error('[Auth] Forgot password error:', err.message);
    res.status(500).json({ error: 'Failed to process request' });
  }
});

// ── POST /api/auth/reset-password ────────────────────────────────
router.post('/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, OTP, and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // 1. Fetch OTP record
    const record = otpStore.get(normalizedEmail);
    if (!record) {
      return res.status(400).json({ error: 'No OTP requested for this email, or it has expired.' });
    }

    // 2. Validate OTP
    if (record.otp !== String(otp).trim()) {
      return res.status(400).json({ error: 'Invalid OTP code. Please check and try again.' });
    }

    // 3. Check expiration
    if (Date.now() > record.expiresAt) {
      otpStore.delete(normalizedEmail);
      return res.status(400).json({ error: 'OTP code has expired. Please request a new one.' });
    }

    // 4. Retrieve auth_id from profile
    const { data: userProfile, error } = await supabaseAdmin
      .from('users')
      .select('id, auth_id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (error) throw error;
    if (!userProfile || !userProfile.auth_id) {
      return res.status(404).json({ error: 'User profile not found' });
    }

    // 5. Update user password in Supabase Auth
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
      userProfile.auth_id,
      { password: newPassword }
    );

    if (updateError) throw updateError;

    // 6. Delete OTP from store
    otpStore.delete(normalizedEmail);

    console.log(`[Auth] Password reset successful for: ${normalizedEmail}`);
    res.json({ message: 'Password has been reset successfully! You can now log in.' });

  } catch (err) {
    console.error('[Auth] Reset password error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to reset password' });
  }
});

// ── GET /api/auth/allowed-emails ────────────────────────────────
router.get('/allowed-emails', authenticateToken, async (req, res) => {
  if (req.user.role !== 'md') {
    return res.status(403).json({ error: 'Access denied: MD role required' });
  }

  try {
    const { data, error } = await supabaseAdmin
      .from('allowed_emails')
      .select('*')
      .order('email', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('[Auth] Fetch allowed-emails error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve whitelisted emails' });
  }
});

// ── POST /api/auth/allowed-emails ───────────────────────────────
router.post('/allowed-emails', authenticateToken, async (req, res) => {
  if (req.user.role !== 'md') {
    return res.status(403).json({ error: 'Access denied: MD role required' });
  }

  const { email } = req.body;
  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();

    // Check if already exists
    const { data: existing } = await supabaseAdmin
      .from('allowed_emails')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ error: 'Email is already whitelisted' });
    }

    const { data, error } = await supabaseAdmin
      .from('allowed_emails')
      .insert({ email: normalizedEmail })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    console.error('[Auth] Add allowed-email error:', err.message);
    res.status(500).json({ error: 'Failed to whitelist email' });
  }
});

// ── DELETE /api/auth/allowed-emails/:id ──────────────────────────
router.delete('/allowed-emails/:id', authenticateToken, async (req, res) => {
  if (req.user.role !== 'md') {
    return res.status(403).json({ error: 'Access denied: MD role required' });
  }

  const { id } = req.params;

  try {
    // Prevent deleting the primary MD email from the whitelist (amit@company.com)
    const { data: record } = await supabaseAdmin
      .from('allowed_emails')
      .select('email')
      .eq('id', id)
      .maybeSingle();

    if (record && record.email === 'amit@company.com') {
      return res.status(400).json({ error: 'Cannot delete the primary MD email from the whitelist' });
    }

    const { error } = await supabaseAdmin
      .from('allowed_emails')
      .delete()
      .eq('id', id);

    if (error) throw error;
    res.json({ message: 'Email removed from whitelist successfully' });
  } catch (err) {
    console.error('[Auth] Delete allowed-email error:', err.message);
    res.status(500).json({ error: 'Failed to remove email from whitelist' });
  }
});

// Multer storage setup for avatar uploads
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const avatarStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const uploadAvatar = multer({ 
  storage: avatarStorage,
  limits: { fileSize: 5242880 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only images (jpg, png, gif, webp) are allowed'));
  }
});

// ── POST /api/auth/profile/avatar ─────────────────────────────────
router.post('/profile/avatar', authenticateToken, uploadAvatar.single('avatar'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Avatar image file is required' });
  }

  const tempFilePath = req.file.path;
  const userId = req.user.id;

  try {
    const fileBuffer = fs.readFileSync(tempFilePath);
    const bucketName = 'avatars';

    // Ensure bucket exists in Supabase Storage
    const { data: buckets, error: listError } = await supabaseAdmin.storage.listBuckets();
    if (listError) {
      console.error('[Supabase Storage] List buckets error:', listError.message);
    }
    const bucketExists = buckets?.some(b => b.name === bucketName);
    if (!bucketExists) {
      console.log(`[Supabase Storage] Creating public bucket: "${bucketName}"`);
      const { error: createError } = await supabaseAdmin.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 5242880 // 5MB
      });
      if (createError) {
        console.error('[Supabase Storage] Bucket creation error:', createError.message);
      }
    }

    // Upload file buffer to Supabase Storage
    const uniqueFilename = `${userId}-${Date.now()}${path.extname(req.file.originalname)}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from(bucketName)
      .upload(uniqueFilename, fileBuffer, {
        contentType: req.file.mimetype,
        duplex: 'half',
        upsert: true
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL of the uploaded asset
    const { data: urlData } = supabaseAdmin.storage.from(bucketName).getPublicUrl(uniqueFilename);
    const publicUrl = urlData.publicUrl;

    // Delete local temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    // Update the avatar_url in the users table
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({ avatar_url: publicUrl })
      .or(`id.eq.${userId},auth_id.eq.${userId}`);

    if (updateError) throw updateError;

    res.json({
      message: 'Avatar uploaded and profile updated successfully',
      avatarUrl: publicUrl
    });
  } catch (err) {
    console.error('[Supabase Storage] Avatar upload error:', err.message);
    // Cleanup temporary file in case of failure
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    res.status(500).json({ error: `Avatar upload failed: ${err.message}` });
  }
});

export default router;
