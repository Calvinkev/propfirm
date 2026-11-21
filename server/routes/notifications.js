import express from 'express';
import pool from '../config/database.js';
import { auth, adminOnly } from '../middleware/auth.js';

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

router.put('/:id/read', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureTable();
    const [result] = await pool.query(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureTable();
    const [result] = await pool.query(
      'DELETE FROM notifications WHERE id = ? AND user_id = ?',
      [req.params.id, userId]
    );
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

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

router.post('/admin/send', auth, adminOnly, async (req, res) => {
  try {
    const { userId, all, type = 'info', title, message, link } = req.body;
    const cleanTitle = typeof title === 'string' ? title.trim() : '';
    const cleanMessage = typeof message === 'string' ? message.trim() : '';
    const cleanType = ['info', 'success', 'warning', 'error'].includes(type) ? type : 'info';

    if (!cleanTitle || !cleanMessage) {
      return res.status(400).json({ error: 'Title and message are required' });
    }
    if (cleanTitle.length > 255) return res.status(400).json({ error: 'Title is too long' });

    await ensureTable();

    if (all === true) {
      const [users] = await pool.query("SELECT id FROM users WHERE role = 'user'");
      if (!users.length) return res.json({ message: 'Notification sent to 0 users' });
      const conn = await pool.getConnection();
      try {
        await conn.beginTransaction();
        await conn.query(
          'INSERT INTO notifications (user_id, type, title, message, link) SELECT id, ?, ?, ?, ? FROM users WHERE role = ?',
          [cleanType, cleanTitle, cleanMessage, link || null, 'user']
        );
        await conn.commit();
      } catch (err) {
        await conn.rollback();
        throw err;
      } finally {
        conn.release();
      }
      return res.json({ message: `Notification sent to ${users.length} users` });
    }

    const numericUserId = Number(userId);
    if (!Number.isInteger(numericUserId) || numericUserId <= 0) {
      return res.status(400).json({ error: 'A valid userId or all=true is required' });
    }
    const [users] = await pool.query('SELECT id FROM users WHERE id = ? AND role = ?', [numericUserId, 'user']);
    if (!users.length) return res.status(404).json({ error: 'User not found' });

    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, link) VALUES (?,?,?,?,?)',
      [numericUserId, cleanType, cleanTitle, cleanMessage, link || null]
    );
    res.json({ message: 'Notification sent' });
  } catch (err) {
    console.error('Admin send notification error:', err);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

export default router;
