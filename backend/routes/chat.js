import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, isSqlite, supabase } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';
import { processLanguagePipeline, queryRAG } from '../services/openai.js';
import { transcribeAudio } from '../services/voice.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `voice-${Date.now()}-${file.originalname || 'audio.wav'}`)
});
const upload = multer({ storage });

const genericStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `attachment-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const uploadAttachment = multer({ storage: genericStorage });

const router = express.Router();

// Helper to push in-app notification
async function createNotification(io, userId, content) {
  const notifId = isSqlite ? `notif-${Date.now()}` : undefined;
  let notification = null;

  try {
    if (isSqlite) {
      await query(
        'INSERT INTO notifications (id, user_id, content, read_status) VALUES ($1, $2, $3, $4)',
        [notifId, userId, content, 0]
      );
      notification = { id: notifId, user_id: userId, content, read_status: false, created_at: new Date() };
    } else {
      const res = await query(
        'INSERT INTO notifications (user_id, content, read_status) VALUES ($1, $2, $3) RETURNING *',
        [userId, content, false]
      );
      notification = res.rows[0];
    }

    // Emit live socket event to user room
    if (io) {
      io.to(userId.toString()).emit('new_notification', notification);
    }
  } catch (err) {
    console.error('Error saving notification:', err.message);
  }
}

// 1. GET Chat History
router.get('/history/:chatId', authenticateToken, async (req, res) => {
  const { chatId } = req.params;
  
  // RLS Validation: Employees can only see their own chats (ai-<userId> or md-<userId>)
  // MD can see any chat
  if (req.user.role !== 'md' && !chatId.includes(req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized access to chat history' });
  }

  try {
    const messagesRes = await query(
      'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
      [chatId]
    );
    res.json(messagesRes.rows);
  } catch (err) {
    console.error('Fetch chat history error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve chat history' });
  }
});

// 3. POST Schedule Message
router.post('/schedule', authenticateToken, async (req, res) => {
  const { message, chatId, sendAt } = req.body;
  
  if (req.user.role !== 'md' && !chatId.includes(req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized to schedule messages for this chat' });
  }

  const sender = req.user.role === 'md' ? 'md' : 'employee';

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }
  if (!sendAt) {
    return res.status(400).json({ error: 'Scheduled time (sendAt) is required' });
  }

  const sendDate = new Date(sendAt);
  if (isNaN(sendDate.getTime())) {
    return res.status(400).json({ error: 'Invalid date/time format for sendAt' });
  }
  if (sendDate <= new Date()) {
    return res.status(400).json({ error: 'Scheduled time must be in the future' });
  }

  try {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .insert({
        chat_id: chatId,
        sender,
        message,
        send_at: sendDate.toISOString(),
        sent: false
      })
      .select();

    if (error) throw error;
    res.json({ message: 'Message scheduled successfully', data: data[0] });
  } catch (err) {
    console.error('Schedule message error:', err.message);
    res.status(500).json({ error: 'Failed to schedule message' });
  }
});

// 4. GET Scheduled Messages for a chat
router.get('/schedule/:chatId', authenticateToken, async (req, res) => {
  const { chatId } = req.params;

  if (req.user.role !== 'md' && !chatId.includes(req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized access to scheduled messages' });
  }

  try {
    const { data, error } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('chat_id', chatId)
      .eq('sent', false)
      .order('send_at', { ascending: true });

    if (error) throw error;
    res.json(data);
  } catch (err) {
    console.error('Fetch scheduled messages error:', err.message);
    res.status(500).json({ error: 'Failed to fetch scheduled messages' });
  }
});

// 5. DELETE Scheduled Message (Cancel)
router.delete('/schedule/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: msgCheck, error: checkErr } = await supabase
      .from('scheduled_messages')
      .select('*')
      .eq('id', id);

    if (checkErr) throw checkErr;
    if (!msgCheck || msgCheck.length === 0) {
      return res.status(404).json({ error: 'Scheduled message not found' });
    }

    const msg = msgCheck[0];
    if (req.user.role !== 'md' && !msg.chat_id.includes(req.user.id)) {
      return res.status(403).json({ error: 'Unauthorized to cancel this scheduled message' });
    }

    const { error: delErr } = await supabase
      .from('scheduled_messages')
      .delete()
      .eq('id', id);

    if (delErr) throw delErr;
    res.json({ message: 'Scheduled message cancelled successfully' });
  } catch (err) {
    console.error('Cancel scheduled message error:', err.message);
    res.status(500).json({ error: 'Failed to cancel scheduled message' });
  }
});

// 2. POST Ask AI (Left Chat)
router.post('/ai', authenticateToken, async (req, res) => {
  const { message, chatId } = req.body;
  const userId = req.user.id;
  const activeChatId = chatId || `ai-${userId}`;

  if (req.user.role !== 'md' && !activeChatId.includes(req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized access to this chat' });
  }

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  try {
    // 1. Log Employee Message
    const msgEmpId = isSqlite ? `msg-${Date.now()}-1` : undefined;
    if (isSqlite) {
      await query(
        'INSERT INTO messages (id, chat_id, sender, message, type) VALUES ($1, $2, $3, $4, $5)',
        [msgEmpId, activeChatId, 'employee', message, 'text']
      );
    } else {
      await query(
        'INSERT INTO messages (chat_id, sender, message, type) VALUES ($1, $2, $3, $4)',
        [activeChatId, 'employee', message, 'text']
      );
    }

    // 2. Language Pipeline & RAG Search
    const pipeline = await processLanguagePipeline(message);
    const ragResult = await queryRAG(pipeline.normalized);

    // 3. Save RAG / AI Answer to messages
    const msgAiId = isSqlite ? `msg-${Date.now()}-2` : undefined;
    let finalAnswer = ragResult.answer;
    
    // Add confidence scoring and sources count to AI response if reliable
    if (ragResult.isReliable) {
      finalAnswer += `\n\n[Confidence: ${(ragResult.confidence * 100).toFixed(0)}% | Based on ${ragResult.sourcesCount} past answers]`;
    }

    if (isSqlite) {
      await query(
        'INSERT INTO messages (id, chat_id, sender, message, type) VALUES ($1, $2, $3, $4, $5)',
        [msgAiId, activeChatId, 'ai', finalAnswer, 'text']
      );
    } else {
      await query(
        'INSERT INTO messages (chat_id, sender, message, type) VALUES ($1, $2, $3, $4)',
        [activeChatId, 'ai', finalAnswer, 'text']
      );
    }

    res.json({
      message: finalAnswer,
      normalized: pipeline.normalized,
      original: message,
      language: pipeline.language,
      isReliable: ragResult.isReliable,
      confidence: ragResult.confidence
    });
  } catch (err) {
    console.error('AI Chat error:', err.message);
    res.status(500).json({ error: 'AI processing failed' });
  }
});

// 3. POST Ask MD / Submit to Queue (Right Chat)
router.post('/md', authenticateToken, async (req, res) => {
  const { message, chatId, priority = 'medium' } = req.body;
  const userId = req.user.id;
  const activeChatId = chatId || `md-${userId}`;

  if (req.user.role !== 'md' && !activeChatId.includes(req.user.id)) {
    return res.status(403).json({ error: 'Unauthorized access to this chat' });
  }

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Message cannot be empty' });
  }

  try {
    // 1. Log Employee Message
    const msgEmpId = isSqlite ? `msg-${Date.now()}-1` : undefined;
    if (isSqlite) {
      await query(
        'INSERT INTO messages (id, chat_id, sender, message, type) VALUES ($1, $2, $3, $4, $5)',
        [msgEmpId, activeChatId, 'employee', message, 'text']
      );
    } else {
      await query(
        'INSERT INTO messages (chat_id, sender, message, type) VALUES ($1, $2, $3, $4)',
        [activeChatId, 'employee', message, 'text']
      );
    }

    // Check if there is an active pending MD-to-user question for this employee
    const pendingMDQ = await query(
      "SELECT * FROM questions WHERE user_id = $1 AND status = 'pending' AND question_original LIKE '[MD_QUESTION_TO_USER:%'",
      [userId]
    );

    const io = req.app.get('socketio');

    if (pendingMDQ.rows.length > 0) {
      const targetQ = pendingMDQ.rows[0];
      // Mark it as answered and save the employee's message as the answer!
      await query(
        "UPDATE questions SET answer = $1, status = 'answered', answered_at = $2 WHERE id = $3",
        [message, new Date(), targetQ.id]
      );

      // Log system acknowledgement in messages
      const systemAck = "Your reply has been registered and MD has been notified.";
      const msgSysId = isSqlite ? `msg-${Date.now()}-2` : undefined;
      if (isSqlite) {
        await query(
          'INSERT INTO messages (id, chat_id, sender, message, type) VALUES ($1, $2, $3, $4, $5)',
          [msgSysId, activeChatId, 'md', systemAck, 'text']
        );
      } else {
        await query(
          'INSERT INTO messages (chat_id, sender, message, type) VALUES ($1, $2, $3, $4)',
          [activeChatId, 'md', systemAck, 'text']
        );
      }

      // Notify MD
      const mdUsers = await query("SELECT id FROM users WHERE role = 'md'");
      const cleanQText = targetQ.question_original.replace(/\[MD_QUESTION_TO_USER:.*?\]\s*/, '');
      for (const md of mdUsers.rows) {
        await createNotification(io, md.id, `${req.user.name} has answered your question: "${cleanQText.substring(0, 40)}..."`);
      }

      return res.json({
        message: systemAck,
        question: { ...targetQ, status: 'answered', answer: message }
      });
    }

    // Normal Employee-to-MD question path
    const pipeline = await processLanguagePipeline(message);
    const qId = isSqlite ? `q-${Date.now()}` : undefined;
    let newQuestion = null;

    if (isSqlite) {
      await query(
        `INSERT INTO questions (id, user_id, question_original, question_normalized, status, priority) 
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [qId, userId, message, pipeline.normalized, 'pending', priority]
      );
      newQuestion = { id: qId, user_id: userId, question_original: message, question_normalized: pipeline.normalized, status: 'pending', priority, created_at: new Date() };
    } else {
      const res = await query(
        `INSERT INTO questions (user_id, question_original, question_normalized, status, priority) 
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [userId, message, pipeline.normalized, 'pending', priority]
      );
      newQuestion = res.rows[0];
    }

    const systemAck = "Your question has been added to MD's queue. You will be notified when MD replies.";
    const msgSysId = isSqlite ? `msg-${Date.now()}-2` : undefined;
    if (isSqlite) {
      await query(
        'INSERT INTO messages (id, chat_id, sender, message, type) VALUES ($1, $2, $3, $4, $5)',
        [msgSysId, activeChatId, 'md', systemAck, 'text']
      );
    } else {
      await query(
        'INSERT INTO messages (chat_id, sender, message, type) VALUES ($1, $2, $3, $4)',
        [activeChatId, 'md', systemAck, 'text']
      );
    }

    const mdUsers = await query("SELECT id FROM users WHERE role = 'md'");
    for (const md of mdUsers.rows) {
      await createNotification(io, md.id, `New pending question from ${req.user.name}: "${pipeline.normalized}"`);
    }

    // Emit live socket event to MD dashboard queue
    if (io) {
      io.to('md-group').emit('new_queue_item', newQuestion);
    }

    res.json({
      message: systemAck,
      question: newQuestion
    });

  } catch (err) {
    console.error('Ask MD error:', err.message);
    res.status(500).json({ error: 'MD Queue submission failed' });
  }
});

// ── GET /api/chat/broadcast-questions ─────────────────────────────
router.get('/broadcast-questions', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      "SELECT * FROM questions WHERE question_original LIKE '[MD_QUESTION_TO_ALL]%' ORDER BY created_at DESC"
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch broadcast questions error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve broadcast questions' });
  }
});

// ── DELETE /api/chat/broadcast/:id ──────────────────────────────────
router.delete('/broadcast/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const role = req.user.role;

  if (role !== 'md') {
    return res.status(403).json({ error: 'Only MD can delete broadcast questions' });
  }

  try {
    // 1. Verify if the question exists and is a broadcast question
    const qRes = await query('SELECT question_original FROM questions WHERE id = $1', [id]);
    if (qRes.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const questionText = qRes.rows[0].question_original;
    if (!questionText.startsWith('[MD_QUESTION_TO_ALL]')) {
      return res.status(400).json({ error: 'This question is not a broadcast question' });
    }

    // 2. Delete discussion thread messages
    const threadChatId = `md-broadcast-${id}`;
    await query('DELETE FROM messages WHERE chat_id = $1', [threadChatId]);

    // 3. Delete the question itself
    await query('DELETE FROM questions WHERE id = $1', [id]);

    // 4. Emit live socket event to notify all users to remove this broadcast
    const io = req.app.get('socketio');
    if (io) {
      io.emit('broadcast_deleted', { id });
    }

    res.json({ message: 'Broadcast question and all discussion history deleted successfully' });
  } catch (err) {
    console.error('Delete broadcast error:', err.message);
    res.status(500).json({ error: 'Failed to delete broadcast question' });
  }
});

// ── POST /api/chat/md-ask ──────────────────────────────────────────
router.post('/md-ask', authenticateToken, async (req, res) => {
  const { message, recipient } = req.body;
  const userId = req.user.id;

  if (!message || message.trim() === '') {
    return res.status(400).json({ error: 'Question content cannot be empty' });
  }

  try {
    const io = req.app.get('socketio');

    if (recipient === 'all') {
      // Broadcast to all employees
      const origQ = `[MD_QUESTION_TO_ALL] ${message}`;
      const normQ = `[MD_QUESTION_TO_ALL] ${message.toLowerCase()}`;
      
      const qId = isSqlite ? `q-${Date.now()}` : undefined;
      let newQuestion = null;

      if (isSqlite) {
        await query(
          "INSERT INTO questions (id, user_id, question_original, question_normalized, status, priority) VALUES ($1, $2, $3, $4, $5, $6)",
          [qId, userId, origQ, normQ, 'pending', 'medium']
        );
        newQuestion = { id: qId, user_id: userId, question_original: origQ, question_normalized: normQ, status: 'pending', priority: 'medium', created_at: new Date() };
      } else {
        const insertRes = await query(
          "INSERT INTO questions (user_id, question_original, question_normalized, status, priority) VALUES ($1, $2, $3, $4, $5) RETURNING *",
          [userId, origQ, normQ, 'pending', 'medium']
        );
        newQuestion = insertRes.rows[0];
      }

      // Notify all registered employees
      const employeesRes = await query("SELECT id FROM users WHERE role = 'employee'");
      for (const emp of employeesRes.rows) {
        await createNotification(io, emp.id, `MD broadcasted a group question: "${message}"`);
      }

      if (io) {
        io.emit('new_broadcast_question', newQuestion);
      }

      res.json({ message: 'Broadcast question sent to all employees successfully', question: newQuestion });

    } else {
      // Individual employee target
      const employeeId = recipient;
      const origQ = `[MD_QUESTION_TO_USER:${employeeId}] ${message}`;
      const normQ = `[MD_QUESTION_TO_USER:${employeeId}] ${message.toLowerCase()}`;

      const qId = isSqlite ? `q-${Date.now()}` : undefined;
      let newQuestion = null;

      if (isSqlite) {
        await query(
          "INSERT INTO questions (id, user_id, question_original, question_normalized, status, priority) VALUES ($1, $2, $3, $4, $5, $6)",
          [qId, employeeId, origQ, normQ, 'pending', 'medium']
        );
        newQuestion = { id: qId, user_id: employeeId, question_original: origQ, question_normalized: normQ, status: 'pending', priority: 'medium', created_at: new Date() };
      } else {
        const insertRes = await query(
          "INSERT INTO questions (user_id, question_original, question_normalized, status, priority) VALUES ($1, $2, $3, $4, $5) RETURNING *",
          [employeeId, origQ, normQ, 'pending', 'medium']
        );
        newQuestion = insertRes.rows[0];
      }

      // Append to the private chat history: chat_id = md-${employeeId}
      const chatSessionId = `md-${employeeId}`;
      const msgId = isSqlite ? `msg-${Date.now()}` : undefined;
      if (isSqlite) {
        await query(
          'INSERT INTO messages (id, chat_id, sender, message, type) VALUES ($1, $2, $3, $4, $5)',
          [msgId, chatSessionId, 'md', message, 'text']
        );
      } else {
        await query(
          'INSERT INTO messages (chat_id, sender, message, type) VALUES ($1, $2, $3, $4)',
          [chatSessionId, 'md', message, 'text']
        );
      }

      // Notify employee
      await createNotification(io, employeeId, `MD asked you: "${message}"`);

      res.json({ message: `Question sent to selected employee successfully`, question: newQuestion });
    }
  } catch (err) {
    console.error('MD Ask error:', err.message);
    res.status(500).json({ error: 'MD question submission failed' });
  }
});

// ── POST /api/chat/answer-md-question ──────────────────────────────
router.post('/answer-md-question', authenticateToken, async (req, res) => {
  const { questionId, answer } = req.body;
  const employeeId = req.user.id;
  const employeeName = req.user.name;

  if (!questionId || !answer || answer.trim() === '') {
    return res.status(400).json({ error: 'Question ID and answer content are required' });
  }

  try {
    // 1. Fetch the broadcast question
    const qRes = await query("SELECT * FROM questions WHERE id = $1", [questionId]);
    if (qRes.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }
    const question = qRes.rows[0];

    // 2. Insert message in the broadcast chat room: chat_id = md-broadcast-${questionId}
    const broadcastChatId = `md-broadcast-${questionId}`;
    const formattedMsg = `${employeeName}: ${answer}`;
    
    const msgId = isSqlite ? `msg-${Date.now()}` : undefined;
    if (isSqlite) {
      await query(
        'INSERT INTO messages (id, chat_id, sender, message, type) VALUES ($1, $2, $3, $4, $5)',
        [msgId, broadcastChatId, 'employee', formattedMsg, 'text']
      );
    } else {
      await query(
        'INSERT INTO messages (chat_id, sender, message, type) VALUES ($1, $2, $3, $4)',
        [broadcastChatId, 'employee', formattedMsg, 'text']
      );
    }

    // Mark as answered (or record answer in questions for historical RAG if first answer)
    if (!question.answer) {
      await query(
        "UPDATE questions SET answer = $1, status = 'answered', answered_at = $2 WHERE id = $3",
        [formattedMsg, new Date(), questionId]
      );
    }

    // 3. Notify MDs
    const io = req.app.get('socketio');
    const mdUsers = await query("SELECT id FROM users WHERE role = 'md'");
    const cleanQText = question.question_original.replace('[MD_QUESTION_TO_ALL] ', '');
    
    for (const md of mdUsers.rows) {
      await createNotification(io, md.id, `${employeeName} has answered the question: "${cleanQText.substring(0, 40)}..."`);
    }

    if (io) {
      io.to(broadcastChatId).emit('new_broadcast_message', {
        chat_id: broadcastChatId,
        sender: 'employee',
        message: formattedMsg,
        created_at: new Date()
      });
    }

    res.json({ message: 'Answer submitted successfully' });
  } catch (err) {
    console.error('Answer MD question error:', err.message);
    res.status(500).json({ error: 'Failed to submit answer' });
  }
});

// 4. POST Voice Input (transcribe audio and return transcribed text)
router.post('/voice', authenticateToken, upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Audio file is required' });
  }

  const filePath = req.file.path;
  try {
    // 1. Transcribe
    const transcription = await transcribeAudio(filePath);

    // 2. Clean up temporary audio file asynchronously
    fs.unlink(filePath, (err) => {
      if (err) console.error('Error removing temporary audio file:', err.message);
    });

    res.json({ text: transcription });
  } catch (err) {
    console.error('Voice transcription service error:', err.message);
    // Cleanup if transcription fails
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
    res.status(500).json({ error: 'Audio transcription failed' });
  }
});

// 5. POST Upload Attachment (save file to Supabase Storage and return URL)
router.post('/upload', authenticateToken, uploadAttachment.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'File is required' });
  }

  const tempFilePath = req.file.path;

  try {
    const fileBuffer = fs.readFileSync(tempFilePath);
    const bucketName = 'chat-attachments';

    // Ensure bucket exists in Supabase Storage
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      console.error('[Supabase Storage] List buckets error:', listError.message);
    }
    const bucketExists = buckets?.some(b => b.name === bucketName);
    if (!bucketExists) {
      console.log(`[Supabase Storage] Creating public bucket: "${bucketName}"`);
      const { error: createError } = await supabase.storage.createBucket(bucketName, {
        public: true,
        fileSizeLimit: 10485760 // 10MB
      });
      if (createError) {
        console.error('[Supabase Storage] Bucket creation error:', createError.message);
      }
    }

    // Upload file buffer to Supabase Storage
    const uniqueFilename = `${Date.now()}-${req.file.originalname}`;
    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(uniqueFilename, fileBuffer, {
        contentType: req.file.mimetype,
        duplex: 'half'
      });

    if (uploadError) {
      throw uploadError;
    }

    // Get public URL of the uploaded asset
    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(uniqueFilename);
    const publicUrl = urlData.publicUrl;

    // Delete local temporary file
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    res.json({
      url: publicUrl,
      filename: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    });
  } catch (err) {
    console.error('[Supabase Storage] File upload error:', err.message);
    // Cleanup temporary file in case of failure
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
    res.status(500).json({ error: `File upload failed: ${err.message}` });
  }
});

export default router;
