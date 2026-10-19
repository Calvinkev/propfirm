const API_BASE = '/api';

export const api = {
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
