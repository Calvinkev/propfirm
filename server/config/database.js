import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stakeup',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export const initDatabase = async () => {
  try {
    const connection = await pool.getConnection();
    console.log('Database connected successfully');

    // ── CORE USERS TABLE ──────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role ENUM('user', 'admin') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // ── CRYPTO SPOT INSTRUMENTS ───────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS instruments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        base_asset VARCHAR(20) NOT NULL DEFAULT '',
        quote_asset VARCHAR(20) NOT NULL DEFAULT 'USDT',
        category ENUM('forex', 'crypto', 'indices') DEFAULT 'crypto',
        pip_size DECIMAL(10, 8) NOT NULL DEFAULT 0.01000000,
        contract_size DECIMAL(15, 2) NOT NULL DEFAULT 1.00,
        min_order_size DECIMAL(15, 8) NOT NULL DEFAULT 0.00010000,
        spread_pips DECIMAL(8, 4) NOT NULL DEFAULT 1.0000,
        is_active TINYINT(1) NOT NULL DEFAULT 1
      )
    `);

    // Add missing columns to instruments if upgrading from old schema
    const alterCols = [
      `ALTER TABLE instruments ADD COLUMN IF NOT EXISTS base_asset VARCHAR(20) NOT NULL DEFAULT ''`,
      `ALTER TABLE instruments ADD COLUMN IF NOT EXISTS quote_asset VARCHAR(20) NOT NULL DEFAULT 'USDT'`,
      `ALTER TABLE instruments ADD COLUMN IF NOT EXISTS min_order_size DECIMAL(15,8) NOT NULL DEFAULT 0.00010000`,
      `ALTER TABLE instruments MODIFY COLUMN contract_size DECIMAL(15,2) NOT NULL DEFAULT 1.00`,
    ];
    for (const sql of alterCols) {
      try { await connection.query(sql); } catch (_) {}
    }

    // ── PRICE TICKS TABLE ────────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS price_ticks (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        instrument_id INT NOT NULL,
        bid DECIMAL(18, 8) NOT NULL,
        ask DECIMAL(18, 8) NOT NULL,
        timestamp DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        INDEX idx_instrument_timestamp (instrument_id, timestamp),
        FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
      )
    `);

    // ── USER SPOT BALANCES TABLE ─────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_balances (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        asset VARCHAR(20) NOT NULL,
        free DECIMAL(24, 8) NOT NULL DEFAULT 0.00000000,
        locked DECIMAL(24, 8) NOT NULL DEFAULT 0.00000000,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY user_asset_unique (user_id, asset),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── CRYPTO SPOT ORDERS TABLE ─────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS crypto_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        side ENUM('BUY', 'SELL') NOT NULL,
        type ENUM('LIMIT', 'MARKET') NOT NULL DEFAULT 'LIMIT',
        price DECIMAL(18, 8) NOT NULL,
        amount DECIMAL(18, 8) NOT NULL,
        filled_amount DECIMAL(18, 8) NOT NULL DEFAULT 0.00000000,
        status ENUM('NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED') NOT NULL DEFAULT 'NEW',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── CRYPTO SPOT TRADES TABLE ─────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS crypto_trades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_id INT NOT NULL,
        user_id INT NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        side ENUM('BUY', 'SELL') NOT NULL,
        price DECIMAL(18, 8) NOT NULL,
        amount DECIMAL(18, 8) NOT NULL,
        fee DECIMAL(18, 8) NOT NULL DEFAULT 0.00000000,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES crypto_orders(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── CRYPTO DEPOSITS TABLE ────────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS crypto_deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        coin VARCHAR(20) NOT NULL,
        network VARCHAR(50) NOT NULL,
        deposit_address VARCHAR(255) NOT NULL,
        tx_hash VARCHAR(255) NOT NULL,
        amount DECIMAL(18, 8) NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── CRYPTO WITHDRAWALS TABLE ─────────────────────────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS crypto_withdrawals (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        coin VARCHAR(20) NOT NULL,
        network VARCHAR(50) NOT NULL,
        address VARCHAR(255) NOT NULL,
        amount DECIMAL(18, 8) NOT NULL,
        fee DECIMAL(18, 8) NOT NULL DEFAULT 0.00000000,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // ── CRYPTO WALLETS SETUP (DEPOSIT DESTINATIONS) ──────────────────────
    await connection.query(`
      CREATE TABLE IF NOT EXISTS crypto_wallets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL,
        network VARCHAR(50) NOT NULL,
        address VARCHAR(255) NOT NULL,
        instructions TEXT,
        is_active TINYINT(1) DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // ── SEED INITIAL CRYPTO PAIRS ────────────────────────────────────────
    await connection.query(`
      INSERT IGNORE INTO instruments (symbol, display_name, base_asset, quote_asset, pip_size, contract_size, min_order_size, spread_pips) VALUES
        ('BTCUSDT', 'BTC / USDT', 'BTC', 'USDT', 0.01000000, 1.00, 0.00010000, 0.5000),
        ('ETHUSDT', 'ETH / USDT', 'ETH', 'USDT', 0.01000000, 1.00, 0.00100000, 0.2000),
        ('SOLUSDT', 'SOL / USDT', 'SOL', 'USDT', 0.01000000, 1.00, 0.01000000, 0.0500),
        ('BNBUSDT', 'BNB / USDT', 'BNB', 'USDT', 0.01000000, 1.00, 0.01000000, 0.1000),
        ('XRPUSDT', 'XRP / USDT', 'XRP', 'USDT', 0.00010000, 1.00, 1.00000000, 0.0010),
        ('DOGEUSDT', 'DOGE / USDT', 'DOGE', 'USDT', 0.00001000, 1.00, 10.00000000, 0.0001),
        ('ADAUSDT', 'ADA / USDT', 'ADA', 'USDT', 0.00010000, 1.00, 1.00000000, 0.0010)
    `);

    // Seed default deposit wallet destinations
    const [walletsExist] = await connection.query('SELECT id FROM crypto_wallets LIMIT 1');
    if (walletsExist.length === 0) {
      await connection.query(`
        INSERT INTO crypto_wallets (symbol, network, address, instructions, is_active) VALUES
        ('USDT', 'TRC20 (Tron)', 'TX9aB47zL9mN28qR75vP31xK04wE86yU21', 'Send exact USDT amount via TRC20 network. Direct credit upon 1 block confirmation.', 1),
        ('USDT', 'ERC20 (Ethereum)', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'Send USDT via Ethereum network (ERC20).', 1),
        ('BTC', 'Bitcoin Network', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'Send BTC to this deposit address. 2 network confirmations required.', 1),
        ('ETH', 'Ethereum Network', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'Send ETH directly to your deposit address.', 1),
        ('SOL', 'Solana Network', '7xKXtg2CW87d97TXJSDpbD5jBk4nKzW3dZ2WjK1p9yZ', 'Send SOL via Solana network. Superfast processing.', 1)
      `);
    }

    // Seed default admin account
    const [adminExists] = await connection.query('SELECT id FROM users WHERE email = ?', ['admin@binance.com']);
    if (adminExists.length === 0) {
      const defaultAdminPass = await bcrypt.hash('admin123', 10);
      const [res] = await connection.query(
        'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
        ['admin@binance.com', defaultAdminPass, 'Binance', 'Admin', 'admin']
      );
      // Give initial USDT demo balance to admin
      await connection.query(
        'INSERT INTO user_balances (user_id, asset, free, locked) VALUES (?, ?, ?, ?)',
        [res.insertId, 'USDT', 100000.00, 0.00]
      );
    }

    connection.release();
    console.log('✅ Database tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing database:', error);
  }
};

export default pool;
