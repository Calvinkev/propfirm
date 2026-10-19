class WebSocketService {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 3000;
    this.listeners = new Map();
    this.isConnected = false;
  }

  connect(token) {
    let wsUrl = typeof import.meta !== 'undefined' && import.meta.env?.VITE_WS_URL;
    if (!wsUrl) {
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsHost = window.location.port === '5173' || window.location.port === '3000'
        ? `${window.location.hostname}:5000`
        : window.location.host;
      wsUrl = `${wsProtocol}//${wsHost}/ws`;
    }
    wsUrl += (wsUrl.includes('?') ? '&' : '?') + `token=${token}`;
    
    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      console.log('WebSocket connected');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.emit('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleMessage(data);
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket disconnected');
      this.isConnected = false;
      this.emit('disconnected');
      this.attemptReconnect(token);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
  }

  attemptReconnect(token) {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      setTimeout(() => {
        this.connect(token);
      }, this.reconnectDelay);
    } else {
      console.error('Max reconnection attempts reached');
    }
  }

  handleMessage(data) {
    const { type } = data;

    switch (type) {
      case 'connected':
        this.emit('connected', data);
        break;
      case 'account_update':
        this.emit('account_update', data);
        break;
      case 'market_data':
        this.emit('market_data', data);
        break;
      case 'price_tick':
        // Emitted as both 'price_tick' (generic) and `price:SYMBOL` (targeted)
        this.emit('price_tick', data);
        this.emit(`price:${data.symbol}`, data);
        break;
      default:
        console.log('Unknown message type:', type);
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      const callbacks = this.listeners.get(event);
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(callback => callback(data));
    }
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  subscribeToAccount(accountId) {
    this.send({
      type: 'subscribe_account',
      accountId
    });
  }

  unsubscribeFromAccount(accountId) {
    this.send({
      type: 'unsubscribe_account',
      accountId
    });
  }

  subscribeToMarketData(symbols) {
    this.send({
      type: 'subscribe_market_data',
      symbols
    });
  }

  subscribeToPriceRoom(symbol) {
    this.send({ type: 'subscribe_price', symbol });
  }

  unsubscribeFromPriceRoom(symbol) {
    this.send({ type: 'unsubscribe_price', symbol });
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.isConnected = false;
    }
  }
}

// Export singleton instance
export const wsService = new WebSocketService();
