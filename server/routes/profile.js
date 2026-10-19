import express from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// GET /api/profile
router.get('/', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const [users] = await pool.query(
      'SELECT id, email, first_name, last_name, role, created_at, referral_code FROM users WHERE id = ?',
      [userId]
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const u = users[0];

    // Trade stats
    const [stats] = await pool.query(
      `SELECT COUNT(*) as total_trades,
              SUM(CASE WHEN ct.side='BUY' THEN 1 ELSE 0 END) as buys,
              SUM(ct.amount * ct.price) as total_volume,
              SUM(ct.fee) as total_fees
       FROM crypto_trades ct WHERE ct.user_id = ?`,
      [userId]
    );

    res.json({
      user: {
        id: u.id,
        email: u.email,
        firstName: u.first_name,
        lastName: u.last_name,
        role: u.role,
        createdAt: u.created_at,
        referralCode: u.referral_code,
      },
      stats: stats[0],
    });
  } catch (err) {
    console.error('Profile fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /api/profile/update
router.put('/update', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { firstName, lastName } = req.body;
    if (!firstName?.trim() || !lastName?.trim()) {
      return res.status(400).json({ error: 'First and last name are required' });
    }
    await pool.query(
      'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
      [firstName.trim(), lastName.trim(), userId]
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/profile/change-password
router.put('/change-password', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
    const isMatch = await bcrypt.compare(currentPassword, users[0].password);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
