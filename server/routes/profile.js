import express from 'express';
import pool from '../config/database.js';
import bcrypt from 'bcryptjs';
import { auth } from '../middleware/auth.js';

const router = express.Router();
let profileSchemaReady;

// Referral fields are optional on older installations. Initialize the column
// once so profile reads work both before and after the referral feature rollout.
async function ensureProfileSchema() {
  if (!profileSchemaReady) {
    profileSchemaReady = pool.query(
      'ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) UNIQUE'
    ).catch((err) => {
      if (err.code !== 'ER_DUP_FIELDNAME' && err.errno !== 1060) {
        profileSchemaReady = null;
        throw err;
      }
    });
  }
  await profileSchemaReady;
}

// GET /api/profile — current user information, wallet balances, and activity.
router.get('/', auth, async (req, res) => {
  try {
    await ensureProfileSchema();
    const userId = req.user.id || req.user.userId;
    const [users] = await pool.query(
      'SELECT id, email, first_name, last_name, role, created_at, referral_code FROM users WHERE id = ?',
      [userId]
    );
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const u = users[0];

    const [[stats]] = await pool.query(
      `SELECT COUNT(*) AS total_trades,
              COALESCE(SUM(CASE WHEN ct.side = 'BUY' THEN 1 ELSE 0 END), 0) AS buys,
              COALESCE(SUM(CASE WHEN ct.side = 'SELL' THEN 1 ELSE 0 END), 0) AS sells,
              COALESCE(SUM(ct.amount * ct.price), 0) AS total_volume,
              COALESCE(SUM(ct.fee), 0) AS total_fees
       FROM crypto_trades ct WHERE ct.user_id = ?`,
      [userId]
    );

    const [[balances], [activity]] = await Promise.all([
      pool.query(
        'SELECT asset, free, locked FROM user_balances WHERE user_id = ? ORDER BY asset',
        [userId]
      ),
      pool.query(
        `SELECT
           (SELECT COUNT(*) FROM crypto_deposits WHERE user_id = ?) AS deposits,
           (SELECT COUNT(*) FROM crypto_withdrawals WHERE user_id = ?) AS withdrawals,
           (SELECT COUNT(*) FROM crypto_orders WHERE user_id = ?) AS spot_orders`,
        [userId, userId, userId]
      ),
    ]);

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
      stats,
      balances,
      activity: activity[0],
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
    const firstName = typeof req.body.firstName === 'string' ? req.body.firstName.trim() : '';
    const lastName = typeof req.body.lastName === 'string' ? req.body.lastName.trim() : '';
    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'First and last name are required' });
    }
    await pool.query(
      'UPDATE users SET first_name = ?, last_name = ? WHERE id = ?',
      [firstName, lastName, userId]
    );
    res.json({ message: 'Profile updated successfully', user: { firstName, lastName } });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /api/profile/change-password
router.put('/change-password', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { currentPassword, newPassword } = req.body;

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both current and new password are required' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const [users] = await pool.query('SELECT password FROM users WHERE id = ?', [userId]);
    if (!users.length) return res.status(404).json({ error: 'User not found' });
    const isMatch = await bcrypt.compare(currentPassword, users[0].password);
    if (!isMatch) return res.status(400).json({ error: 'Current password is incorrect' });

    const hashed = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password = ? WHERE id = ?', [hashed, userId]);
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Password change error:', err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

export default router;
