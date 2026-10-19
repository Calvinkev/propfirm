import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'info',
      title VARCHAR(255) NOT NULL,
      message TEXT NOT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      link VARCHAR(255) DEFAULT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

// GET /api/notifications
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureTable();
    const [rows] = await pool.query(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    const [unread] = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [userId]
    );
    res.json({ notifications: rows, unreadCount: unread[0].count });
  } catch (err) {
    console.error('Notifications fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// PUT /api/notifications/read-all
router.put('/read-all', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureTable();
    await pool.query('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notifications as read' });
  }
});

// PUT /api/notifications/:id/read
router.put('/:id/read', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureTable();
    await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// DELETE /api/notifications/:id
router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureTable();
    await pool.query('DELETE FROM notifications WHERE id = ? AND user_id = ?', [req.params.id, userId]);
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// Helper — used internally to push a notification to a user
export async function pushNotification(userId, type, title, message, link = null) {
  try {
    await ensureTable();
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)',
      [userId, type, title, message, link]
    );
  } catch (err) {
    console.error('Push notification error:', err);
  }
}

export default router;
