/**
 * CryptoIcon — renders a cryptocurrency icon from the cryptocurrency-icons package.
 * Falls back to a styled text badge if no icon exists for the given symbol.
 */
import React from 'react';
import './CryptoIcon.css';

// Map ticker symbols to their icon file names (lowercase)
const SYMBOL_MAP = {
  BTC: 'btc', ETH: 'eth', SOL: 'sol', BNB: 'bnb', XRP: 'xrp',
  DOGE: 'doge', ADA: 'ada', USDT: 'usdt', USDC: 'usdc', BUSD: 'busd',
  MATIC: 'matic', DOT: 'dot', AVAX: 'avax', LINK: 'link', UNI: 'uni',
  ATOM: 'atom', LTC: 'ltc', BCH: 'bch', SHIB: 'shib', TRX: 'trx',
};

export default function CryptoIcon({ symbol = '', size = 24, className = '' }) {
  const key = symbol.replace('USDT', '').toUpperCase();
  const iconName = SYMBOL_MAP[key];

  if (!iconName) {
    // Fallback: styled text badge
    return (
      <span
        className={`crypto-icon-fallback ${className}`}
        style={{ width: size, height: size, fontSize: size * 0.38 }}
      >
        {key.slice(0, 3)}
      </span>
    );
  }

  return (
    <img
      src={`/crypto-icons/${iconName}.svg`}
      alt={key}
      width={size}
      height={size}
      className={`crypto-icon ${className}`}
      onError={(e) => {
        // Swap to fallback span on load error
        const span = document.createElement('span');
        span.className = `crypto-icon-fallback ${className}`;
        span.style.cssText = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
        span.textContent = key.slice(0, 3);
        e.target.replaceWith(span);
      }}
    />
  );
}
