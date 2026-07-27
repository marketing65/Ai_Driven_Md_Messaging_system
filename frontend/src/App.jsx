import React, { useState, useEffect, useRef } from 'react';
import { Bell, Search, Sun, Moon, CheckCheck, User, Sparkles, ShieldCheck } from 'lucide-react';
import { io } from 'socket.io-client';
import supabase from './lib/supabase.js';

import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import DualChat from './components/DualChat';
import MDQueue from './components/MDQueue';
import KnowledgeBase from './components/KnowledgeBase';
import Analytics from './components/Analytics';
import Whitelist from './components/Whitelist';
import { AnimatedThemeToggler } from './components/AnimatedThemeToggler';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:5000';

export default function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');
  const [authInitialized, setAuthInitialized] = useState(false);

  // Multi-step Loader State variables
  const [loaderFinished, setLoaderFinished] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [loaderTrigger, setLoaderTrigger] = useState(0);

  const loaderSteps = [
    { text: 'Initializing secure connection...', id: 'conn' },
    { text: 'Authenticating credentials...', id: 'auth' },
    { text: 'Indexing RAG knowledge documents...', id: 'rag' },
    { text: 'Mounting AI messaging gateway...', id: 'gateway' },
  ];

  useEffect(() => {
    let active = true;
    let step = 0;
    setCurrentStepIndex(0);
    setLoaderFinished(false);

    const interval = setInterval(() => {
      if (!active) return;
      if (step < loaderSteps.length - 1) {
        step++;
        setCurrentStepIndex(step);
      } else {
        clearInterval(interval);
        setLoaderFinished(true);
      }
    }, 750);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [loaderTrigger]);



  // Auth Form State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('employee');
  const [isRegister, setIsRegister] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);

  // Reset Password State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetStep, setResetStep] = useState(1); // 1 = request, 2 = verify & reset
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  // Notifications State
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [queueCount, setQueueCount] = useState(0);
  const socketRef = useRef(null);

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const userRef = useRef(user);
  const authInitializedRef = useRef(authInitialized);

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  useEffect(() => {
    authInitializedRef.current = authInitialized;
  }, [authInitialized]);

  // ── Supabase Auth Session Listener ───────────────────────────────
  // Automatically restores session on page refresh and listens for
  // login/logout events from any tab or device
  useEffect(() => {
    // Check for existing session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session) {
        await loadUserProfile(session.access_token, session.user);
      }
      setAuthInitialized(true);
    });

    // Listen for auth state changes (login, logout, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          if (authInitializedRef.current && !userRef.current) {
            setLoaderTrigger(prev => prev + 1);
          }
          await loadUserProfile(session.access_token, session.user);
        } else if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          if (event === 'SIGNED_OUT') {
            setUser(null);
            setToken('');
            setNotifications([]);
          } else if (session) {
            // Silently update token on refresh
            setToken(session.access_token);
          }
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Fetch full profile from backend (has role, name from public.users)
  const loadUserProfile = async (accessToken, authUser) => {
    try {
      setToken(accessToken);
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      if (res.ok) {
        const profile = await res.json();
        setUser(profile);
        setActiveTab('dashboard');
      } else {
        // Profile not found — use auth metadata as fallback
        const meta = authUser.user_metadata || {};
        setUser({
          id: authUser.id,
          email: authUser.email,
          name: meta.name || authUser.email,
          role: meta.role || 'employee',
        });
        setActiveTab('dashboard');
      }
    } catch (err) {
      console.error('Profile load failed:', err);
    }
  };


  // Setup WebSockets and Notifications when logged in
  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    // ── Socket.io (real-time from backend) ────────────────
    socketRef.current = io(BACKEND_URL);
    socketRef.current.emit('join', { userId: user.id, role: user.role });
    socketRef.current.on('new_notification', (newNotif) => {
      setNotifications(prev => [newNotif, ...prev]);
    });

    if (user.role === 'md') {
      fetchQueueCount();

      socketRef.current.on('new_queue_item', () => {
        setQueueCount(prev => prev + 1);
      });

      socketRef.current.on('queue_item_updated', () => {
        setQueueCount(prev => Math.max(0, prev - 1));
      });
    }

    // ── Supabase Realtime (direct DB subscription) ────────
    // Subscribe to new notifications for this specific user
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          // Avoid duplicate if Socket.io already delivered it
          setNotifications(prev => {
            const exists = prev.some(n => n.id === payload.new.id);
            return exists ? prev : [{ ...payload.new, read_status: false }, ...prev];
          });
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Supabase Realtime] Notifications channel subscribed');
        }
      });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
      supabase.removeChannel(channel);
    };
  }, [user, token]);

  // Reconcile queue count on tab changes (ensures count is accurate when navigating)
  useEffect(() => {
    if (user && user.role === 'md') {
      fetchQueueCount();
    }
  }, [activeTab, user]);

  const fetchProfile = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setUser(data);
      } else {
        await handleLogout();
      }
    } catch (err) {
      console.error('Profile fetch failed:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/notifications`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch (err) {
      console.error('Notifications fetch failed:', err);
    }
  };

  const fetchQueueCount = async () => {
    if (!token) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/questions?status=pending`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setQueueCount(data.length);
      }
    } catch (err) {
      console.error('Queue count fetch failed:', err);
    }
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    try {
      if (isRegister) {
        // ── REGISTER: call backend (creates auth.users + public.users) ──
        const res = await fetch(`${BACKEND_URL}/api/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password, role }),
        });
        const data = await res.json();

        if (!res.ok) {
          setAuthError(data.error || 'Registration failed');
        } else {
          // Show beautiful success checkmark, then flip back to login
          setRegistrationSuccess(true);
          setAuthLoading(false);
          setName('');
          setPassword('');
          setTimeout(() => {
            setRegistrationSuccess(false);
            setIsRegister(false);
          }, 3000);
        }

      } else {
        // ── LOGIN: use Supabase Auth directly ───────────────────────────
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          setAuthError(
            error.message.includes('Invalid')
              ? 'Invalid email or password'
              : error.message
          );
        }
        // onAuthStateChange handles setting user + token
      }
    } catch (err) {
      setAuthError('Unable to connect. Please try again.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSendResetOtp = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    setResetLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error || 'Failed to send OTP');
      } else {
        setResetSuccess(data.message);
        setResetStep(2);
      }
    } catch (err) {
      setResetError('Connection error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleVerifyAndReset = async (e) => {
    e.preventDefault();
    setResetError('');
    setResetSuccess('');
    setResetLoading(true);

    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail, otp: resetOtp, newPassword: resetNewPassword }),
      });
      const data = await res.json();

      if (!res.ok) {
        setResetError(data.error || 'Failed to reset password');
      } else {
        setResetSuccess(data.message);
        setTimeout(() => {
          setShowResetModal(false);
          setResetEmail('');
          setResetOtp('');
          setResetNewPassword('');
          setResetStep(1);
          setResetSuccess('');
        }, 3000);
      }
    } catch (err) {
      setResetError('Connection error. Please try again.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setToken('');
    setUser(null);
    setNotifications([]);
  };


  const markAsRead = async (id) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/notifications/${id}/read`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev =>
          prev.map(n => n.id === id ? { ...n, read_status: true } : n)
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markAllRead = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/notifications/read-all`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        setNotifications(prev => prev.map(n => ({ ...n, read_status: true })));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  const unreadCount = notifications.filter(n => !n.read_status).length;

  // Multi-step System Initializer Overlay
  if (!loaderFinished) {
    return (
      <div className="multi-step-loader-container">
        <div className="loader-card">
          <div className="loader-logo-container">
            <img src="/logo.png" alt="Akash Blowers" className="loader-logo-img" />
          </div>
          
          <h2 className="loader-title">Akash AI Platform</h2>
          <p className="loader-subtitle">Loading system modules & neural agents</p>
          
          <div className="steps-list">
            {loaderSteps.map((step, idx) => {
              const isDone = idx < currentStepIndex;
              const isActive = idx === currentStepIndex;
              return (
                <div key={step.id} className={`step-item ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`}>
                  <div className="step-indicator">
                    {isDone ? (
                      <svg className="checkmark-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : isActive ? (
                      <div className="pulse-ring"></div>
                    ) : (
                      <div className="pending-circle"></div>
                    )}
                  </div>
                  <span className="step-text">{step.text}</span>
                </div>
              );
            })}
          </div>
          
          <div className="loader-progress-bar-bg">
            <div 
              className="loader-progress-bar-fill"
              style={{ width: `${((currentStepIndex + 1) / loaderSteps.length) * 100}%` }}
            ></div>
          </div>
        </div>

        <style>{`
          .multi-step-loader-container {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            width: 100vw;
            background: radial-gradient(circle at center, #1e1e24 0%, #111115 100%);
            color: #ffffff;
            font-family: 'Inter', sans-serif;
            overflow: hidden;
            position: fixed;
            top: 0;
            left: 0;
            z-index: 9999;
          }

          .loader-card {
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 20px;
            padding: 40px 48px;
            width: 440px;
            box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
            display: flex;
            flex-direction: column;
            align-items: center;
            animation: fadeInScale 0.6s cubic-bezier(0.16, 1, 0.3, 1);
          }

          .loader-logo-container {
            width: 72px;
            height: 72px;
            border-radius: 18px;
            background: rgba(255, 255, 255, 0.05);
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          }

          .loader-logo-img {
            width: 48px;
            height: 48px;
            object-fit: contain;
          }

          .loader-title {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: 0.5px;
            margin: 0 0 6px 0;
            color: #ffffff;
          }

          .loader-subtitle {
            font-size: 13px;
            color: #9ca3af;
            margin: 0 0 28px 0;
            text-align: center;
          }

          .steps-list {
            width: 100%;
            display: flex;
            flex-direction: column;
            gap: 16px;
            margin-bottom: 32px;
          }

          .step-item {
            display: flex;
            align-items: center;
            gap: 14px;
            opacity: 0.4;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
          }

          .step-item.active {
            opacity: 1;
            transform: translateX(4px);
          }

          .step-item.done {
            opacity: 0.85;
          }

          .step-indicator {
            width: 20px;
            height: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          }

          .checkmark-svg {
            width: 14px;
            height: 14px;
            color: #10b981;
            animation: scaleIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
          }

          .pulse-ring {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background-color: #eb5e28;
            box-shadow: 0 0 0 0 rgba(235, 94, 40, 0.7);
            animation: ringPulse 1.2s infinite cubic-bezier(0.66, 0, 0, 1);
          }

          .pending-circle {
            width: 6px;
            height: 6px;
            border-radius: 50%;
            background-color: rgba(255, 255, 255, 0.2);
          }

          .step-text {
            font-size: 13.5px;
            font-weight: 550;
            color: #e5e7eb;
          }

          .step-item.done .step-text {
            color: #9ca3af;
            text-decoration: line-through;
            text-decoration-color: rgba(156, 163, 175, 0.3);
          }

          .step-item.active .step-text {
            color: #eb5e28;
          }

          .loader-progress-bar-bg {
            width: 100%;
            height: 4px;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 2px;
            overflow: hidden;
          }

          .loader-progress-bar-fill {
            height: 100%;
            background: linear-gradient(90deg, #eb5e28, #f4a261);
            border-radius: 2px;
            transition: width 0.7s cubic-bezier(0.4, 0, 0.2, 1);
          }

          @keyframes fadeInScale {
            from { opacity: 0; transform: scale(0.95); }
            to { opacity: 1; transform: scale(1); }
          }

          @keyframes scaleIn {
            from { opacity: 0; transform: scale(0.5); }
            to { opacity: 1; transform: scale(1); }
          }

          @keyframes ringPulse {
            0% { box-shadow: 0 0 0 0 rgba(235, 94, 40, 0.7); }
            70% { box-shadow: 0 0 0 6px rgba(235, 94, 40, 0); }
            100% { box-shadow: 0 0 0 0 rgba(235, 94, 40, 0); }
          }
        `}</style>
      </div>
    );
  }

  // Render Login view if user is not authenticated
  if (!user) {
    return (
      <div className="auth-page-container">
        {/* Floating background text */}
        <div className="bg-text bg-text-left">peace of mind,</div>
        <div className="bg-text bg-text-right">Delivered</div>

        {/* Floating Glassmorphic Pill Badges */}
        <div className="floating-badge badge-1">
          <span className="badge-dot"></span>
          AKASH BLOWERS
        </div>
        <div className="floating-badge badge-2">
          ESTD 1996
        </div>
        <div className="floating-badge badge-3">
          MD ASSISTANT
        </div>

        <div className="auth-card-wrapper" style={{ height: isRegister ? (registrationSuccess ? '320px' : (authError ? '720px' : '660px')) : (authError ? '590px' : '530px') }}>
          <div className={`auth-card-flipper ${isRegister ? 'flipped' : ''}`}>

            {/* FRONT FACE: LOGIN */}
            <div className="auth-card-front card">
              <div className="auth-logo">
                <img src="/logo.png" alt="Logo" className="auth-logo-img" />
              </div>

              <div className="auth-header">
                <h3>Welcome Back</h3>
                <p>Sign in to access company knowledge engines</p>
              </div>

              {!isRegister && authError && (
                <div className="auth-alert error">
                  {authError}
                </div>
              )}

              <form onSubmit={handleAuth} className="auth-form">
                <div className="form-group">
                  <label>Email Address</label>
                  <input
                    type="email"
                    className="input-field"
                    placeholder="ravi@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ margin: 0 }}>Password</label>
                    <button 
                      type="button" 
                      onClick={() => { setShowResetModal(true); setResetStep(1); setResetError(''); setResetSuccess(''); }}
                      style={{ background: 'none', border: 'none', color: 'var(--primary-color)', fontSize: '12px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
                    >
                      Forgot Password?
                    </button>
                  </div>
                  <input
                    type="password"
                    className="input-field"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary auth-submit-btn" disabled={authLoading}>
                  {authLoading && !isRegister ? 'Processing...' : 'Sign In'}
                </button>
              </form>

              <div className="auth-footer-toggle">
                <p>New to MD Assistant? <button onClick={() => { setIsRegister(true); setAuthError(''); }}>Create Account</button></p>
              </div>
            </div>

            {/* BACK FACE: REGISTER / SUCCESS */}
            <div className="auth-card-back card">
              {registrationSuccess ? (
                <div className="success-container">
                  <div className="success-checkmark">
                    <div className="check-icon">
                      <span className="icon-line line-tip"></span>
                      <span className="icon-line line-long"></span>
                      <div className="icon-circle"></div>
                      <div className="icon-fix"></div>
                    </div>
                  </div>
                  <h4 className="success-title">Account Created!</h4>
                  <p className="success-desc">Registration successful. Please sign in.</p>
                </div>
              ) : (
                <>
                  <div className="auth-logo">
                    <img src="/logo.png" alt="Logo" className="auth-logo-img" style={{ width: '80px', height: '80px' }} />
                  </div>

                  <div className="auth-header">
                    <h3>Create Account</h3>
                    <p>Register your profile to begin inquiry</p>
                  </div>

                  {isRegister && authError && (
                    <div className="auth-alert error">
                      {authError}
                    </div>
                  )}

                  <form onSubmit={handleAuth} className="auth-form">
                    <div className="form-group">
                      <label>Full Name</label>
                      <input
                        type="text"
                        className="input-field"
                        placeholder="e.g. Ravi Kumar"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Email Address</label>
                      <input
                        type="email"
                        className="input-field"
                        placeholder="ravi@company.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>Password</label>
                      <input
                        type="password"
                        className="input-field"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label>User Role</label>
                      <select
                        className="input-field"
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                      >
                        <option value="employee">Employee (Ask AI/MD)</option>
                        <option value="md">Managing Director (MD Queue Admin)</option>
                      </select>
                    </div>

                    <button type="submit" className="btn btn-primary auth-submit-btn" disabled={authLoading}>
                      {authLoading && isRegister ? 'Processing...' : 'Register Account'}
                    </button>
                  </form>

                  <div className="auth-footer-toggle">
                    <p>Already have an account? <button onClick={() => { setIsRegister(false); setAuthError(''); }}>Sign In</button></p>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>

        {showResetModal && (
          <div className="reset-modal-overlay">
            <div className="reset-modal-card card">
              <button 
                type="button" 
                className="reset-modal-close-btn"
                onClick={() => { setShowResetModal(false); }}
              >
                &times;
              </button>

              <div className="auth-logo">
                <img src="/logo.png" alt="Logo" className="auth-logo-img" style={{ width: '60px', height: '60px' }} />
              </div>

              <div className="auth-header">
                <h3>Reset Password</h3>
                <p>
                  {resetStep === 1 
                    ? 'Enter your email address to receive a secure OTP code' 
                    : 'Enter the 6-digit OTP code sent to your Gmail and your new password'
                  }
                </p>
              </div>

              {resetError && (
                <div className="auth-alert error" style={{ marginBottom: '10px' }}>
                  {resetError}
                </div>
              )}

              {resetSuccess && (
                <div className="auth-alert success" style={{ marginBottom: '10px' }}>
                  {resetSuccess}
                </div>
              )}

              {resetStep === 1 ? (
                <form onSubmit={handleSendResetOtp} className="auth-form">
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="email"
                      className="input-field"
                      placeholder="ravi@company.com"
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary auth-submit-btn" disabled={resetLoading}>
                    {resetLoading ? 'Sending OTP...' : 'Send Reset OTP'}
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyAndReset} className="auth-form">
                  <div className="form-group">
                    <label>One-Time Password (OTP)</label>
                    <input
                      type="text"
                      className="input-field"
                      placeholder="6-digit code"
                      maxLength={6}
                      value={resetOtp}
                      onChange={(e) => setResetOtp(e.target.value)}
                      required
                      style={{ letterSpacing: '4px', textAlign: 'center', fontSize: '18px', fontWeight: 'bold' }}
                    />
                  </div>
                  <div className="form-group">
                    <label>New Password</label>
                    <input
                      type="password"
                      className="input-field"
                      placeholder="••••••••"
                      value={resetNewPassword}
                      onChange={(e) => setResetNewPassword(e.target.value)}
                      required
                    />
                  </div>
                  <button type="submit" className="btn btn-primary auth-submit-btn" disabled={resetLoading}>
                    {resetLoading ? 'Resetting Password...' : 'Confirm Reset Password'}
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    style={{ width: '100%', marginTop: '4px' }}
                    onClick={() => setResetStep(1)}
                  >
                    Back
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        <style>{`
          .auth-page-container {
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            width: 100vw;
            /* Extremely rich and visible mesh gradient */
            background: 
              radial-gradient(circle at 10% 15%, rgba(245, 133, 51, 0.55) 0%, transparent 60%),
              radial-gradient(circle at 90% 85%, rgba(5, 35, 65, 0.48) 0%, transparent 65%),
              radial-gradient(circle at 25% 85%, rgba(99, 102, 241, 0.45) 0%, transparent 60%),
              radial-gradient(circle at 80% 15%, rgba(245, 133, 51, 0.28) 0%, transparent 55%),
              linear-gradient(135deg, #f8fafc 0%, #cbd5e1 100%);
            position: relative;
            overflow: hidden;
            font-family: var(--font-main);
          }

          /* Huge background glassmorphic texts */
          .bg-text {
            position: absolute;
            font-family: var(--font-display);
            font-size: 12vw;
            font-weight: 800;
            letter-spacing: -0.04em;
            line-height: 1;
            pointer-events: none;
            z-index: 1;
            user-select: none;
            color: rgba(5, 35, 65, 0.035);
            -webkit-text-stroke: 1.5px rgba(5, 35, 65, 0.08);
            white-space: nowrap;
          }

          .bg-text-left {
            top: 20%;
            left: -5%;
            transform: rotate(-5deg);
          }

          .bg-text-right {
            bottom: 15%;
            right: -2%;
            transform: rotate(3deg);
            -webkit-text-stroke: 1.5px rgba(245, 133, 51, 0.14);
            color: rgba(245, 133, 51, 0.02);
          }

          /* Floating glassmorphic badges */
          .floating-badge {
            position: absolute;
            padding: 8px 16px;
            background: rgba(255, 255, 255, 0.6);
            backdrop-filter: blur(8px);
            -webkit-backdrop-filter: blur(8px);
            border: 1px solid rgba(255, 255, 255, 0.5);
            border-radius: 99px;
            box-shadow: 0 10px 30px rgba(5, 35, 65, 0.05);
            font-size: 11px;
            font-weight: 600;
            color: #052341;
            letter-spacing: 0.05em;
            z-index: 2;
            pointer-events: none;
            display: flex;
            align-items: center;
            gap: 6px;
            animation: float-badge 6s infinite ease-in-out;
          }

          .badge-dot {
            width: 6px;
            height: 6px;
            background-color: #F58533;
            border-radius: 50%;
          }

          .badge-1 {
            top: 15%;
            right: 15%;
            animation-delay: 0s;
          }

          .badge-2 {
            bottom: 12%;
            left: 20%;
            animation-delay: 2s;
          }

          .badge-3 {
            bottom: 25%;
            right: 18%;
            animation-delay: 4s;
          }

          @keyframes float-badge {
            0% {
              transform: translateY(0) rotate(0deg);
            }
            50% {
              transform: translateY(-12px) rotate(1deg);
            }
            100% {
              transform: translateY(0) rotate(0deg);
            }
          }

          /* 3D Card Flip styling */
          .auth-card-wrapper {
            perspective: 1200px;
            width: 440px;
            position: relative;
            z-index: 10;
            transition: height 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }

          .auth-card-flipper {
            width: 100%;
            height: 100%;
            position: relative;
            transform-style: preserve-3d;
            transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
          }

          .auth-card-flipper.flipped {
            transform: rotateY(180deg);
          }

          .auth-card-front, .auth-card-back {
            backface-visibility: hidden;
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            padding: 30px 40px;
            border-radius: 24px;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          .auth-card-back {
            transform: rotateY(180deg);
          }

          /* Success Checkmark Animation */
          .success-container {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100%;
            text-align: center;
            animation: fadeIn 0.5s ease;
          }

          .success-title {
            font-family: var(--font-display);
            font-size: 24px;
            font-weight: 700;
            color: #052341;
            margin-top: 20px;
            margin-bottom: 8px;
          }

          .success-desc {
            font-size: 14px;
            color: var(--text-secondary);
          }

          .success-checkmark {
            width: 80px;
            height: 80px;
            margin: 0 auto;
          }

          .success-checkmark .check-icon {
            width: 80px;
            height: 80px;
            position: relative;
            border-radius: 50%;
            box-sizing: content-box;
            border: 4px solid #4caf50;
          }

          .success-checkmark .check-icon::before {
            top: 3px;
            left: -2px;
            width: 30px;
            transform-origin: 100% 50%;
            border-radius: 100px 0 0 100px;
          }

          .success-checkmark .check-icon::after {
            top: 0;
            left: 30px;
            width: 60px;
            transform-origin: 0 50%;
            border-radius: 0 100px 100px 0;
          }

          .success-checkmark .check-icon::before, .success-checkmark .check-icon::after {
            content: '';
            height: 80px;
            position: absolute;
            background: #ffffff;
            transform: rotate(-45deg);
            z-index: 1;
          }

          .success-checkmark .check-icon .icon-line {
            height: 5px;
            background-color: #4caf50;
            display: block;
            border-radius: 2px;
            position: absolute;
            z-index: 10;
          }

          .success-checkmark .check-icon .icon-line.line-tip {
            top: 46px;
            left: 14px;
            width: 25px;
            transform: rotate(45deg);
            animation: icon-line-tip 0.75s;
          }

          .success-checkmark .check-icon .icon-line.line-long {
            top: 38px;
            right: 8px;
            width: 47px;
            transform: rotate(-45deg);
            animation: icon-line-long 0.75s;
          }

          .success-checkmark .check-icon .icon-circle {
            top: -4px;
            left: -4px;
            z-index: 10;
            width: 80px;
            height: 80px;
            border-radius: 50%;
            border: 4px solid rgba(76, 175, 80, 0.5);
            box-sizing: content-box;
            position: absolute;
          }

          .success-checkmark .check-icon .icon-fix {
            top: 8px;
            left: 28px;
            width: 5px;
            height: 70px;
            position: absolute;
            z-index: 1;
            background: #ffffff;
            transform: rotate(-45deg);
          }

          @keyframes icon-line-tip {
            0% {
              width: 0;
              left: 1px;
              top: 19px;
            }
            54% {
              width: 0;
              left: 1px;
              top: 19px;
            }
            70% {
              width: 50px;
              left: -8px;
              top: 37px;
            }
            84% {
              width: 17px;
              left: 21px;
              top: 48px;
            }
            100% {
              width: 25px;
              left: 14px;
              top: 46px;
            }
          }

          @keyframes icon-line-long {
            0% {
              width: 0;
              right: 46px;
              top: 54px;
            }
            65% {
              width: 0;
              right: 46px;
              top: 54px;
            }
            84% {
              width: 55px;
              right: 0px;
              top: 35px;
            }
            100% {
              width: 47px;
              right: 8px;
              top: 38px;
            }
          }

          .auth-logo {
            display: flex;
            align-items: center;
            gap: 12px;
            justify-content: center;
          }

          .auth-logo-img {
            width: 100px;
            height: 100px;
            object-fit: contain;
          }

          .auth-header {
            text-align: center;
          }

          .auth-header h3 {
            font-family: var(--font-display);
            font-size: 22px;
            font-weight: 700;
          }

          .auth-header p {
            font-size: 13px;
            color: var(--text-secondary);
            margin-top: 6px;
          }

          .auth-alert {
            padding: 12px;
            border-radius: var(--radius-md);
            font-size: 13px;
            font-weight: 500;
            text-align: center;
          }

          .auth-alert.error {
            background-color: var(--error-light);
            color: var(--error);
            border: 1px solid rgba(239, 68, 68, 0.15);
          }

          .auth-alert.success {
            background-color: var(--success-light);
            color: var(--success);
            border: 1px solid rgba(16, 185, 129, 0.15);
          }

          .auth-form {
            display: flex;
            flex-direction: column;
            gap: 14px;
          }

          .auth-submit-btn {
            width: 100%;
            padding: 12px;
            margin-top: 8px;
          }

          .auth-footer-toggle {
            text-align: center;
            font-size: 13px;
            color: var(--text-secondary);
          }

          .auth-footer-toggle button {
            background: none;
            border: none;
            color: var(--primary-color);
            font-weight: 600;
            cursor: pointer;
          }

          .auth-footer-toggle button:hover {
            text-decoration: underline;
          }

          .dev-credentials-info {
            background-color: var(--bg-tertiary);
            padding: 14px;
            border-radius: var(--radius-md);
            border: 1px solid var(--border-color);
            font-size: 11.5px;
            color: var(--text-secondary);
            line-height: 1.6;
          }

          .dev-credentials-info code {
            background-color: var(--border-color);
            padding: 2px 4px;
            border-radius: 4px;
          }

          /* Reset Password Modal styling */
          .reset-modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(5, 35, 65, 0.4);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            animation: fadeIn 0.3s ease;
          }

          .reset-modal-card {
            width: 420px;
            background: rgba(255, 255, 255, 0.95) !important;
            border: 1px solid rgba(255, 255, 255, 0.8);
            border-radius: 24px;
            padding: 36px 40px;
            box-shadow: 0 20px 40px rgba(5, 35, 65, 0.15);
            position: relative;
            animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            display: flex;
            flex-direction: column;
            gap: 16px;
          }

          [data-theme="dark"] .reset-modal-card {
            background: rgba(5, 35, 65, 0.95) !important;
            border: 1px solid rgba(255, 255, 255, 0.08);
          }

          .reset-modal-close-btn {
            position: absolute;
            top: 20px;
            right: 20px;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            border: none;
            background: rgba(0, 0, 0, 0.05);
            color: var(--text-primary);
            font-size: 20px;
            line-height: 32px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: var(--transition-fast);
          }

          .reset-modal-close-btn:hover {
            background: rgba(0, 0, 0, 0.1);
            transform: scale(1.05);
          }

          [data-theme="dark"] .reset-modal-close-btn {
            background: rgba(255, 255, 255, 0.08);
          }
          [data-theme="dark"] .reset-modal-close-btn:hover {
            background: rgba(255, 255, 255, 0.15);
          }
        `}</style>
      </div>
    );
  }

  // Render main layout
  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        onLogout={handleLogout}
        theme={theme}
        toggleTheme={toggleTheme}
        queueCount={queueCount}
      />

      {/* Main Page Area */}
      <main className="main-content">
        {/* Top Navbar */}
        <header className="page-header">
          <div className="page-title">
            <div className="header-brand-title">
              <img src="/logo.png" alt="Logo" className="header-logo-img" />
              <h1>Akash blowers Pvt. Ltd.</h1>
            </div>
            <p>Peace of mind, Delivered.</p>
          </div>

          <div className="header-actions">
            {/* Global Search */}
            <div className="global-search-bar" style={{ display: 'none' }}>
              <Search size={16} />
              <input type="text" placeholder="Search knowledge..." />
            </div>

            <AnimatedThemeToggler variant="rectangle" theme={theme} toggleTheme={toggleTheme} />

            {/* Notification Bell Dropdown */}
            <div className="notification-bell-container">
              <button
                className={`btn-icon bell-btn ${unreadCount > 0 ? 'pulse-bell' : ''}`}
                onClick={() => setShowNotifications(!showNotifications)}
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="notif-count-badge">{unreadCount}</span>
                )}
              </button>

              {showNotifications && (
                <div className="notifications-dropdown card">
                  <div className="notif-header">
                    <h4>Notifications</h4>
                    {unreadCount > 0 && (
                      <button className="mark-all-read-btn" onClick={markAllRead}>
                        <CheckCheck size={14} />
                        <span>Mark all as read</span>
                      </button>
                    )}
                  </div>

                  <div className="notif-list">
                    {notifications.length === 0 ? (
                      <div className="notif-empty-state">No notifications yet</div>
                    ) : (
                      notifications.map(n => (
                        <div
                          key={n.id}
                          className={`notif-item ${!n.read_status ? 'unread' : ''}`}
                          onClick={() => markAsRead(n.id)}
                        >
                          <p className="notif-content">{n.content}</p>
                          <span className="notif-time">
                            {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {!n.read_status && <span className="unread-dot-indicator"></span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* User Profile display */}
            <div className="top-profile-badge">
              <User size={16} />
              <span>{user.name}</span>
            </div>
          </div>
        </header>

        {/* Content Area */}
        <div className={`tab-viewport ${activeTab === 'chat' ? 'chat-viewport' : ''}`}>
          <div style={{ display: activeTab === 'dashboard' ? 'contents' : 'none' }}>
            <Dashboard setActiveTab={setActiveTab} user={user} backendUrl={BACKEND_URL} token={token} />
          </div>
          
          <div style={{ display: activeTab === 'chat' ? 'contents' : 'none' }}>
            <DualChat user={user} backendUrl={BACKEND_URL} token={token} />
          </div>
          
          {user.role === 'md' && (
            <div style={{ display: activeTab === 'queue' ? 'contents' : 'none' }}>
              <MDQueue user={user} backendUrl={BACKEND_URL} token={token} />
            </div>
          )}
          
          {user.role === 'md' && (
            <div style={{ display: activeTab === 'whitelist' ? 'contents' : 'none' }}>
              <Whitelist user={user} backendUrl={BACKEND_URL} token={token} />
            </div>
          )}
          
          <div style={{ display: activeTab === 'knowledge' ? 'contents' : 'none' }}>
            <KnowledgeBase user={user} backendUrl={BACKEND_URL} token={token} />
          </div>
          
          <div style={{ display: activeTab === 'analytics' ? 'contents' : 'none' }}>
            <Analytics backendUrl={BACKEND_URL} token={token} />
          </div>
          
          <div style={{ display: activeTab === 'settings' ? 'contents' : 'none' }}>
            <SettingsView user={user} onLogout={handleLogout} />
          </div>
        </div>
      </main>

      <style>{`
        .tab-viewport {
          flex: 1;
          overflow-y: auto;
          background-color: var(--bg-primary);
          display: flex;
          flex-direction: column;
        }

        .chat-viewport {
          overflow: hidden;
        }

        .header-brand-title {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-logo-img {
          width: 32px;
          height: 32px;
          object-fit: contain;
        }

        .notification-bell-container {
          position: relative;
        }

        .bell-btn {
          position: relative;
        }

        .pulse-bell {
          animation: pulse-glowing 2s infinite;
        }

        .notif-count-badge {
          position: absolute;
          top: -2px;
          right: -2px;
          background-color: var(--error);
          color: white;
          font-size: 10px;
          font-weight: 800;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid var(--bg-secondary);
        }

        /* Notifications Dropdown */
        .notifications-dropdown {
          position: absolute;
          top: 48px;
          right: 0;
          width: 320px;
          max-height: 400px;
          display: flex;
          flex-direction: column;
          padding: 0;
          z-index: 100;
          overflow: hidden;
          animation: slideUp 0.2s ease;
          border-color: var(--border-hover);
        }

        .notif-header {
          padding: 14px 16px;
          border-bottom: 1px solid var(--border-color);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background-color: var(--bg-secondary);
        }

        .notif-header h4 {
          font-family: var(--font-display);
          font-size: 14px;
          font-weight: 700;
        }

        .mark-all-read-btn {
          background: none;
          border: none;
          color: var(--primary-color);
          font-size: 11px;
          font-weight: 600;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .mark-all-read-btn:hover {
          text-decoration: underline;
        }

        .notif-list {
          overflow-y: auto;
          flex: 1;
        }

        .notif-empty-state {
          padding: 24px;
          text-align: center;
          color: var(--text-muted);
          font-size: 13px;
        }

        .notif-item {
          padding: 12px 16px;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
          position: relative;
          transition: var(--transition-fast);
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .notif-item:hover {
          background-color: var(--bg-tertiary);
        }

        .notif-item.unread {
          background-color: var(--primary-light);
        }

        .notif-content {
          font-size: 12px;
          line-height: 1.4;
          color: var(--text-primary);
          padding-right: 12px;
        }

        .notif-time {
          font-size: 10px;
          color: var(--text-muted);
        }

        .unread-dot-indicator {
          position: absolute;
          right: 16px;
          top: 18px;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background-color: var(--primary-color);
        }

        .top-profile-badge {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background-color: var(--bg-tertiary);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}

// Local Inline Settings View
function SettingsView({ user, onLogout }) {
  return (
    <div className="settings-panel card" style={{ margin: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '700' }}>Account Settings</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>View and manage your account configurations</p>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>Full Name</span>
          <span style={{ fontSize: '14px', fontWeight: '700' }}>{user.name}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>Email Address</span>
          <span style={{ fontSize: '14px', fontWeight: '700' }}>{user.email}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>Account Role</span>
          <span style={{ display: 'inline-flex' }}><span className="badge badge-secondary">{user.role}</span></span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '150px 1fr', alignItems: 'center' }}>
          <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>System Type</span>
          <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Supabase pgvector / SQLite auto-adaptive</span>
        </div>
      </div>

      <div style={{ marginTop: '20px', borderTop: '1px solid var(--border-color)', paddingTop: '20px' }}>
        <button className="btn btn-secondary" onClick={onLogout} style={{ borderColor: 'var(--error)', color: 'var(--error)' }}>
          Log Out Profile
        </button>
      </div>
    </div>
  );
}
