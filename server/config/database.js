import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';

dotenv.config();

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'stakeup',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Initialize database tables
export const initDatabase = async () => {
  try {
    const connection = await pool.getConnection();

    // Create users table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        first_name VARCHAR(100) NOT NULL,
        last_name VARCHAR(100) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    // Add role column to existing users table if it doesn't exist
    await connection.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'
    `).catch(() => {
      // Column may already exist, ignore error
    });

    // Create accounts table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        account_id VARCHAR(20) UNIQUE NOT NULL,
        account_size INT NOT NULL,
        account_type VARCHAR(50) NOT NULL,
        phase INT DEFAULT 1,
        balance DECIMAL(10, 2) NOT NULL,
        equity DECIMAL(10, 2) NOT NULL,
        profit_target DECIMAL(5, 2) NOT NULL,
        max_daily_loss DECIMAL(5, 2) NOT NULL,
        max_drawdown DECIMAL(5, 2) NOT NULL,
        daily_loss_used DECIMAL(5, 2) DEFAULT 0,
        max_drawdown_used DECIMAL(5, 2) DEFAULT 0,
        trading_days INT DEFAULT 0,
        status VARCHAR(50) DEFAULT 'Active',
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        end_date TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create trades table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS trades (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        symbol VARCHAR(20) NOT NULL,
        side VARCHAR(10) NOT NULL,
        size DECIMAL(10, 4) NOT NULL,
        entry_price DECIMAL(10, 5) NOT NULL,
        exit_price DECIMAL(10, 5),
        pnl DECIMAL(10, 2),
        status VARCHAR(20) DEFAULT 'Open',
        opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // Create challenge_progress table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS challenge_progress (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        current_profit DECIMAL(5, 2) DEFAULT 0,
        profit_target DECIMAL(5, 2) NOT NULL,
        daily_loss_limit DECIMAL(5, 2) NOT NULL,
        daily_loss_used DECIMAL(5, 2) DEFAULT 0,
        max_drawdown_limit DECIMAL(5, 2) NOT NULL,
        max_drawdown_used DECIMAL(5, 2) DEFAULT 0,
        trading_days_required INT DEFAULT 5,
        trading_days_completed INT DEFAULT 0,
        last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // Create payouts table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS payouts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        account_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        gross_profit DECIMAL(15, 2) DEFAULT 0,
        profit_split_pct DECIMAL(5, 2) DEFAULT 80.00,
        method VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        request_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_date TIMESTAMP NULL,
        transaction_id VARCHAR(255),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // Add new payout columns for existing databases
    await connection.query(`ALTER TABLE payouts ADD COLUMN IF NOT EXISTS gross_profit DECIMAL(15,2) DEFAULT 0`).catch(() => { });
    await connection.query(`ALTER TABLE payouts ADD COLUMN IF NOT EXISTS profit_split_pct DECIMAL(5,2) DEFAULT 80.00`).catch(() => { });

    // MT5 connections — links a stakeup account to a real MT5 account via MetaApi
    await connection.query(`
      CREATE TABLE IF NOT EXISTS mt5_connections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL UNIQUE,
        user_id INT NOT NULL,
        metaapi_account_id VARCHAR(255),
        mt5_login VARCHAR(100) NOT NULL,
        mt5_server VARCHAR(255) NOT NULL,
        broker_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'connecting',
        balance DECIMAL(15,2),
        equity DECIMAL(15,2),
        margin DECIMAL(15,2),
        free_margin DECIMAL(15,2),
        profit DECIMAL(15,2),
        currency VARCHAR(10),
        leverage INT,
        last_synced TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // EA API keys — one key per challenge account, used by the MQL5 EA
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ea_api_keys (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL UNIQUE,
        user_id INT NOT NULL,
        api_key VARCHAR(64) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // EA positions snapshot
    await connection.query(`
      CREATE TABLE IF NOT EXISTS ea_positions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        ticket BIGINT NOT NULL,
        symbol VARCHAR(20),
        type VARCHAR(10),
        volume DECIMAL(10,2),
        open_price DECIMAL(15,5),
        current_price DECIMAL(15,5),
        profit DECIMAL(15,2),
        open_time DATETIME,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY unique_position (account_id, ticket),
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // ── DEMO TRADING TABLES ──────────────────────────────────────────────

    // demo_accounts: virtual money accounts, separate from challenge accounts
    await connection.query(`
      CREATE TABLE IF NOT EXISTS demo_accounts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        balance DECIMAL(15, 2) NOT NULL DEFAULT 10000.00,
        equity DECIMAL(15, 2) NOT NULL DEFAULT 10000.00,
        currency VARCHAR(10) NOT NULL DEFAULT 'USD',
        leverage INT NOT NULL DEFAULT 100,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // instruments: tradable symbols (forex, crypto, indices)
    await connection.query(`
      CREATE TABLE IF NOT EXISTS instruments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        symbol VARCHAR(20) NOT NULL UNIQUE,
        display_name VARCHAR(100) NOT NULL,
        category ENUM('forex', 'crypto', 'indices') NOT NULL,
        pip_size DECIMAL(10, 8) NOT NULL DEFAULT 0.00010000,
        contract_size DECIMAL(15, 2) NOT NULL DEFAULT 100000.00,
        spread_pips DECIMAL(8, 4) NOT NULL DEFAULT 1.0000,
        is_active TINYINT(1) NOT NULL DEFAULT 1
      )
    `);

    // price_ticks: high-write table — indexed on instrument_id + timestamp
    // Old rows are prunable: run DELETE FROM price_ticks WHERE timestamp < DATE_SUB(NOW(), INTERVAL 7 DAY)
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

    // orders: pending/filled/cancelled orders
    await connection.query(`
      CREATE TABLE IF NOT EXISTS demo_orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        instrument_id INT NOT NULL,
        order_type ENUM('market', 'limit', 'stop') NOT NULL DEFAULT 'market',
        direction ENUM('buy', 'sell') NOT NULL,
        lots DECIMAL(10, 4) NOT NULL,
        requested_price DECIMAL(18, 8),
        status ENUM('pending', 'filled', 'cancelled') NOT NULL DEFAULT 'pending',
        sl DECIMAL(18, 8),
        tp DECIMAL(18, 8),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        filled_at TIMESTAMP NULL,
        FOREIGN KEY (account_id) REFERENCES demo_accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
      )
    `);

    // positions: open and closed demo trades
    await connection.query(`
      CREATE TABLE IF NOT EXISTS demo_positions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        instrument_id INT NOT NULL,
        direction ENUM('buy', 'sell') NOT NULL,
        lots DECIMAL(10, 4) NOT NULL,
        open_price DECIMAL(18, 8) NOT NULL,
        sl DECIMAL(18, 8),
        tp DECIMAL(18, 8),
        status ENUM('open', 'closed') NOT NULL DEFAULT 'open',
        close_price DECIMAL(18, 8),
        profit DECIMAL(15, 2),
        opened_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        closed_at TIMESTAMP NULL,
        FOREIGN KEY (account_id) REFERENCES demo_accounts(id) ON DELETE CASCADE,
        FOREIGN KEY (instrument_id) REFERENCES instruments(id) ON DELETE CASCADE
      )
    `);

    // account_snapshots: periodic balance/equity snapshots for equity curve
    await connection.query(`
      CREATE TABLE IF NOT EXISTS account_snapshots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        account_id INT NOT NULL,
        balance DECIMAL(15, 2) NOT NULL,
        equity DECIMAL(15, 2) NOT NULL,
        margin_used DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        free_margin DECIMAL(15, 2) NOT NULL DEFAULT 0.00,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_account_snapshot (account_id, timestamp),
        FOREIGN KEY (account_id) REFERENCES demo_accounts(id) ON DELETE CASCADE
      )
    `);

    // Seed default instruments (BTCUSD, ETHUSD for MVP; easy to extend later)
    await connection.query(`
      INSERT IGNORE INTO instruments (symbol, display_name, category, pip_size, contract_size, spread_pips) VALUES
        ('BTCUSD', 'Bitcoin / US Dollar',  'crypto',  1.00000000, 1.00,    5.0000),
        ('ETHUSD', 'Ethereum / US Dollar', 'crypto',  0.01000000, 1.00,    3.0000),
        ('EURUSD', 'Euro / US Dollar',     'forex',   0.00010000, 100000.00, 1.2000),
        ('GBPUSD', 'British Pound / USD',  'forex',   0.00010000, 100000.00, 1.5000),
        ('XAUUSD', 'Gold / US Dollar',     'indices', 0.01000000, 100.00,  3.0000)
    `);

    // ── CRYPTO WALLETS & DEPOSITS TABLES ──────────────────────────────────────
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

    await connection.query(`
      CREATE TABLE IF NOT EXISTS crypto_deposits (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        account_size INT NOT NULL,
        fee_amount DECIMAL(10,2) NOT NULL,
        platform VARCHAR(50) NOT NULL DEFAULT 'MetaTrader 5',
        coin VARCHAR(20) NOT NULL,
        network VARCHAR(50) NOT NULL,
        deposit_address VARCHAR(255) NOT NULL,
        tx_hash VARCHAR(255) NOT NULL,
        status VARCHAR(20) DEFAULT 'Pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        approved_at TIMESTAMP NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Seed default crypto wallets if none exist
    const [walletsExist] = await connection.query('SELECT id FROM crypto_wallets LIMIT 1');
    if (walletsExist.length === 0) {
      await connection.query(`
        INSERT INTO crypto_wallets (symbol, network, address, instructions, is_active) VALUES
        ('USDT', 'TRC20 (Tron)', 'TX9aB47zL9mN28qR75vP31xK04wE86yU21', 'Send exact USDT amount via TRC20 network. Double check recipient address.', 1),
        ('BTC', 'Bitcoin', 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', 'Send exact BTC equivalent. Minimum 3 network confirmations required.', 1),
        ('ETH', 'ERC20 (Ethereum)', '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', 'Send ETH/USDT via Ethereum ERC20 network. Gas fees apply.', 1),
        ('SOL', 'Solana', '7xKXtg2CW87d97TXJSDpbD5jBk4nKzW3dZ2WjK1p9yZ', 'Send SOL via Solana network. Instant processing.', 1)
      `);
    }

    // Seed default admin account
    const [adminExists] = await connection.query('SELECT id FROM users WHERE email = ?', ['admin@stakeup.com']);
    if (adminExists.length === 0) {
      const defaultAdminPass = await bcrypt.hash('admin123', 10);
      await connection.query(
        'INSERT INTO users (email, password, first_name, last_name, role) VALUES (?, ?, ?, ?, ?)',
        ['admin@stakeup.com', defaultAdminPass, 'Admin', 'User', 'admin']
      );
    }

    connection.release();
    console.log('Database tables initialized');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
};

export default pool;
