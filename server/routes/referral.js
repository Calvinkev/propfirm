import express from 'express';
import pool from '../config/database.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

async function ensureReferralTables() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referrals (
      id INT AUTO_INCREMENT PRIMARY KEY,
      referrer_id INT NOT NULL,
      referred_id INT NOT NULL,
      status ENUM('pending','active') DEFAULT 'pending',
      commission_earned DECIMAL(18,8) NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY unique_referred (referred_id),
      FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS referral_commissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      referrer_id INT NOT NULL,
      referred_id INT NOT NULL,
      trade_id INT,
      amount DECIMAL(18,8) NOT NULL,
      asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  // Add referral_code column to users if not exists
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN referral_code VARCHAR(20) UNIQUE`);
  } catch (_) {}
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN referred_by VARCHAR(20) DEFAULT NULL`);
  } catch (_) {}
}

function generateCode(userId) {
  return 'STK' + userId.toString().padStart(4, '0') + Math.random().toString(36).slice(2, 5).toUpperCase();
}

// GET /api/referral/info
router.get('/info', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    await ensureReferralTables();

    // Ensure user has a referral code
    const [users] = await pool.query('SELECT referral_code FROM users WHERE id = ?', [userId]);
    let code = users[0]?.referral_code;
    if (!code) {
      code = generateCode(userId);
      await pool.query('UPDATE users SET referral_code = ? WHERE id = ?', [code, userId]);
    }

    const [refs] = await pool.query(
      `SELECT r.*, u.first_name, u.last_name, u.email, u.created_at as joined_at
       FROM referrals r JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = ? ORDER BY r.created_at DESC`,
      [userId]
    );

    const [commissions] = await pool.query(
      `SELECT SUM(amount) as total FROM referral_commissions WHERE referrer_id = ?`,
      [userId]
    );

    const [recent] = await pool.query(
      `SELECT * FROM referral_commissions WHERE referrer_id = ? ORDER BY created_at DESC LIMIT 20`,
      [userId]
    );

    res.json({
      referralCode: code,
      referralLink: `https://stakeup.com/register?ref=${code}`,
      totalReferrals: refs.length,
      activeReferrals: refs.filter(r => r.status === 'active').length,
      totalCommission: parseFloat(commissions[0]?.total || 0).toFixed(4),
      referrals: refs,
      recentCommissions: recent,
    });
  } catch (err) {
    console.error('Referral info error:', err);
    res.status(500).json({ error: 'Failed to fetch referral info' });
  }
});

// POST /api/referral/apply  — apply a referral code at registration
router.post('/apply', auth, async (req, res) => {
  try {
    const userId = req.user.id || req.user.userId;
    const { code } = req.body;
    await ensureReferralTables();

    if (!code) return res.status(400).json({ error: 'Code is required' });

    const [referrers] = await pool.query('SELECT id FROM users WHERE referral_code = ?', [code]);
    if (!referrers.length) return res.status(404).json({ error: 'Invalid referral code' });

    const referrerId = referrers[0].id;
    if (referrerId === userId) return res.status(400).json({ error: 'Cannot use your own referral code' });

    const [existing] = await pool.query('SELECT id FROM referrals WHERE referred_id = ?', [userId]);
    if (existing.length) return res.status(400).json({ error: 'Referral code already applied' });

    await pool.query(
      'INSERT INTO referrals (referrer_id, referred_id, status) VALUES (?,?,?)',
      [referrerId, userId, 'active']
    );
    await pool.query('UPDATE users SET referred_by = ? WHERE id = ?', [code, userId]);

    res.json({ message: 'Referral code applied successfully' });
  } catch (err) {
    console.error('Apply referral error:', err);
    res.status(500).json({ error: 'Failed to apply referral code' });
  }
});

export default router;
