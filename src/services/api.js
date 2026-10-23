const API_BASE = '/api';

export const api = {
  // Auth Endpoints
  register: async (formData) => {
    const res = await fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData)
    });
    return res.json();
  },

  login: async (credentials) => {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials)
    });
    return res.json();
  },

  getMe: async (token) => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  // Account Endpoints
  createAccount: async (token, accountData) => {
    const res = await fetch(`${API_BASE}/accounts/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(accountData)
    });
    return res.json();
  },

  getAccount: async (token, accountId) => {
    const res = await fetch(`${API_BASE}/accounts/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  // NOTE: getAccountTrades, getTradingStats, getAccountPerformance previously
  // all hit the same /accounts/:id endpoint — consolidated to getAccount above.
  getAccountTrades: async (token, accountId) => {
    const res = await fetch(`${API_BASE}/spot/trade-history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  getCryptoWallets: async (token) => {
    const res = await fetch(`${API_BASE}/accounts/crypto-wallets`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  submitCryptoDeposit: async (token, depositData) => {
    const res = await fetch(`${API_BASE}/accounts/crypto-deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(depositData)
    });
    return res.json();
  },

  // Demo Account Endpoints
  getMyDemoAccount: async (token) => {
    const res = await fetch(`${API_BASE}/demo/account`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  getDemoPositions: async (token, accountId) => {
    const res = await fetch(`${API_BASE}/demo/positions/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  getDemoHistory: async (token, accountId) => {
    const res = await fetch(`${API_BASE}/demo/history/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  getDemoEquityCurve: async (token, accountId) => {
    const res = await fetch(`${API_BASE}/demo/equity/${accountId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  // Verify current token and return user data
  getMe: async (token) => {
    const res = await fetch(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  // ── Profile ──────────────────────────────────────────────────────────────
  getProfile: async (token) => {
    const res = await fetch(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  updateProfile: async (token, data) => {
    const res = await fetch(`${API_BASE}/profile/update`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  changePassword: async (token, data) => {
    const res = await fetch(`${API_BASE}/profile/change-password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },

  // ── Convert ───────────────────────────────────────────────────────────────
  getConvertQuote: async (token, from, to, amount) => {
    const res = await fetch(`${API_BASE}/convert/quote?from=${from}&to=${to}&amount=${amount}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },
  executeConvert: async (token, data) => {
    const res = await fetch(`${API_BASE}/convert/execute`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  getConvertHistory: async (token) => {
    const res = await fetch(`${API_BASE}/convert/history`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  // ── Earn ─────────────────────────────────────────────────────────────────
  getEarnProducts: async (token) => {
    const res = await fetch(`${API_BASE}/earn/products`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  getEarnPositions: async (token) => {
    const res = await fetch(`${API_BASE}/earn/positions`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  subscribeEarn: async (token, data) => {
    const res = await fetch(`${API_BASE}/earn/subscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  redeemEarn: async (token, positionId) => {
    const res = await fetch(`${API_BASE}/earn/redeem/${positionId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  // ── Referral ──────────────────────────────────────────────────────────────
  getReferralInfo: async (token) => {
    const res = await fetch(`${API_BASE}/referral/info`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  applyReferralCode: async (token, code) => {
    const res = await fetch(`${API_BASE}/referral/apply`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ code })
    });
    return res.json();
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  getNotifications: async (token) => {
    const res = await fetch(`${API_BASE}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  markAllRead: async (token) => {
    const res = await fetch(`${API_BASE}/notifications/read-all`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },
  markNotificationRead: async (token, id) => {
    const res = await fetch(`${API_BASE}/notifications/${id}/read`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },
  deleteNotification: async (token, id) => {
    const res = await fetch(`${API_BASE}/notifications/${id}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  // ── Order/Trade History ───────────────────────────────────────────────────
  getAllOrders: async (token) => {
    const res = await fetch(`${API_BASE}/spot/all-orders`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  // ── Portfolio ─────────────────────────────────────────────────────────────
  getDashboardOverview: async (token) => {
    const res = await fetch(`${API_BASE}/dashboard/overview`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  // ── Futures ───────────────────────────────────────────────────────────────
  getFuturesWallet: async (token) => {
    const res = await fetch(`${API_BASE}/futures/wallet`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  transferFutures: async (token, data) => {
    const res = await fetch(`${API_BASE}/futures/transfer`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  getFuturesPositions: async (token) => {
    const res = await fetch(`${API_BASE}/futures/positions`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  placeFuturesOrder: async (token, data) => {
    const res = await fetch(`${API_BASE}/futures/order`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  closeFuturesPosition: async (token, positionId) => {
    const res = await fetch(`${API_BASE}/futures/close/${positionId}`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },
  getFuturesHistory: async (token) => {
    const res = await fetch(`${API_BASE}/futures/history`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },

  // Public Market Overview
  getMarketOverview: async () => {
    const res = await fetch(`${API_BASE}/market/current`);
    return res.json();
  },

  // Chart candles
  getChartCandles: async (symbol, timeframe = '1h') => {
    const res = await fetch(`${API_BASE}/market/candles/${symbol}?timeframe=${timeframe}`);
    return res.json();
  },

  // Orderbook
  getOrderbook: async (symbol) => {
    const res = await fetch(`${API_BASE}/spot/orderbook/${symbol}`);
    return res.json();
  },

  // Spot Trading Endpoints
  placeSpotOrder: async (token, orderData) => {
    const res = await fetch(`${API_BASE}/spot/order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(orderData)
    });
    return res.json();
  },

  getOpenOrders: async (token) => {
    const res = await fetch(`${API_BASE}/spot/open-orders`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  cancelSpotOrder: async (token, orderId) => {
    const res = await fetch(`${API_BASE}/spot/cancel-order`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ orderId })
    });
    return res.json();
  },

  getTradeHistory: async (token) => {
    const res = await fetch(`${API_BASE}/spot/trade-history`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  // ── Admin ─────────────────────────────────────────────────────────────────
  getAdminOverview: async (token) => {
    const res = await fetch(`/api/admin/overview`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  getAdminUsers: async (token, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`/api/admin/users${q ? `?${q}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  createAdminUser: async (token, data) => {
    const res = await fetch('/api/admin/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  updateAdminUserRole: async (token, userId, role) => {
    const res = await fetch(`/api/admin/users/${userId}/role`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ role })
    });
    return res.json();
  },
  getAdminAccounts: async (token, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`/api/admin/accounts${q ? `?${q}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  createAdminAccount: async (token, data) => {
    const res = await fetch('/api/admin/accounts', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  updateAdminAccount: async (token, accountId, data) => {
    const res = await fetch(`/api/admin/accounts/${accountId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  getAdminPayouts: async (token, params = {}) => {
    const q = new URLSearchParams(params).toString();
    const res = await fetch(`/api/admin/payouts${q ? `?${q}` : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  approveAdminPayout: async (token, payoutId, transactionId) => {
    const res = await fetch(`/api/admin/payouts/${payoutId}/approve`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ transactionId })
    });
    return res.json();
  },
  rejectAdminPayout: async (token, payoutId) => {
    const res = await fetch(`/api/admin/payouts/${payoutId}/reject`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },
  getAdminTrades: async (token) => {
    const res = await fetch('/api/admin/trades', { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  getAdminCryptoWallets: async (token) => {
    const res = await fetch('/api/admin/wallets', { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  saveAdminCryptoWallet: async (token, data) => {
    const res = await fetch('/api/admin/wallets', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(data)
    });
    return res.json();
  },
  toggleAdminCryptoWallet: async (token, walletId) => {
    const res = await fetch(`/api/admin/wallets/${walletId}/toggle`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },
  deleteAdminCryptoWallet: async (token, walletId) => {
    const res = await fetch(`/api/admin/wallets/${walletId}`, {
      method: 'DELETE', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },
  getAdminCryptoDeposits: async (token) => {
    const res = await fetch('/api/admin/deposits', { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
  },
  approveAdminCryptoDeposit: async (token, depositId) => {
    const res = await fetch(`/api/admin/deposits/${depositId}/approve`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },
  rejectAdminCryptoDeposit: async (token, depositId) => {
    const res = await fetch(`/api/admin/deposits/${depositId}/reject`, {
      method: 'PUT', headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  // Wallet Endpoints
  getWalletBalances: async (token) => {
    const res = await fetch(`${API_BASE}/wallet/balances`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  getDepositWallets: async (token) => {
    const res = await fetch(`${API_BASE}/wallet/deposit-addresses`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  submitDeposit: async (token, depositData) => {
    const res = await fetch(`${API_BASE}/wallet/deposit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(depositData)
    });
    return res.json();
  },

  getDepositHistory: async (token) => {
    const res = await fetch(`${API_BASE}/wallet/deposits`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  },

  requestWithdrawal: async (token, withdrawData) => {
    const res = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(withdrawData)
    });
    return res.json();
  },

  getWithdrawalHistory: async (token) => {
    const res = await fetch(`${API_BASE}/wallet/withdrawals`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
  }
};
