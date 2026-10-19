const API_BASE_URL = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL)
  ? import.meta.env.VITE_API_URL
  : (window.location.port === '5173' || window.location.port === '3000'
      ? `${window.location.protocol}//${window.location.hostname}:5000/api`
      : `${window.location.origin}/api`);

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });
const jsonHeaders = (token) => ({
  'Content-Type': 'application/json',
  ...(token ? authHeader(token) : {}),
});

export const api = {
  // Auth endpoints
  register: async (userData) => {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData),
    });
    return response.json();
  },

  login: async (credentials) => {
    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    return response.json();
  },

  getMe: async (token) => {
    const response = await fetch(`${API_BASE_URL}/auth/me`, {
      headers: authHeader(token),
    });
    return response.json();
  },

  updateProfile: async (token, userData) => {
    const response = await fetch(`${API_BASE_URL}/accounts/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(userData),
    });
    return response.json();
  },

  getProfile: async (token) => {
    const response = await fetch(`${API_BASE_URL}/accounts/profile`, {
      headers: authHeader(token),
    });
    return response.json();
  },

  createAccount: async (token, accountData) => {
    const response = await fetch(`${API_BASE_URL}/accounts/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(accountData),
    });
    return response.json();
  },

  getAccount: async (token, accountId) => {
    const response = await fetch(`${API_BASE_URL}/accounts/${accountId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  updateProgress: async (token, accountId, progressData) => {
    const response = await fetch(`${API_BASE_URL}/accounts/${accountId}/progress`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(progressData),
    });
    return response.json();
  },

  // Market data endpoints
  getCurrentMarketData: async (token, symbols) => {
    const response = await fetch(`${API_BASE_URL}/market/current?symbols=${symbols.join(',')}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  getMarketHistory: async (token, symbol, timeframe) => {
    const response = await fetch(`${API_BASE_URL}/market/history/${symbol}?timeframe=${timeframe}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  // Trade endpoints
  getTradeHistory: async (token) => {
    const response = await fetch(`${API_BASE_URL}/trades/history`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  getAccountTrades: async (token, accountId) => {
    const response = await fetch(`${API_BASE_URL}/trades/account/${accountId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  createTrade: async (token, tradeData) => {
    const response = await fetch(`${API_BASE_URL}/trades/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(tradeData),
    });
    return response.json();
  },

  closeTrade: async (token, tradeId, exitPrice) => {
    const response = await fetch(`${API_BASE_URL}/trades/${tradeId}/close`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ exitPrice }),
    });
    return response.json();
  },

  getTradingMetrics: async (token, accountId) => {
    const response = await fetch(`${API_BASE_URL}/trades/metrics?accountId=${accountId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  // Dashboard endpoints
  getDashboardOverview: async (token) => {
    const response = await fetch(`${API_BASE_URL}/dashboard/overview`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  getAccountPerformance: async (token, accountId) => {
    const response = await fetch(`${API_BASE_URL}/dashboard/account-performance/${accountId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  getUserActivity: async (token, options = {}) => {
    const { limit = 50, offset = 0 } = options;
    const response = await fetch(`${API_BASE_URL}/dashboard/activity?limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  getChallengeHistory: async (token) => {
    const response = await fetch(`${API_BASE_URL}/dashboard/challenge-history`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  getTradingStats: async (token, accountId) => {
    const response = await fetch(`${API_BASE_URL}/dashboard/trading-stats?accountId=${accountId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  // Payout endpoints
  getPayoutHistory: async (token, options = {}) => {
    const { status, limit = 50, offset = 0 } = options;
    const response = await fetch(`${API_BASE_URL}/payouts/history?status=${status}&limit=${limit}&offset=${offset}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  requestPayout: async (token, payoutData) => {
    const response = await fetch(`${API_BASE_URL}/payouts/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify(payoutData),
    });
    return response.json();
  },

  getPayoutDetails: async (token, payoutId) => {
    const response = await fetch(`${API_BASE_URL}/payouts/${payoutId}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  cancelPayout: async (token, payoutId) => {
    const response = await fetch(`${API_BASE_URL}/payouts/${payoutId}/cancel`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    return response.json();
  },

  getPayoutEligibility: async (token) => {
    const response = await fetch(`${API_BASE_URL}/payouts/eligibility`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return response.json();
  },

  // ── Demo Trading endpoints ──────────────────────────────────────────────────

  createDemoAccount: async (token, data = {}) => {
    const response = await fetch(`${API_BASE_URL}/demo/accounts`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(data),
    });
    return response.json();
  },

  // Fetch (or auto-create) the demo account belonging to the logged-in user
  getMyDemoAccount: async (token) => {
    const response = await fetch(`${API_BASE_URL}/demo/accounts/me`, {
      headers: authHeader(token),
    });
    return response.json();
  },

  getDemoAccountSummary: async (token, accountId) => {
    const response = await fetch(`${API_BASE_URL}/demo/accounts/${accountId}/summary`, {
      headers: authHeader(token),
    });
    return response.json();
  },

  getDemoPositions: async (token, accountId) => {
    const response = await fetch(`${API_BASE_URL}/demo/accounts/${accountId}/positions`, {
      headers: authHeader(token),
    });
    return response.json();
  },

  getDemoHistory: async (token, accountId, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/demo/accounts/${accountId}/history${qs ? '?' + qs : ''}`, {
      headers: authHeader(token),
    });
    return response.json();
  },

  getDemoEquityCurve: async (token, accountId) => {
    const response = await fetch(`${API_BASE_URL}/demo/accounts/${accountId}/equity-curve`, {
      headers: authHeader(token),
    });
    return response.json();
  },

  getDemoInstruments: async (token) => {
    const response = await fetch(`${API_BASE_URL}/demo/instruments`, {
      headers: authHeader(token),
    });
    return response.json();
  },

  getDemoPriceCandles: async (token, symbol, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const response = await fetch(
      `${API_BASE_URL}/demo/prices/${symbol}/candles${qs ? '?' + qs : ''}`,
      { headers: authHeader(token) }
    );
    return response.json();
  },

  placeDemoOrder: async (token, orderData) => {
    const response = await fetch(`${API_BASE_URL}/demo/orders`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(orderData),
    });
    return response.json();
  },

  cancelDemoOrder: async (token, orderId) => {
    const response = await fetch(`${API_BASE_URL}/demo/orders/${orderId}`, {
      method: 'DELETE',
      headers: authHeader(token),
    });
    return response.json();
  },

  closeDemoPosition: async (token, positionId) => {
    const response = await fetch(`${API_BASE_URL}/demo/positions/${positionId}/close`, {
      method: 'POST',
      headers: authHeader(token),
    });
    return response.json();
  },

  // ── Admin Endpoints ───────────────────────────────────────────────────────
  getAdminOverview: async (token) => {
    const response = await fetch(`${API_BASE_URL}/admin/overview`, { headers: authHeader(token) });
    return response.json();
  },

  getAdminUsers: async (token, params = {}) => {
    const clean = {};
    if (params.search) clean.search = params.search;
    if (params.role) clean.role = params.role;
    const qs = new URLSearchParams(clean).toString();
    const response = await fetch(`${API_BASE_URL}/admin/users${qs ? '?' + qs : ''}`, { headers: authHeader(token) });
    return response.json();
  },

  createAdminUser: async (token, userData) => {
    const response = await fetch(`${API_BASE_URL}/admin/users`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(userData)
    });
    return response.json();
  },

  updateAdminUserRole: async (token, userId, role) => {
    const response = await fetch(`${API_BASE_URL}/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ role })
    });
    return response.json();
  },

  getAdminAccounts: async (token, params = {}) => {
    const clean = {};
    if (params.search) clean.search = params.search;
    if (params.status && params.status !== 'All') clean.status = params.status;
    const qs = new URLSearchParams(clean).toString();
    const response = await fetch(`${API_BASE_URL}/admin/accounts${qs ? '?' + qs : ''}`, { headers: authHeader(token) });
    return response.json();
  },

  createAdminAccount: async (token, data) => {
    const response = await fetch(`${API_BASE_URL}/admin/accounts`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(data)
    });
    return response.json();
  },

  updateAdminAccount: async (token, accountId, data) => {
    const response = await fetch(`${API_BASE_URL}/admin/accounts/${accountId}`, {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify(data)
    });
    return response.json();
  },

  getAdminPayouts: async (token, params = {}) => {
    const qs = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/admin/payouts${qs ? '?' + qs : ''}`, { headers: authHeader(token) });
    return response.json();
  },

  approveAdminPayout: async (token, payoutId, transactionId) => {
    const response = await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}/approve`, {
      method: 'PUT',
      headers: jsonHeaders(token),
      body: JSON.stringify({ transactionId })
    });
    return response.json();
  },

  rejectAdminPayout: async (token, payoutId) => {
    const response = await fetch(`${API_BASE_URL}/admin/payouts/${payoutId}/reject`, {
      method: 'PUT',
      headers: authHeader(token)
    });
    return response.json();
  },

  getAdminTrades: async (token) => {
    const response = await fetch(`${API_BASE_URL}/admin/trades`, { headers: authHeader(token) });
    return response.json();
  },

  // ── Trader Crypto Deposit & Checkout Endpoints ──────────────────────────────
  getCryptoWallets: async (token) => {
    const response = await fetch(`${API_BASE_URL}/accounts/crypto-wallets`, { headers: authHeader(token) });
    return response.json();
  },

  submitCryptoDeposit: async (token, depositData) => {
    const response = await fetch(`${API_BASE_URL}/accounts/crypto-deposit`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(depositData)
    });
    return response.json();
  },

  // ── Admin Crypto Wallets & Deposits Management ──────────────────────────────
  getAdminCryptoWallets: async (token) => {
    const response = await fetch(`${API_BASE_URL}/admin/wallets`, { headers: authHeader(token) });
    return response.json();
  },

  saveAdminCryptoWallet: async (token, walletData) => {
    const response = await fetch(`${API_BASE_URL}/admin/wallets`, {
      method: 'POST',
      headers: jsonHeaders(token),
      body: JSON.stringify(walletData)
    });
    return response.json();
  },

  toggleAdminCryptoWallet: async (token, walletId) => {
    const response = await fetch(`${API_BASE_URL}/admin/wallets/${walletId}/toggle`, {
      method: 'PUT',
      headers: authHeader(token)
    });
    return response.json();
  },

  deleteAdminCryptoWallet: async (token, walletId) => {
    const response = await fetch(`${API_BASE_URL}/admin/wallets/${walletId}`, {
      method: 'DELETE',
      headers: authHeader(token)
    });
    return response.json();
  },

  getAdminCryptoDeposits: async (token) => {
    const response = await fetch(`${API_BASE_URL}/admin/deposits`, { headers: authHeader(token) });
    return response.json();
  },

  approveAdminCryptoDeposit: async (token, depositId) => {
    const response = await fetch(`${API_BASE_URL}/admin/deposits/${depositId}/approve`, {
      method: 'PUT',
      headers: authHeader(token)
    });
    return response.json();
  },

  rejectAdminCryptoDeposit: async (token, depositId) => {
    const response = await fetch(`${API_BASE_URL}/admin/deposits/${depositId}/reject`, {
      method: 'PUT',
      headers: authHeader(token)
    });
    return response.json();
  },
};
