import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import Icon from '../components/Icon';
import './Profile.css';

export default function Profile() {
  const { token, user, updateUser } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState('profile');
  const [toast, setToast] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [curPwd, setCurPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confPwd, setConfPwd] = useState('');

  const showToast = (type, msg) => {
    setToast({ type, msg });
    window.setTimeout(() => setToast(null), 3500);
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await api.getProfile(token);
      if (!res.user) throw new Error(res.error || 'Unable to load your profile.');
      setProfile(res);
      setFirstName(res.user.firstName || '');
      setLastName(res.user.lastName || '');
    } catch (error) {
      setLoadError(error.message || 'Could not load your profile. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await api.updateProfile(token, { firstName, lastName });
      if (res.error) throw new Error(res.error);
      const updatedUser = { ...user, firstName: firstName.trim(), lastName: lastName.trim() };
      updateUser(updatedUser);
      setProfile(current => ({ ...current, user: { ...current.user, ...updatedUser } }));
      showToast('success', 'Profile updated successfully');
    } catch (error) {
      showToast('error', error.message || 'Could not update your profile.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (newPwd !== confPwd) return showToast('error', 'New passwords do not match');
    setSavingPassword(true);
    try {
      const res = await api.changePassword(token, { currentPassword: curPwd, newPassword: newPwd });
      if (res.error) throw new Error(res.error);
      showToast('success', 'Password changed successfully');
      setCurPwd('');
      setNewPwd('');
      setConfPwd('');
    } catch (error) {
      showToast('error', error.message || 'Could not change your password.');
    } finally {
      setSavingPassword(false);
    }
  };

  if (loading) return <div className="profile-page"><div className="pr-loading">Loading profile…</div></div>;

  if (!profile) return (
    <div className="profile-page">
      <div className="pr-loading" role="alert">
        <p>{loadError || 'Could not load your profile.'}</p>
        <button type="button" className="pr-save-btn" onClick={loadProfile}>Try again</button>
      </div>
    </div>
  );

  const u = profile.user;
  const stats = profile.stats || {};
  const balances = profile.balances || [];
  const activity = profile.activity || {};
  const createdAt = u.createdAt ? new Date(u.createdAt) : null;
  const memberDays = createdAt && !Number.isNaN(createdAt.getTime())
    ? Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / 86400000))
    : 0;
  const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;

  return (
    <div className="profile-page">
      {toast && <div className={`pr-toast ${toast.type}`} role="status">{toast.msg}</div>}
      <div className="pr-container">
        <div className="pr-hero">
          <div className="pr-avatar-wrap">
            <div className="pr-avatar" aria-label={`${displayName} avatar`}>
              {u.firstName?.[0] || u.email?.[0]?.toUpperCase()}{u.lastName?.[0] || ''}
            </div>
          </div>
          <div className="pr-hero-info">
            <h1>{displayName}</h1>
            <span className="pr-email">{u.email}</span>
            <div className="pr-badges">
              <span className={`pr-role-badge ${u.role}`}>
                {u.role === 'admin'
                  ? <><Icon name="crown" size={12} /> Admin</>
                  : <><Icon name="user" size={12} /> Trader</>}
              </span>
              <span className="pr-member-badge">Member for {memberDays} days</span>
            </div>
          </div>
          <div className="pr-hero-stats">
            <div className="pr-hs"><span className="pr-hs-label">Spot Trades</span><span className="pr-hs-val">{stats.total_trades ?? 0}</span></div>
            <div className="pr-hs"><span className="pr-hs-label">Trade Volume</span><span className="pr-hs-val">${Number(stats.total_volume || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span></div>
            <div className="pr-hs"><span className="pr-hs-label">Fees Paid</span><span className="pr-hs-val">${Number(stats.total_fees || 0).toFixed(2)}</span></div>
          </div>
        </div>

        <section className="pr-card pr-account-card" aria-labelledby="account-overview-title">
          <div className="pr-account-heading">
            <div><h2 id="account-overview-title">Account overview</h2><p>Your account details and wallet balances</p></div>
            <span className="pr-account-id">Account ID: {u.id}</span>
          </div>
          <div className="pr-account-grid">
            <div className="pr-account-detail"><span>Full name</span><b>{displayName}</b></div>
            <div className="pr-account-detail"><span>Email address</span><b>{u.email}</b></div>
            <div className="pr-account-detail"><span>Account type</span><b>{u.role === 'admin' ? 'Administrator' : 'Trader'}</b></div>
            <div className="pr-account-detail"><span>Member since</span><b>{createdAt && !Number.isNaN(createdAt.getTime()) ? createdAt.toLocaleDateString() : '—'}</b></div>
            <div className="pr-account-detail"><span>Deposits submitted</span><b>{activity.deposits ?? 0}</b></div>
            <div className="pr-account-detail"><span>Withdrawals submitted</span><b>{activity.withdrawals ?? 0}</b></div>
            <div className="pr-account-detail"><span>Spot orders</span><b>{activity.spot_orders ?? 0}</b></div>
            <div className="pr-account-detail"><span>Buy / sell trades</span><b>{stats.buys ?? 0} / {stats.sells ?? 0}</b></div>
          </div>
          <div className="pr-balance-section">
            <h3>Wallet balances</h3>
            {balances.length ? (
              <div className="pr-balance-list">
                {balances.map(balance => (
                  <div className="pr-balance-row" key={balance.asset}>
                    <b>{balance.asset}</b>
                    <span>Available <strong>{Number(balance.free || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</strong></span>
                    <span>Locked <strong>{Number(balance.locked || 0).toLocaleString(undefined, { maximumFractionDigits: 8 })}</strong></span>
                  </div>
                ))}
              </div>
            ) : <p className="pr-empty">No wallet balances yet.</p>}
          </div>
        </section>

        <div className="pr-tabs" role="tablist" aria-label="Profile sections">
          <button type="button" role="tab" aria-selected={tab === 'profile'} className={`pr-tab ${tab === 'profile' ? 'active' : ''}`} onClick={() => setTab('profile')}>Profile Settings</button>
          <button type="button" role="tab" aria-selected={tab === 'security'} className={`pr-tab ${tab === 'security' ? 'active' : ''}`} onClick={() => setTab('security')}>Security</button>
          <button type="button" role="tab" aria-selected={tab === 'api'} className={`pr-tab ${tab === 'api' ? 'active' : ''}`} onClick={() => setTab('api')}>API Keys</button>
        </div>

        {tab === 'profile' && (
          <div className="pr-card">
            <h2>Personal information</h2>
            <form onSubmit={handleProfileSave} className="pr-form">
              <div className="pr-form-row">
                <div className="pr-field"><label htmlFor="profile-first-name">First name</label><input id="profile-first-name" value={firstName} onChange={e => setFirstName(e.target.value)} required maxLength={100} /></div>
                <div className="pr-field"><label htmlFor="profile-last-name">Last name</label><input id="profile-last-name" value={lastName} onChange={e => setLastName(e.target.value)} required maxLength={100} /></div>
              </div>
              <div className="pr-field"><label htmlFor="profile-email">Email address</label><input id="profile-email" value={u.email || ''} readOnly className="readonly" /><span className="pr-field-hint">Email cannot be changed here.</span></div>
              {u.referralCode && <div className="pr-field"><label htmlFor="profile-referral">Referral code</label><input id="profile-referral" value={u.referralCode} readOnly className="readonly mono" /></div>}
              <button type="submit" className="pr-save-btn" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save Changes'}</button>
            </form>
          </div>
        )}

        {tab === 'security' && (
          <div className="pr-card">
            <h2>Change password</h2>
            <form onSubmit={handlePasswordChange} className="pr-form pr-form-narrow">
              <div className="pr-field"><label htmlFor="current-password">Current password</label><input id="current-password" type="password" autoComplete="current-password" value={curPwd} onChange={e => setCurPwd(e.target.value)} required placeholder="Enter current password" /></div>
              <div className="pr-field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={6} value={newPwd} onChange={e => setNewPwd(e.target.value)} required placeholder="At least 6 characters" /></div>
              <div className="pr-field"><label htmlFor="confirm-password">Confirm new password</label><input id="confirm-password" type="password" autoComplete="new-password" minLength={6} value={confPwd} onChange={e => setConfPwd(e.target.value)} required placeholder="Repeat new password" /></div>
              <button type="submit" className="pr-save-btn" disabled={savingPassword}>{savingPassword ? 'Updating…' : 'Update Password'}</button>
            </form>
            <div className="pr-divider" />
            <h2>Security features</h2>
            <div className="pr-security-list">
              <div className="pr-sec-item"><div className="pr-sec-left"><span className="pr-sec-icon warn"><Icon name="warning" size={13} color="var(--brass)" /></span><div><b>Email verification</b><span>Email verification is not currently available.</span></div></div><span className="pr-sec-badge warn">Unavailable</span></div>
              <div className="pr-sec-item"><div className="pr-sec-left"><span className="pr-sec-icon ok"><Icon name="check" size={13} color="var(--green)" /></span><div><b>Password</b><span>A password is set for this account.</span></div></div><span className="pr-sec-badge ok">Set</span></div>
              <div className="pr-sec-item"><div className="pr-sec-left"><span className="pr-sec-icon warn"><Icon name="warning" size={13} color="var(--brass)" /></span><div><b>Two-factor authentication</b><span>Two-factor authentication is not currently available.</span></div></div><span className="pr-sec-badge warn">Unavailable</span></div>
            </div>
          </div>
        )}

        {tab === 'api' && (
          <div className="pr-card">
            <h2>API key management</h2>
            <div className="pr-api-info">
              <div className="pr-api-icon"><Icon name="key" size={28} color="var(--brass)" /></div>
              <p>API key management is not available yet. No keys can be created or used from this page.</p>
              <ul><li>Never share your account password or access token.</li><li>API key creation will be enabled here once secure key management is supported.</li></ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
