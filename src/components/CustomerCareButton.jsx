/**
 * CustomerCareButton — floating support button.
 * Implementation (chat link, widget, etc.) to be configured later.
 * Shows on all authenticated pages via AuthLayout.
 */
import { useState } from 'react';
import './CustomerCareButton.css';

export default function CustomerCareButton() {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="cc-wrap">
      {hovered && (
        <div className="cc-tooltip">Customer Support</div>
      )}
      <button
        className="cc-btn"
        aria-label="Customer Support"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => {
          /* TODO: open chat widget / link */
        }}
      >
        {/* Headset SVG */}
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
          <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3z"/>
          <path d="M3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
        </svg>
        <span className="cc-ping" />
      </button>
    </div>
  );
}
