import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import Icon from '../components/Icon';
import './Profile.css';

export default function Profile() {
  const { token, user, updateUser } = useAuth();
  const [profile, setProfile]     = useState(null);
  const [tab, setTab]             = useState('profile');
  const [toast, setToast]         = useState(null);

  // Profile form
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName]   = useState('');

  // Password form
  const [curPwd, setCurPwd]   = useState('');
  const [newPwd, setNewPwd]   = useState('');
  const [confPwd, setConfPwd] = useState('');

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    api.getProfile(token).then(res => {
      if (res.user) {
        setProfile(res);
        setFirstName(res.user.firstName || '');
        setLastName(res.user.lastName || '');
      }
    });
  }, [token]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    const res = await api.updateProfile(token, { firstName, lastName });
    if (res.error) showToast('error', res.error);
    else {
      showToast('success', 'Profile updated successfully');
      updateUser({ ...user, firstName, lastName });
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPwd !== confPwd) return showToast('error', 'New passwords do not match');
    const res = await api.changePassword(token, { currentPassword: curPwd, newPassword: newPwd });
    if (res.error) showToast('error', res.error);
    else { showToast('success', 'Password changed successfully'); setCurPwd(''); setNewPwd(''); setConfPwd(''); }
  };

  if (!profile) return <div className="profile-page"><div className="pr-loading">Loading...</div></div>;

  const u = profile.user;
  const s = profile.stats;
  const memberDays = Math.floor((Date.now() - new Date(u.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div className="profile-page">
      {toast && <div className={`pr-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="pr-container">
        {/* Header */}
        <div className="pr-hero">
          <div className="pr-avatar-wrap">
            <div className="pr-avatar">{u.firstName?.[0]}{u.lastName?.[0]}</div>
          </div>
          <div className="pr-hero-info">
            <h1>{u.firstName} {u.lastName}</h1>
            <span className="pr-email">{u.email}</span>
            <div className="pr-badges">
              <span className={`pr-role-badge ${u.role}`}>
                {u.role === 'admin'
                  ? <><Icon name="crown" size={12} /> Admin</>
                  : <><Icon name="user" size={12} /> Trader</>}
              </span>
              <span className="pr-member-badge">Member {memberDays} days</span>
            </div>
          </div>
          <div className="pr-hero-stats">
            <div className="pr-hs">
              <span className="pr-hs-label">Total Trades</span>
              <span className="pr-hs-val">{s?.total_trades ?? 0}</span>
            </div>
            <div className="pr-hs">
              <span className="pr-hs-label">Volume</span>
              <span className="pr-hs-val">${parseFloat(s?.total_volume || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="pr-hs">
              <span className="pr-hs-label">Fees Paid</span>
              <span className="pr-hs-val">${parseFloat(s?.total_fees || 0).toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="pr-tabs">
          <button className={`pr-tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile Settings</button>
          <button className={`pr-tab ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>Security</button>
          <button className={`pr-tab ${tab === 'api' ? 'active' : ''}`} onClick={() => setTab('api')}>API Keys</button>
        </div>

        {/* Profile Settings */}
        {tab === 'profile' && (
          <div className="pr-card">
            <h2>Personal Information</h2>
            <form onSubmit={handleProfileSave} className="pr-form">
              <div className="pr-form-row">
                <div className="pr-field">
                  <label>First Name</label>
                  <input value={firstName} onChange={e => setFirstName(e.target.value)} required />
                </div>
                <div className="pr-field">
                  <label>Last Name</label>
                  <input value={lastName} onChange={e => setLastName(e.target.value)} required />
                </div>
              </div>
              <div className="pr-field">
                <label>Email Address</label>
                <input value={u.email} readOnly className="readonly" />
                <span className="pr-field-hint">Email cannot be changed. Contact support if needed.</span>
              </div>
              {u.referralCode && (
                <div className="pr-field">
                  <label>Your Referral Code</label>
                  <input value={u.referralCode} readOnly className="readonly mono" />
                </div>
              )}
              <div className="pr-field">
                <label>Account Role</label>
                <input value={u.role} readOnly className="readonly" />
              </div>
              <div className="pr-field">
                <label>Member Since</label>
                <input value={new Date(u.createdAt).toLocaleDateString()} readOnly className="readonly" />
              </div>
              <button type="submit" className="pr-save-btn">Save Changes</button>
            </form>
          </div>
        )}

        {/* Security */}
        {tab === 'security' && (
          <div className="pr-card">
            <h2>Change Password</h2>
            <form onSubmit={handlePasswordChange} className="pr-form pr-form-narrow">
              <div className="pr-field">
                <label>Current Password</label>
                <input type="password" value={curPwd} onChange={e => setCurPwd(e.target.value)} required placeholder="Enter current password" />
              </div>
              <div className="pr-field">
                <label>New Password</label>
                <input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} required placeholder="Min 6 characters" />
              </div>
              <div className="pr-field">
                <label>Confirm New Password</label>
                <input type="password" value={confPwd} onChange={e => setConfPwd(e.target.value)} required placeholder="Repeat new password" />
              </div>
              <button type="submit" className="pr-save-btn">Update Password</button>
            </form>

            <div className="pr-divider" />

            <h2>Security Status</h2>
            <div className="pr-security-list">
              <div className="pr-sec-item">
                <div className="pr-sec-left">
                  <span className="pr-sec-icon ok"><Icon name="check" size={13} color="var(--green)" /></span>
                  <div><b>Email Verified</b><span>Your email address is verified</span></div>
                </div>
                <span className="pr-sec-badge ok">Active</span>
              </div>
              <div className="pr-sec-item">
                <div className="pr-sec-left">
                  <span className="pr-sec-icon ok"><Icon name="check" size={13} color="var(--green)" /></span>
                  <div><b>Password</b><span>Strong password set</span></div>
                </div>
                <span className="pr-sec-badge ok">Set</span>
              </div>
              <div className="pr-sec-item">
                <div className="pr-sec-left">
                  <span className="pr-sec-icon warn"><Icon name="warning" size={13} color="var(--brass)" /></span>
                  <div><b>Two-Factor Authentication</b><span>Add an extra layer of protection</span></div>
                </div>
                <span className="pr-sec-badge warn">Not Set</span>
              </div>
            </div>
          </div>
        )}

        {/* API Keys */}
        {tab === 'api' && (
          <div className="pr-card">
            <h2>API Key Management</h2>
            <div className="pr-api-info">
              <div className="pr-api-icon"><Icon name="key" size={28} color="var(--brass)" /></div>
              <p>Create API keys to connect third-party trading bots, portfolio trackers, or custom algorithms to your STAKEUP account.</p>
              <ul>
                <li>Read-only keys can view balances and order history</li>
                <li>Trading keys can place and cancel orders</li>
                <li>Never share your API secret with anyone</li>
              </ul>
            </div>
            <div className="pr-api-empty">
              <p>No API keys created yet.</p>
              <button className="pr-api-create-btn" onClick={() => showToast('info', 'API key creation coming soon')}>
                + Create API Key
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
