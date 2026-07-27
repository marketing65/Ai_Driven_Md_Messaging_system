import express from 'express';
import { query } from '../config/db.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// 1. GET Notifications for logged-in user
router.get('/', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    // Convert SQLite 0/1 to false/true boolean
    const notifications = result.rows.map(n => ({
      ...n,
      read_status: !!n.read_status
    }));
    res.json(notifications);
  } catch (err) {
    console.error('Fetch notifications error:', err.message);
    res.status(500).json({ error: 'Failed to retrieve notifications' });
  }
});

// 2. POST Mark notification as read
router.post('/:id/read', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Validate owner
    const verifyRes = await query('SELECT user_id FROM notifications WHERE id = $1', [id]);
    if (verifyRes.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    if (verifyRes.rows[0].user_id !== req.user.id) {
      return res.status(403).json({ error: 'Unauthorized to modify this notification' });
    }

    await query(
      'UPDATE notifications SET read_status = $1 WHERE id = $2',
      [true, id]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    console.error('Mark notification read error:', err.message);
    res.status(500).json({ error: 'Failed to update notification' });
  }
});

// 3. POST Mark all as read
router.post('/read-all', authenticateToken, async (req, res) => {
  try {
    await query(
      'UPDATE notifications SET read_status = $1 WHERE user_id = $2',
      [true, req.user.id]
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    console.error('Mark all notifications read error:', err.message);
    res.status(500).json({ error: 'Failed to update notifications' });
  }
});

export default router;
