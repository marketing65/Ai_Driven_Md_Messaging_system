import express from 'express';
import { query, isSqlite } from '../config/db.js';
import { authenticateToken, authorizeRole } from '../middleware/auth.js';
import { addQuestionToKnowledgeBase, searchSimilarKnowledge } from '../services/openai.js';

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

    if (io) {
      io.to(userId.toString()).emit('new_notification', notification);
    }
  } catch (err) {
    console.error('Error saving notification:', err.message);
  }
}

// 1. GET Questions list (with filters)
router.get('/', authenticateToken, async (req, res) => {
  const { status, priority, sort = 'desc' } = req.query;
  const userId = req.user.id;
  const role = req.user.role;

  let queryText = `
    SELECT q.*, u.name as employee_name, u.email as employee_email 
    FROM questions q
    JOIN users u ON q.user_id = u.id
    WHERE 1=1
  `;
  const params = [];
  let paramIndex = 1;

  // RLS logic
  if (role !== 'md') {
    queryText += ` AND q.user_id = $${paramIndex++}`;
    params.push(userId);
  }

  if (status) {
    queryText += ` AND q.status = $${paramIndex++}`;
    params.push(status);
  }

  if (priority) {
    queryText += ` AND q.priority = $${paramIndex++}`;
    params.push(priority);
  }

  const orderDirection = sort.toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  queryText += ` ORDER BY q.created_at ${orderDirection}`;

  try {
    const result = await query(queryText, params);
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch questions error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve questions' });
  }
});

// 2. GET AI Suggestion for a specific question (MD typing assistant)
router.get('/:id/suggest', authenticateToken, authorizeRole(['md']), async (req, res) => {
  const { id } = req.params;

  try {
    const questionRes = await query('SELECT question_normalized FROM questions WHERE id = $1', [id]);
    if (questionRes.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const normQ = questionRes.rows[0].question_normalized;
    const matches = await searchSimilarKnowledge(normQ, 2);

    if (matches.length > 0 && matches[0].similarity > 0.75) {
      res.json({
        suggestion: matches[0].answer,
        confidence: matches[0].similarity,
        sourceQuestion: matches[0].question
      });
    } else {
      res.json({
        suggestion: null,
        message: 'No close knowledge matches found to generate a suggestion'
      });
    }
  } catch (err) {
    console.error('Fetch AI suggestion error:', err.message);
    res.status(500).json({ error: 'Failed to generate suggestion' });
  }
});

// 3. POST Reply to a Question (MD action)
router.post('/:id/reply', authenticateToken, authorizeRole(['md']), async (req, res) => {
  const { id } = req.params;
  const { answer } = req.body;

  if (!answer || answer.trim() === '') {
    return res.status(400).json({ error: 'Answer cannot be empty' });
  }

  try {
    // 1. Fetch original question and user_id
    const qRes = await query('SELECT * FROM questions WHERE id = $1', [id]);
    if (qRes.rows.length === 0) {
      return res.status(404).json({ error: 'Question not found' });
    }

    const question = qRes.rows[0];

    // 2. Update question status, answer, and timestamp
    const now = new Date();
    await query(
      'UPDATE questions SET answer = $1, status = $2, answered_at = $3 WHERE id = $4',
      [answer, 'answered', now, id]
    );

    // 3. Log MD response message in messages (Chat History)
    const chatSessionId = `md-${question.user_id}`;
    const msgId = isSqlite ? `msg-${Date.now()}` : undefined;
    
    if (isSqlite) {
      await query(
        'INSERT INTO messages (id, chat_id, sender, message, type) VALUES ($1, $2, $3, $4, $5)',
        [msgId, chatSessionId, 'md', answer, 'text']
      );
    } else {
      await query(
        'INSERT INTO messages (chat_id, sender, message, type) VALUES ($1, $2, $3, $4)',
        [chatSessionId, 'md', answer, 'text']
      );
    }

    // 4. Notify Employee via DB Notification and Socket
    const io = req.app.get('socketio');
    await createNotification(
      io,
      question.user_id,
      `Your question "${question.question_normalized.substring(0, 40)}..." has been answered by the MD.`
    );

    // 5. Update RAG Knowledge Base asynchronously
    // Using original (or normalized) question and MD answer
    addQuestionToKnowledgeBase(question.question_normalized, answer)
      .then(() => console.log('Successfully added answered question to Knowledge Base (RAG)'))
      .catch((e) => console.error('Failed to index answered question to RAG:', e.message));

    // Emit live socket event to notify other clients about queue resolution
    if (io) {
      io.to('md-group').emit('queue_item_updated', { id, status: 'answered', answer, answered_at: now });
    }

    res.json({ message: 'Reply submitted successfully', answered_at: now });
  } catch (err) {
    console.error('Submit MD reply error:', err.message);
    res.status(500).json({ error: 'Failed to submit reply' });
  }
});

export default router;
