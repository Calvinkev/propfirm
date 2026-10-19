import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../services/api';
import './Referral.css';

export default function Referral() {
  const { token } = useAuth();
  const [info, setInfo]       = useState(null);
  const [code, setCode]       = useState('');
  const [copied, setCopied]   = useState(false);
  const [toast, setToast]     = useState(null);

  const showToast = (type, msg) => { setToast({ type, msg }); setTimeout(() => setToast(null), 3500); };

  useEffect(() => {
    api.getReferralInfo(token).then(res => { if (res.referralCode) setInfo(res); });
  }, [token]);

  const copyLink = () => {
    navigator.clipboard.writeText(info?.referralLink || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleApplyCode = async (e) => {
    e.preventDefault();
    const res = await api.applyReferralCode(token, code);
    if (res.error) showToast('error', res.error);
    else { showToast('success', res.message); setCode(''); }
  };

  return (
    <div className="ref-page">
      {toast && <div className={`ref-toast ${toast.type}`}>{toast.msg}</div>}

      <div className="ref-container">
        <div className="ref-header">
          <h1>Referral Program</h1>
          <p>Invite friends to STAKEUP and earn commission on their trades</p>
        </div>

        {/* Hero Banner */}
        <div className="ref-hero">
          <div className="ref-hero-left">
            <div className="ref-hero-icon">🎁</div>
            <h2>Earn up to <span className="yellow">20% Commission</span></h2>
            <p>For every friend you refer who trades on STAKEUP, you earn a percentage of their trading fees — forever.</p>
          </div>
          <div className="ref-hero-steps">
            <div className="ref-step">
              <div className="ref-step-num">01</div>
              <div>
                <b>Share your link</b>
                <p>Send your unique referral link to friends</p>
              </div>
            </div>
            <div className="ref-step">
              <div className="ref-step-num">02</div>
              <div>
                <b>They register</b>
                <p>Friend signs up using your referral code</p>
              </div>
            </div>
            <div className="ref-step">
              <div className="ref-step-num">03</div>
              <div>
                <b>You earn</b>
                <p>Receive commission on every trade they make</p>
              </div>
            </div>
          </div>
        </div>

        <div className="ref-grid">
          {/* Stats */}
          <div className="ref-stats">
            <div className="ref-stat">
              <span className="rs-label">Total Referrals</span>
              <span className="rs-val">{info?.totalReferrals ?? 0}</span>
            </div>
            <div className="ref-stat">
              <span className="rs-label">Active Referrals</span>
              <span className="rs-val pos">{info?.activeReferrals ?? 0}</span>
            </div>
            <div className="ref-stat">
              <span className="rs-label">Commission Earned</span>
              <span className="rs-val yellow">{info?.totalCommission ?? '0.0000'} USDT</span>
            </div>
          </div>

          {/* Your Referral Link */}
          <div className="ref-card">
            <h3>Your Referral Link</h3>
            <div className="ref-code-box">
              <span className="ref-code">{info?.referralCode ?? '...'}</span>
            </div>
            <div className="ref-link-box">
              <span className="ref-link-text">{info?.referralLink ?? '...'}</span>
              <button className="copy-btn" onClick={copyLink}>
                {copied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <div className="ref-share-row">
              <span className="rs-share-label">Share via:</span>
              <a className="share-btn tw" href={`https://twitter.com/intent/tweet?text=Join+STAKEUP+with+my+referral+link+${info?.referralLink}`} target="_blank" rel="noreferrer">𝕏 Twitter</a>
              <a className="share-btn tg" href={`https://t.me/share/url?url=${info?.referralLink}`} target="_blank" rel="noreferrer">Telegram</a>
            </div>
          </div>

          {/* Apply code */}
          <div className="ref-card">
            <h3>Apply a Referral Code</h3>
            <p className="ref-apply-desc">Enter a referral code from a friend to link your account to theirs.</p>
            <form onSubmit={handleApplyCode} className="ref-apply-form">
              <input
                className="ref-apply-input"
                placeholder="Enter referral code (e.g. STK0042XY)"
                value={code}
                onChange={e => setCode(e.target.value)}
              />
              <button type="submit" className="ref-apply-btn">Apply Code</button>
            </form>
          </div>

          {/* Referral table */}
          <div className="ref-card ref-card-wide">
            <h3>Referred Users</h3>
            {!info?.referrals?.length ? (
              <div className="ref-empty">No referrals yet. Share your link to get started.</div>
            ) : (
              <table className="ref-table">
                <thead>
                  <tr><th>User</th><th>Joined</th><th>Status</th><th>Commission</th></tr>
                </thead>
                <tbody>
                  {info.referrals.map(r => (
                    <tr key={r.id}>
                      <td>
                        <div className="ref-user-cell">
                          <div className="ref-avatar">{r.first_name?.[0]}{r.last_name?.[0]}</div>
                          <div>
                            <b>{r.first_name} {r.last_name}</b>
                            <span>{r.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>{new Date(r.joined_at).toLocaleDateString()}</td>
                      <td><span className={`ref-status ${r.status}`}>{r.status}</span></td>
                      <td className="mono yellow">{parseFloat(r.commission_earned).toFixed(4)} USDT</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
