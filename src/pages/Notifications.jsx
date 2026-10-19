import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './Notifications.css';

const TYPE_ICON = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '🚨', trade: '📈', deposit: '💰', withdrawal: '📤' };

export default function Notifications() {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unread, setUnread]               = useState(0);
  const [filter, setFilter]               = useState('all'); // all | unread

  const load = async () => {
    const res = await api.getNotifications(token);
    if (res.notifications) { setNotifications(res.notifications); setUnread(res.unreadCount); }
  };

  useEffect(() => { load(); }, [token]);

  const handleMarkAll = async () => {
    await api.markAllRead(token);
    load();
  };

  const handleMarkOne = async (id) => {
    await api.markNotificationRead(token, id);
    load();
  };

  const handleDelete = async (id) => {
    await api.deleteNotification(token, id);
    load();
  };

  const displayed = filter === 'unread'
    ? notifications.filter(n => !n.is_read)
    : notifications;

  return (
    <div className="notif-page">
      <div className="notif-container">
        <div className="notif-header">
          <div>
            <h1>Notifications</h1>
            <p>{unread > 0 ? `${unread} unread notification${unread !== 1 ? 's' : ''}` : 'All caught up'}</p>
          </div>
          <div className="notif-header-actions">
            <div className="notif-filter-tabs">
              <button className={`nf-tab ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>All</button>
              <button className={`nf-tab ${filter === 'unread' ? 'active' : ''}`} onClick={() => setFilter('unread')}>
                Unread {unread > 0 && <span className="nf-badge">{unread}</span>}
              </button>
            </div>
            {unread > 0 && (
              <button className="mark-all-btn" onClick={handleMarkAll}>Mark all read</button>
            )}
          </div>
        </div>

        <div className="notif-list">
          {displayed.length === 0 ? (
            <div className="notif-empty">
              <div className="notif-empty-icon">🔔</div>
              <p>{filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}</p>
            </div>
          ) : (
            displayed.map(n => (
              <div
                key={n.id}
                className={`notif-item ${!n.is_read ? 'unread' : ''}`}
                onClick={() => !n.is_read && handleMarkOne(n.id)}
              >
                <div className="notif-icon">{TYPE_ICON[n.type] || 'ℹ️'}</div>
                <div className="notif-body">
                  <div className="notif-title">{n.title}</div>
                  <div className="notif-msg">{n.message}</div>
                  <div className="notif-time">{new Date(n.created_at).toLocaleString()}</div>
                </div>
                {!n.is_read && <div className="notif-dot" />}
                <button
                  className="notif-delete"
                  onClick={e => { e.stopPropagation(); handleDelete(n.id); }}
                  title="Delete"
                >✕</button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
