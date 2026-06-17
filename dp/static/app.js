/* ═══════════════════════════════════════════════════════════════
   LocalMart Hub – Delivery Partner App  |  app.js
   Connects to Flask backend at /api/*
   ═══════════════════════════════════════════════════════════════ */

const API = 'http://192.168.0.218:5001/api';

/* ─── STATE ────────────────────────────────────────────────── */
const State = {
  token: localStorage.getItem('lmh_token') || null,
  partner: null,
  wallet: null,
  orders: [],
  incentives: [],
  incentiveSlabs: { daily: [], weekly: [] },
  incentiveTab: 'daily',
  incentiveDate: new Date().toISOString().slice(0,10),
  referrals: null,
  earnings: null,
  referralStatus: null,
  isOnline: false,
  currentPage: 'home',
  location: null,          // { lat, lng, accuracy }
  locationWatchId: null,
  locationError: null,
  // Forgot password (phone OTP flow)
  forgotPhone: null,
  todayShift: null,   
  forgotResetToken: null,
  // Wallet top-up
  topupRef: null,
  topupMethod: 'upi',
  // Auto-refresh polling
  _earningsInterval: null,
  earningsTab: 'today',
};

/* ─── API HELPERS ───────────────────────────────────────────── */
async function api(method, path, body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (State.token) opts.headers['Authorization'] = 'Bearer ' + State.token;
  if (body) opts.body = JSON.stringify(body);
  try {
    const res = await fetch(API + path, opts);
    const data = await res.json();
    return { ok: res.ok, data };
  } catch (e) {
    return { ok: false, data: { error: 'Network error – check server connection' } };
  }
}

/* ─── TOAST ─────────────────────────────────────────────────── */
let _toastTimer;
function toast(msg, type = 'success') {
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = `toast ${type} show`;
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

/* ─── SVG ICONS ─────────────────────────────────────────────── */
const Icons = {
  home:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
  payouts:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`,
  schedule: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><circle cx="8" cy="15" r="1" fill="currentColor"/><circle cx="12" cy="15" r="1" fill="currentColor"/><circle cx="16" cy="15" r="1" fill="currentColor"/></svg>`,
  invite:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  account:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  box:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>`,
  wallet:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 7H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2z"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/><circle cx="16" cy="14" r="1" fill="currentColor"/></svg>`,
  gift:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><path d="M12 22V7"/><path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"/></svg>`,
  truck:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  bank:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><line x1="3" y1="22" x2="21" y2="22"/><line x1="6" y1="18" x2="6" y2="11"/><line x1="10" y1="18" x2="10" y2="11"/><line x1="14" y1="18" x2="14" y2="11"/><line x1="18" y1="18" x2="18" y2="11"/><polygon points="12 2 20 7 4 7"/></svg>`,
  phone:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.62 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
  location: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`,
  chevron:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="9 18 15 12 9 6"/></svg>`,
  copy:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  trending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  user:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
  doc:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  support:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  logout:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  shield:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  info:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
  star:     `<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  mail:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  globe:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
};

/* ─── RENDER HELPERS ────────────────────────────────────────── */
function fmt(n) { if (n === null || n === undefined) return '0'; return Number(n).toLocaleString('en-IN'); }
function fmtDate(iso) { if (!iso) return '—'; return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }); }
function initials(name) { if (!name) return 'P'; return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase(); }
function timeGreeting() { const h = new Date().getHours(); if (h < 12) return 'Morning'; if (h < 17) return 'Afternoon'; return 'Evening'; }
function statusBadge(status) {
  const cls = { pending: 'badge-pending', picked: 'badge-picked', done: 'badge-done', cancelled: 'badge-cancelled' };
  const lbl = { pending: 'Pending', picked: 'In Transit', done: 'Delivered', cancelled: 'Cancelled' };
  return `<span class="status-badge ${cls[status] || ''}">${lbl[status] || status}</span>`;
}

/* ─── LOADING SCREEN ────────────────────────────────────────── */
function renderLoading() {
  return `
  <div class="loading-screen" id="loading-screen">
    <div class="loader-logo">${Icons.truck}</div>
    <div class="loader-text">LocalMart <span>Hub</span></div>
    <div class="loader-sub">Delivery Partner Portal</div>
  </div>`;
}

/* ─── AUTH ───────────────────────────────────────────────────── */
function renderLogin() {
  return `
  <div class="auth-screen" id="login-screen">
    <div class="auth-logo">
      <div class="logo-icon">${Icons.truck}</div>
      <div class="logo-text">LocalMart <span>Hub</span></div>
    </div>
    <h1 class="auth-heading">Welcome back,<br/>Partner 👋</h1>
    <p class="auth-sub">Sign in to start your shift and track earnings</p>
    <div class="field-group">
      <label class="field-label">Mobile Number</label>
      <input class="field-input" type="tel" id="login-phone" placeholder="10-digit mobile number" maxlength="10" inputmode="numeric" />
    </div>
    <div class="field-group">
      <label class="field-label">Password</label>
      <input class="field-input" type="password" id="login-pass" placeholder="Your password" />
    </div>
    <button class="btn-primary" onclick="doLogin()">Sign In →</button>
    <div style="text-align:center;margin-top:8px">
      <a onclick="showForgotPassword()" style="font-size:13px;color:var(--accent);cursor:pointer">Forgot Password?</a>
    </div>
    <div class="auth-switch">New partner? <a onclick="showRegister()">Register here</a></div>
  </div>`;
}

function renderRegister() {
  return `
  <div class="auth-screen" id="register-screen" style="overflow-y:auto;padding-bottom:40px">
    <div class="auth-logo">
      <div class="logo-icon">${Icons.truck}</div>
      <div class="logo-text">LocalMart <span>Hub</span></div>
    </div>
    <h1 class="auth-heading">Join the team</h1>
    <p class="auth-sub">Create your delivery partner account</p>
    <div class="field-group"><label class="field-label">Full Name *</label>
      <input class="field-input" type="text" id="reg-name" placeholder="Your full name" /></div>
    <div class="field-group"><label class="field-label">Mobile Number *</label>
      <input class="field-input" type="tel" id="reg-phone" placeholder="10-digit mobile number" maxlength="10" inputmode="numeric" /></div>
    <div class="field-group"><label class="field-label">Email Address *</label>
      <input class="field-input" type="email" id="reg-email" placeholder="your@email.com" /></div>
    <div class="field-group"><label class="field-label">Password *</label>
      <input class="field-input" type="password" id="reg-pass" placeholder="At least 6 characters" /></div>
    <div class="field-group"><label class="field-label">Preferred Location / Area *</label>
      <input class="field-input" type="text" id="reg-zone" placeholder="e.g. Benz Circle, Kanuru, Patamata…" /></div>
    <div class="field-group"><label class="field-label">Vehicle Type *</label>
      <select class="field-input" id="reg-vehicle">
        <option value="">Select vehicle</option>
        <option>Motorcycle</option><option>Scooter</option>
        <option>Bicycle</option><option>Electric Scooter</option>
      </select></div>
    <div class="field-group"><label class="field-label">Referral Code (Optional)</label>
      <input class="field-input" type="text" id="reg-ref" placeholder="e.g. LMH-ARJUN" style="text-transform:uppercase" /></div>
    <button class="btn-primary" onclick="doRegister()">Create Account →</button>
    <div class="auth-switch">Already a partner? <a onclick="showLogin()">Sign in</a></div>
  </div>`;
}

/* ─── MAIN SHELL ────────────────────────────────────────────── */
function renderShell() {
  return `
  <div class="page-content" id="page-content">
    <div class="page active" id="page-home">${renderHome()}</div>
    <div class="page" id="page-payouts">${renderPayouts()}</div>
    <div class="page" id="page-schedule">${renderSchedule()}</div>
    <div class="page" id="page-invite">${renderInvite()}</div>
    <div class="page" id="page-account">${renderAccount()}</div>
  </div>
  <nav class="bottom-nav">
    <button class="nav-item active" onclick="goTo('home')" id="nav-home">
      ${Icons.home}<span>Home</span>
    </button>
    <button class="nav-item" onclick="goTo('payouts')" id="nav-payouts">
      ${Icons.payouts}<span>Payouts</span>
    </button>
    <button class="nav-item" onclick="goTo('schedule')" id="nav-schedule">
      ${Icons.schedule}<span>Schedule</span>
    </button>
    <button class="nav-item" onclick="goTo('invite')" id="nav-invite">
      ${Icons.invite}<span>Invite</span>
    </button>
    <button class="nav-item" onclick="goTo('account')" id="nav-account">
      ${Icons.account}<span>Account</span>
    </button>
  </nav>`;
}

/* ─── LOCATION BAR ─────────────────────────────────────────── */
function renderLocationBar() {
  if (State.locationError) {
    return `
    <div onclick="requestLocationPermission()" style="margin:10px 20px 0;background:#fef2f2;border:1.5px solid #fecaca;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer">
      <span style="font-size:18px">📍</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:#dc2626">Location Off</div>
        <div style="font-size:11px;color:#ef4444;margin-top:1px">${State.locationError} — Tap to retry</div>
      </div>
    </div>`;
  }
  if (!State.location) {
    return `
    <div onclick="requestLocationPermission()" style="margin:10px 20px 0;background:#fffbeb;border:1.5px solid #fde68a;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px;cursor:pointer">
      <span style="font-size:18px">📍</span>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:700;color:#d97706">Enable Location</div>
        <div style="font-size:11px;color:#b45309;margin-top:1px">Tap to allow location access for nearby orders</div>
      </div>
      <div style="background:#d97706;color:white;font-size:11px;font-weight:700;padding:5px 10px;border-radius:6px">Allow</div>
    </div>`;
  }
  const acc = State.location.accuracy ? ` · ±${Math.round(State.location.accuracy)}m` : '';
  return `
  <div style="margin:10px 20px 0;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:10px 14px;display:flex;align-items:center;gap:10px">
    <span style="font-size:18px">📍</span>
    <div style="flex:1">
      <div style="font-size:13px;font-weight:700;color:#16a34a">Location Active${acc}</div>
      <div style="font-size:11px;color:#15803d;margin-top:1px">${State.partner && State.partner.zone || 'Your zone'} · Receiving nearby orders</div>
    </div>
    <div style="width:8px;height:8px;border-radius:50%;background:#16a34a;box-shadow:0 0 0 3px rgba(22,163,74,0.2)"></div>
  </div>`;
}

/* ─── HOME PAGE ─────────────────────────────────────────────── */
function renderHome() {
  const p = State.partner || {};
  const e = State.earnings || {};
  return `
  <div class="home-header">
    <div>
      <div class="home-greeting">Good ${timeGreeting()},</div>
      <div class="home-name">${p.name || 'Partner'} 👋</div>
    </div>
    <div class="status-toggle" onclick="toggleOnline()">
      <div class="status-dot ${State.isOnline ? 'online' : ''}"></div>
      <span class="status-label">${State.isOnline ? 'Online' : 'Offline'}</span>
    </div>
  </div>

  ${renderLocationBar()}

  <div class="earnings-card">
    <div style="display:flex;gap:6px;margin-bottom:12px">
      <button onclick="setEarningsTab('today')" id="tab-today" class="earn-tab ${State.earningsTab==='today'?'active':''}">Today</button>
      <button onclick="setEarningsTab('yesterday')" id="tab-yesterday" class="earn-tab ${State.earningsTab==='yesterday'?'active':''}">Yesterday</button>
      <button onclick="setEarningsTab('all')" id="tab-all" class="earn-tab ${State.earningsTab==='all'?'active':''}">All-Time</button>
    </div>
    <div class="earnings-label" id="earnings-label">
      ${State.earningsTab==='today' ? "Today's Earnings" : State.earningsTab==='yesterday' ? "Yesterday's Earnings" : "All-Time Earnings"}
    </div>
    <div class="earnings-amount" id="earnings-amount">
      <span>₹</span>${fmt(
        State.earningsTab==='today' ? (e.today||0) :
        State.earningsTab==='yesterday' ? (e.yesterday||0) :
        (e.total_earnings||0)
      )}
    </div>
    <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:2px">
      ${
        State.earningsTab==='today' ? `${e.today_count||0} order(s) delivered today` :
        State.earningsTab==='yesterday' ? `${e.yesterday_count||0} order(s) delivered yesterday` :
        `${e.total_delivered||0} order(s) delivered all-time`
      }
    </div>
    <div class="earnings-stats">
      <div class="stat-pill"><div class="val">${e.total_delivered || 0}</div><div class="lbl">Delivered</div></div>
      <div class="stat-pill"><div class="val">${e.total_in_transit || 0}</div><div class="lbl">In Transit</div></div>
      <div class="stat-pill"><div class="val">${e.total_pending || 0}</div><div class="lbl">Pending</div></div>
    </div>
  </div>

  ${State.isOnline ? `
  <div class="promo-banner" onclick="toast('Zone offer activated!','success')">
    <div class="promo-text">
      <div class="promo-sub">🔥 Live Offer</div>
      <div class="promo-main">25% Extra Per Order!</div>
      <div class="promo-desc">Active in your zone · 9AM – 11AM</div>
    </div>
    <div class="promo-cta">Grab it</div>
  </div>` : `
  <div class="promo-banner" style="background:linear-gradient(135deg,#e2e8f0,#f1f5f9);box-shadow:none" onclick="toggleOnline()">
    <div class="promo-text">
      <div class="promo-sub" style="color:var(--muted)">You are offline</div>
      <div class="promo-main" style="color:var(--text)">Go Online to Earn</div>
      <div class="promo-desc" style="color:var(--muted)">Tap to start accepting orders</div>
    </div>
    <div class="promo-cta" style="background:var(--accent)">Go Live →</div>
  </div>`}

  <div class="section-title">Quick Actions</div>
  <div class="quick-grid">
    <div class="quick-action" onclick="goTo('payouts')">
      <div class="qa-icon" style="background:rgba(22,163,74,0.12);color:var(--green)">${Icons.wallet}</div>
      <span>Wallet</span>
    </div>
    <div class="quick-action" onclick="openOrdersModal()">
      <div class="qa-icon" style="background:rgba(37,99,235,0.12);color:var(--accent)">${Icons.box}</div>
      <span>Orders</span>
    </div>
    <div class="quick-action" onclick="goTo('invite')">
      <div class="qa-icon" style="background:rgba(217,119,6,0.12);color:var(--gold)">${Icons.gift}</div>
      <span>Invite</span>
    </div>
    <div class="quick-action" onclick="goTo('schedule')">
      <div class="qa-icon" style="background:rgba(139,92,246,0.12);color:#7c3aed">${Icons.schedule}</div>
      <span>Schedule</span>
    </div>
  </div>

  <div class="section-title">Recent Deliveries</div>
  <div id="live-orders-list">${renderOrdersList()}</div>
  <div class="spacer"></div>`;
}

function setEarningsTab(tab) {
  State.earningsTab = tab;
  refreshPage('home');
}

/* ─── ORDERS LIST PARTIAL (used by renderHome + live polling) ── */
function renderOrdersList() {
  return State.orders.length === 0 ? `
  <div class="empty-state">
    <div class="empty-icon">📦</div>
    <div class="empty-title">No orders yet</div>
    <div class="empty-sub">Go online to start receiving orders in your zone</div>
  </div>` : State.orders.slice(0, 3).map(o => `
  <div class="order-card" onclick="openOrderDetail('${o.id}')">
    <div class="order-card-top">
      <div>
        <div class="order-id">${o.id}</div>
        <div class="order-item">${o.item}</div>
        <div class="order-customer">${o.customer_name || 'Customer'} · ${o.category || 'Order'}</div>
      </div>
      ${statusBadge(o.status)}
    </div>
    <div class="order-card-bottom">
      <span class="order-earn">+₹${fmt(o.commission || 0)}</span>
      <span class="order-meta">${Icons.location} ${Number(o.distance_km || 0).toFixed(1)} km</span>
    </div>
  </div>`).join('');
}

/* ─── PAYOUTS PAGE (formerly Earnings) ─────────────────────── */
function renderPayouts() {
  const w = (State.earnings && State.earnings.wallet) || {};
  const e = State.earnings || {};
  const txs = State.wallet ? State.wallet.transactions || [] : [];
  return `
  <div class="earnings-hero">
    <div class="earnings-hero-label">Wallet Balance</div>
    <div class="earnings-hero-amount"><sup>₹</sup>${fmt(w.balance || 0)}</div>
    <div style="display:flex;gap:20px;margin-top:12px">
      <div>
        <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.4px">Total Earned</div>
        <div style="font-size:17px;font-weight:800;font-family:var(--mono);color:#86efac">₹${fmt(w.total_earned || 0)}</div>
      </div>
      <div>
        <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.4px">Withdrawn</div>
        <div style="font-size:17px;font-weight:800;font-family:var(--mono);color:white">₹${fmt(w.total_withdrawn || 0)}</div>
      </div>
    </div>
  </div>

  <div class="wallet-card" style="margin-top:16px">
    <div class="wallet-header">
      <div class="wallet-title">Available Balance</div>
    </div>
    <div class="wallet-balance">₹${fmt(w.balance || 0)}</div>
    <div style="font-size:12px;color:var(--muted);margin-top:4px">Min. withdrawal: ₹${w.min_withdraw || 100}</div>
    <div class="wallet-actions">
      <button class="wallet-btn withdraw" onclick="openWithdrawModal()">Withdraw</button>
      <button class="wallet-btn history" style="background:linear-gradient(135deg,#16a34a,#22c55e);color:white;border:none;box-shadow:0 3px 12px rgba(22,163,74,0.2)" onclick="showAddMoney()">+ Add Money</button>
    </div>
    <button onclick="loadWallet()" style="margin-top:10px;width:100%;padding:10px;background:var(--surface2);border:1.5px solid var(--border);border-radius:var(--radius-sm);font-family:var(--font);font-size:13px;font-weight:600;cursor:pointer;color:var(--muted)">↻ Refresh Balance</button>
    </div>

  <div class="section-title">Today's Summary</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:0 20px;margin-bottom:4px">
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:16px;box-shadow:0 1px 6px rgba(0,0,0,0.04)">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px">Deliveries</div>
      <div style="font-size:26px;font-weight:800;font-family:var(--mono);color:var(--accent);margin-top:4px">${e.delivered || 0}</div>
    </div>
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius-sm);padding:16px;box-shadow:0 1px 6px rgba(0,0,0,0.04)">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px">Earned Today</div>
      <div style="font-size:26px;font-weight:800;font-family:var(--mono);color:var(--green);margin-top:4px">₹${fmt(e.today || 0)}</div>
    </div>
  </div>

  <div class="section-title">Transactions</div>
  ${txs.length === 0 ? `<div class="empty-state"><div class="empty-icon">💸</div><div class="empty-title">No transactions yet</div><div class="empty-sub">Your earnings will appear here</div></div>` :
    txs.map(tx => `
    <div class="tx-item">
      <div class="tx-icon" style="background:${tx.amount > 0 ? 'rgba(22,163,74,0.1)' : 'rgba(220,38,38,0.1)'};color:${tx.amount > 0 ? 'var(--green)' : 'var(--red)'}">
        ${tx.amount > 0 ? Icons.trending : Icons.wallet}
      </div>
      <div style="flex:1">
        <div class="tx-label">${tx.label}</div>
        <div class="tx-date">${fmtDate(tx.created_at)}</div>
      </div>
      <div class="tx-amount ${tx.amount > 0 ? 'credit' : 'debit'}">${tx.amount > 0 ? '+' : ''}₹${fmt(Math.abs(tx.amount))}</div>
    </div>`).join('')}

  <div class="section-title">Incentives</div>
  ${renderIncentiveTabs()}
  ${renderIncentiveDateStrip()}
  ${renderIncentiveSlabs()}
  <div class="spacer"></div>`;
}
function renderIncentiveTabs() {
  const tabs = [
    { key: 'daily',  label: 'Daily' },
    { key: 'weekly', label: 'Weekly' },
    { key: 'bonus',  label: 'Bonus' },
  ];
  return `
  <div style="display:flex;background:#2b2b2b;border-radius:10px;margin:0 20px 12px;overflow:hidden">
    ${tabs.map(t => `
    <div onclick="switchIncentiveTab('${t.key}')" style="flex:1;text-align:center;padding:12px 0;font-size:13px;font-weight:700;cursor:pointer;
      color:${State.incentiveTab===t.key?'#facc15':'rgba(255,255,255,0.75)'};
      border-bottom:2px solid ${State.incentiveTab===t.key?'#facc15':'transparent'}">
      ${t.label}
    </div>`).join('')}
  </div>`;
}

function renderIncentiveDateStrip() {
  if (State.incentiveTab === 'bonus') return '';
  const today = new Date();
  if (State.incentiveTab === 'daily') {
    const days = [];
    for (let i = -1; i <= 2; i++) {
      const d = new Date(today); d.setDate(today.getDate() + i);
      days.push(d);
    }
    return `
    <div style="display:flex;justify-content:space-around;background:#2b2b2b;padding:10px 12px 16px;margin:0 20px 14px;border-radius:0 0 10px 10px">
      ${days.map(d => {
        const iso = d.toISOString().slice(0,10);
        const isToday = iso === today.toISOString().slice(0,10);
        const isSelected = iso === State.incentiveDate;
        return `
        <div onclick="selectIncentiveDate('${iso}')" style="text-align:center;cursor:pointer;${isSelected?`border:2px solid #facc15;border-radius:50%;width:54px;height:54px;display:flex;flex-direction:column;align-items:center;justify-content:center`:''}">
          <div style="font-size:10px;color:${isSelected?'#facc15':'rgba(255,255,255,0.6)'};font-weight:700">${isToday ? 'Today' : d.toLocaleDateString('en-US',{month:'short'})}</div>
          <div style="font-size:${isSelected?'15px':'14px'};font-weight:800;color:white;margin-top:2px">${isToday && !isSelected ? '' : ''}${d.getDate()}</div>
        </div>`;
      }).join('')}
    </div>`;
  } else {
    // weekly: show weeks of the current month
    const year = today.getFullYear(), month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month+1, 0);
    const weeks = [];
    let cur = new Date(firstDay);
    cur.setDate(cur.getDate() - cur.getDay() + 1); // back to Monday
    while (cur <= lastDay) {
      const start = new Date(cur);
      const end   = new Date(cur); end.setDate(end.getDate()+6);
      weeks.push([new Date(start), new Date(end)]);
      cur.setDate(cur.getDate()+7);
    }
    return `
    <div style="display:flex;justify-content:space-around;background:#2b2b2b;padding:10px 8px 16px;margin:0 20px 14px;border-radius:0 0 10px 10px;flex-wrap:wrap;gap:8px">
      ${weeks.map(([s,e]) => {
        const iso = s.toISOString().slice(0,10);
        const isSelected = iso === State.incentiveDate || (State.incentiveDate >= s.toISOString().slice(0,10) && State.incentiveDate <= e.toISOString().slice(0,10));
        const label = `${s.toLocaleDateString('en-US',{month:'short'})} ${String(s.getDate()).padStart(2,'0')}-${String(e.getDate()).padStart(2,'0')}`;
        return `
        <div onclick="selectIncentiveDate('${iso}')" style="text-align:center;cursor:pointer;${isSelected?`border:2px solid #facc15;border-radius:10px;padding:6px 10px`:'padding:6px 10px'}">
          <div style="font-size:10px;color:${isSelected?'#facc15':'rgba(255,255,255,0.6)'};font-weight:700">${label.split(' ')[0]}</div>
          <div style="font-size:13px;font-weight:800;color:white;margin-top:2px">${label.split(' ')[1]}</div>
        </div>`;
      }).join('')}
    </div>`;
  }
}

function renderIncentiveSlabs() {
  if (State.incentiveTab === 'bonus') {
    return State.incentives.length === 0
      ? `<div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-title">No active bonuses</div><div class="empty-sub">Check back later for bonus opportunities</div></div>`
      : State.incentives.map(inc => `
      <div class="incentive-card">
        <div class="incentive-top">
          <div>
            <div class="incentive-title">${inc.title}</div>
            <div class="incentive-desc">${inc.description || ''}</div>
          </div>
          <div class="incentive-reward">₹${fmt(inc.reward_amount)}</div>
        </div>
        ${inc.target_value ? `
        <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100, ((inc.progress||0)/inc.target_value)*100)}%"></div></div>
        <div style="font-size:11px;color:var(--muted);margin-top:6px">${inc.progress||0} / ${inc.target_value} ${inc.achieved ? '✅ Achieved' : ''}</div>` : ''}
      </div>`).join('');
  }

  const slabs = State.incentiveSlabs[State.incentiveTab] || [];
  if (slabs.length === 0) return `<div class="empty-state"><div class="empty-icon">🎯</div><div class="empty-title">No incentives available</div></div>`;

  return slabs.map(slab => `
  <div style="background:var(--surface);border:1px solid var(--border);border-radius:12px;margin:0 20px 16px;overflow:hidden;box-shadow:0 1px 6px rgba(0,0,0,0.04)">
    <div style="text-align:center;padding:10px;font-size:12px;font-weight:700;color:var(--muted);border-bottom:1px solid var(--border)">
      ${slab.slot_label}
    </div>
    <div style="background:linear-gradient(135deg,#facc15,#fbbf24);padding:16px;text-align:center">
      <div style="font-size:20px;font-weight:900;color:#1a1a1a">Earn up to ₹${fmt(slab.max_reward)}</div>
      <div style="font-size:13px;font-weight:700;color:#1a1a1a;margin-top:2px">by completing ${slab.max_rides} deliveries</div>
      <div style="margin-top:8px;display:inline-block;background:rgba(0,0,0,0.15);color:white;font-size:11px;font-weight:600;padding:4px 12px;border-radius:6px">
        ${slab.categories}
      </div>
    </div>
    <div>
      ${slab.tiers.map(t => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-size:14px;font-weight:700;color:var(--text)">Complete ${t.rides_required} deliveries</div>
          ${t.achieved
            ? `<div style="font-size:11px;color:var(--green);font-weight:700;margin-top:2px">✓ Achieved${t.paid ? ' & credited' : ''}</div>`
            : `<div style="font-size:11px;color:var(--red);margin-top:2px">${t.remaining} more deliveries left</div>`}
        </div>
        <div style="font-size:16px;font-weight:800;color:${t.achieved?'var(--green)':'var(--text)'}">₹${fmt(t.reward_amount)}</div>
      </div>`).join('')}
      <div style="text-align:right;padding:10px 16px">
        <a onclick="toast('Incentive terms: rewards are credited automatically to your wallet once the delivery target for the period is reached.','success')" style="font-size:11px;color:var(--accent);cursor:pointer">Terms & Conditions</a>
      </div>
    </div>
  </div>`).join('');
}

function switchIncentiveTab(tab) {
  State.incentiveTab = tab;
  if (tab !== 'bonus') {
    State.incentiveDate = tab === 'daily' ? new Date().toISOString().slice(0,10) : State.incentiveDate;
    loadIncentiveSlabs(tab, State.incentiveDate);
  } else {
    refreshPage('payouts');
  }
}

function selectIncentiveDate(iso) {
  State.incentiveDate = iso;
  loadIncentiveSlabs(State.incentiveTab, iso);
}

/* ─── SCHEDULE PAGE (formerly Shifts) ──────────────────────── */
function renderSchedule() {
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const today = new Date();
  const calDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - 3 + i);
    return { name: days[d.getDay()], num: d.getDate(), isToday: i === 3 };
  });
   const slots = [
    { time: '6:00 AM – 8:00 AM',   type: 'Early Morning',   tag: 'open',  start: 6,  end: 8  },
    { time: '8:00 AM – 10:00 AM',  type: 'Breakfast Rush',  tag: 'high',  start: 8,  end: 10 },
    { time: '10:00 AM – 12:00 PM', type: 'Mid Morning',     tag: 'open',  start: 10, end: 12 },
    { time: '12:00 PM – 2:00 PM',  type: 'Lunch Peak',      tag: 'high',  start: 12, end: 14 },
    { time: '2:00 PM – 4:00 PM',   type: 'Afternoon Zone',  tag: 'open',  start: 14, end: 16 },
    { time: '4:00 PM – 6:00 PM',   type: 'Evening Rush',    tag: 'high',  start: 16, end: 18 },
    { time: '6:00 PM – 8:00 PM',   type: 'Dinner Peak',     tag: 'high',  start: 18, end: 20 },
    { time: '8:00 PM – 10:00 PM',  type: 'Night Shift',     tag: 'open',  start: 20, end: 22 },
];
  return `
  <div style="background:linear-gradient(135deg,#1e40af,#2563eb);padding:20px 20px 18px">
    <div style="font-size:20px;font-weight:800;color:white">My Schedule</div>
    <div style="font-size:13px;color:rgba(255,255,255,0.75);margin-top:2px">Book time slots · Earn extra bonuses</div>
  </div>

  <div class="shift-calendar" style="background:var(--surface);padding-top:14px;padding-bottom:14px;border-bottom:1px solid var(--border)">
    ${calDays.map(d => `
    <div class="cal-day ${d.isToday ? 'today selected' : ''}" onclick="selectDay(this)">
      <span class="day-name">${d.name}</span>
      <span class="day-num">${d.num}</span>
    </div>`).join('')}
  </div>

  <div style="padding:12px 20px 10px;display:flex;gap:12px;flex-wrap:wrap">
    <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--gold);font-weight:600">
      <div style="width:8px;height:8px;border-radius:2px;background:var(--gold)"></div> High Demand
    </div>
    <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--green);font-weight:600">
      <div style="width:8px;height:8px;border-radius:2px;background:var(--green)"></div> Booked
    </div>
  </div>

  ${slots.map(s => {
    const isBooked = State.todayShift &&
                     State.todayShift.slot_time === s.time &&
                     State.todayShift.status === 'booked';
    const isCancelled = State.todayShift &&
                        State.todayShift.slot_time === s.time &&
                        State.todayShift.status === 'cancelled';
    return `
    <div class="shift-slot ${isBooked ? 'booked' : ''} ${s.tag === 'high' ? 'high' : ''}"
         onclick="toggleShift(this, '${s.time}', ${s.start}, ${s.end})">
      <div>
        <div class="shift-time">${s.time}</div>
        <div class="shift-type">${s.type}</div>
      </div>
      <span class="shift-tag ${isBooked ? 'booked' : isCancelled ? 'cancelled' : s.tag}">
        ${isBooked ? '✓ Booked' : isCancelled ? '✗ Cancelled' : s.tag === 'high' ? '🔥 High' : 'Book'}
      </span>
    </div>`
}).join('')}

  <div class="spacer"></div>`;
}

/* ─── REFERRAL STATUS BANNER ───────────────────────────────── */
function renderReferralStatusBanner() {
  const rs = State.referralStatus;
  if (!rs || !rs.referred) return '';  // partner was not referred by anyone
  if (rs.unlocked) {
    return `
    <div style="margin:16px 20px 0;background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:1.5px solid #86efac;border-radius:12px;padding:14px 16px;display:flex;gap:12px;align-items:flex-start">
      <span style="font-size:24px">🎉</span>
      <div>
        <div style="font-size:14px;font-weight:800;color:#15803d">Referral Bonus Unlocked!</div>
        <div style="font-size:12px;color:#16a34a;margin-top:3px;line-height:1.5">${rs.message}</div>
      </div>
    </div>`;
  }
  const pct = Math.round((rs.days_worked / rs.days_needed) * 100);
  return `
  <div style="margin:16px 20px 0;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:12px;padding:14px 16px">
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
      <span style="font-size:20px">⏳</span>
      <div>
        <div style="font-size:13px;font-weight:800;color:var(--accent)">You were referred by ${rs.referrer_name}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px">Work ${rs.remaining_days} more day${rs.remaining_days !== 1 ? 's' : ''} to unlock ₹${rs.bonus_amount} for them</div>
      </div>
    </div>
    <div style="height:6px;background:#dbeafe;border-radius:3px;overflow:hidden">
      <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:3px;transition:width 0.5s"></div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:6px;text-align:right">${rs.days_worked} / ${rs.days_needed} days worked</div>
  </div>`;
}

/* ─── INVITE PAGE (formerly Refer) ─────────────────────────── */
function renderInvite() {
  const r = State.referrals || {};
  const code = r.my_code || (State.partner && State.partner.referral_code) || 'LMH-XXXX';
  const refs = r.referrals || [];
  return `
  ${renderReferralStatusBanner()}

  <div class="referral-hero">
    <div style="font-size:44px;margin-bottom:12px">🎁</div>
    <h2>Invite & Earn</h2>
    <p>Invite delivery partners and earn <strong style="color:var(--accent)">₹200</strong> after your friend works <strong style="color:var(--accent)">5 days</strong>. Your friend gets ₹100 joining bonus too!</p>
    <div style="display:flex;gap:16px;margin-top:16px;justify-content:center">
      <div style="text-align:center">
        <div style="font-size:24px;font-weight:800;font-family:var(--mono);color:var(--text)">${r.total_referrals || 0}</div>
        <div style="font-size:11px;color:var(--muted)">Invited</div>
      </div>
      <div style="width:1px;background:var(--border)"></div>
      <div style="text-align:center">
        <div style="font-size:24px;font-weight:800;font-family:var(--mono);color:var(--text)">${r.qualified || 0}</div>
        <div style="font-size:11px;color:var(--muted)">Qualified</div>
      </div>
      <div style="width:1px;background:var(--border)"></div>
      <div style="text-align:center">
        <div style="font-size:24px;font-weight:800;font-family:var(--mono);color:var(--green)">₹${fmt(r.total_earned || 0)}</div>
        <div style="font-size:11px;color:var(--muted)">Earned</div>
      </div>
    </div>
  </div>

  <div class="referral-code-box">
    <div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:0.5px">Your Invite Code</div>
      <div class="referral-code">${code}</div>
    </div>
    <div style="display:flex;gap:8px">
      <button class="copy-btn" onclick="copyCode('${code}')">${Icons.copy} Copy</button>
      <button class="copy-btn" style="background:rgba(22,163,74,0.12);border-color:rgba(22,163,74,0.3);color:#16a34a" onclick="shareViaWhatsApp('${code}')">📲 Share</button>
    </div>
  </div>

  <div class="referral-input-card">
    <h3>Send an Invite</h3>
    <div class="field-group">
      <label class="field-label">Friend's Mobile Number</label>
      <input class="field-input" type="tel" id="ref-phone" placeholder="Enter 10-digit number" maxlength="10" inputmode="numeric" />
    </div>
    <div class="field-group">
      <label class="field-label">Friend's Name</label>
      <input class="field-input" type="text" id="ref-name-input" placeholder="Enter name" />
    </div>
    <button class="btn-primary" style="background:linear-gradient(135deg,#16a34a,#22c55e);box-shadow:0 4px 16px rgba(22,163,74,0.3)" onclick="sendReferral()">
      📲 Send via WhatsApp →
    </button>
  </div>

  <div class="section-title">Your Referrals</div>
  ${refs.length === 0 ? `
  <div class="empty-state">
    <div class="empty-icon">👥</div>
    <div class="empty-title">No invites yet</div>
    <div class="empty-sub">Share your code and start earning bonuses</div>
  </div>` : refs.map(r => `
  <div class="referral-list-item">
    <div class="ref-avatar">${initials(r.referred_name)}</div>
    <div style="flex:1">
      <div class="ref-name">${r.referred_name}</div>
      <div class="ref-date">${fmtDate(r.created_at)}</div>
    </div>
    <div>
      <div class="ref-bonus">+₹${fmt(r.referrer_bonus)}</div>
      <div style="font-size:11px;color:${r.status === 'paid' ? 'var(--green)' : 'var(--muted)'};text-align:right;margin-top:2px">${r.status}</div>
    </div>
  </div>`).join('')}
  <div class="spacer"></div>`;
}

/* ─── ACCOUNT PAGE (formerly More) ─────────────────────────── */
function renderAccount() {
  const p = State.partner || {};
  return `
  <div class="profile-hero">
    <div class="profile-top">
      <div class="avatar-wrap">
        <div class="avatar-img" style="overflow:hidden">${p.profile_photo_url ? `<img src="${p.profile_photo_url}" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>` : initials(p.name)}</div>
        ${State.isOnline ? '<div class="avatar-status"></div>' : ''}
      </div>
      <div>
        <div class="profile-name">${p.name || 'Partner'}</div>
        <div class="profile-id">${p.id || '—'}</div>
        <div class="profile-zone">${Icons.location} ${p.zone || 'Zone not set'}</div>
        <div class="rating-row">
          <span class="stars">★</span>
          <span class="rating-val">${Number(p.rating || 5.0).toFixed(1)}</span>
          <span class="rating-count">(${p.rating_count || 0} ratings)</span>
        </div>
      </div>
    </div>
    <div class="profile-stats">
      <div class="pstat"><div class="val">${(State.earnings && State.earnings.total_delivered) || p.rating_count || 0}</div><div class="lbl">Deliveries</div></div>
      <div class="pstat"><div class="val">${p.vehicle_type || '—'}</div><div class="lbl">Vehicle</div></div>
      <div class="pstat"><div class="val">${p.joined_date ? new Date(p.joined_date).getFullYear() : '—'}</div><div class="lbl">Since</div></div>
    </div>
  </div>

  <div class="section-title">My Details</div>
  <div class="menu-list">
    <div class="menu-item" onclick="openProfileModal()">
      <div class="menu-icon" style="background:rgba(37,99,235,0.1);color:var(--accent)">${Icons.user}</div>
      <div class="menu-text"><div class="menu-title">My Profile</div><div class="menu-sub">Edit personal details</div></div>
      <div class="menu-arrow">${Icons.chevron}</div>
    </div>
    <div class="menu-item" onclick="openDocumentsModal()">
      <div class="menu-icon" style="background:rgba(217,119,6,0.1);color:var(--gold)">${Icons.doc}</div>
      <div class="menu-text"><div class="menu-title">Documents</div><div class="menu-sub">Aadhaar, PAN, Licence & more</div></div>
      <div class="menu-arrow">${Icons.chevron}</div>
    </div>
    <div class="menu-item" onclick="openVehicleModal()">
      <div class="menu-icon" style="background:rgba(139,92,246,0.1);color:#7c3aed">${Icons.truck}</div>
      <div class="menu-text"><div class="menu-title">Vehicle Details</div><div class="menu-sub">RC, insurance, PUC</div></div>
      <div class="menu-arrow">${Icons.chevron}</div>
    </div>
    <div class="menu-item" onclick="openBankModal()">
      <div class="menu-icon" style="background:rgba(22,163,74,0.1);color:var(--green)">${Icons.bank}</div>
      <div class="menu-text"><div class="menu-title">Bank & UPI</div><div class="menu-sub">Account & payment settings</div></div>
      <div class="menu-arrow">${Icons.chevron}</div>
    </div>
    <div class="menu-item" onclick="openEmergencyModal()">
      <div class="menu-icon" style="background:rgba(220,38,38,0.1);color:var(--red)">${Icons.phone}</div>
      <div class="menu-text"><div class="menu-title">Emergency Details</div><div class="menu-sub">Emergency contact & health info</div></div>
      <div class="menu-arrow">${Icons.chevron}</div>
    </div>
  </div>

  <div class="section-title">Support & Info</div>
  <div class="menu-list">
    <div class="menu-item" onclick="openHelpModal()">
      <div class="menu-icon" style="background:rgba(37,99,235,0.1);color:var(--accent)">${Icons.support}</div>
      <div class="menu-text"><div class="menu-title">Help & Support</div><div class="menu-sub">Contact us & get assistance</div></div>
      <div class="menu-arrow">${Icons.chevron}</div>
    </div>
    <div class="menu-item" onclick="openAboutModal()">
      <div class="menu-icon" style="background:rgba(37,99,235,0.1);color:var(--accent)">${Icons.info}</div>
      <div class="menu-text"><div class="menu-title">About</div><div class="menu-sub">App info, legal & privacy</div></div>
      <div class="menu-arrow">${Icons.chevron}</div>
    </div>
  </div>
  
  <div class="menu-list" style="margin-top:8px">
    <div class="menu-item" onclick="doLogout()">
      <div class="menu-icon" style="background:rgba(220,38,38,0.08);color:var(--red)">${Icons.logout}</div>
      <div class="menu-text"><div class="menu-title" style="color:var(--red)">Sign Out</div><div class="menu-sub">Log out of your account</div></div>
    </div>
  </div>

  <div style="text-align:center;padding:20px;font-size:11px;color:var(--muted)">
    LocalMart Hub v1.0 · Partner ${State.partner?.id || ''}<br>
    <span style="color:#bfdbfe">© 2025 LocalMart Technologies</span>
  </div>
  <div class="spacer"></div>`;
}

/* ─── MODALS ────────────────────────────────────────────────── */
function modal(titleHTML, bodyHTML) {
  const ov = document.getElementById('modal-overlay');
  ov.innerHTML = `
  <div class="modal-sheet">
    <div class="modal-handle"></div>
    <div class="modal-title">${titleHTML}</div>
    ${bodyHTML}
  </div>`;
  ov.classList.add('open');
  ov.onclick = e => { if (e.target === ov) closeModal(); };
}
function closeModal() { document.getElementById('modal-overlay').classList.remove('open'); }

function openHelpModal() {
  modal('Help & Support', `
    <div style="text-align:center;padding:10px 0 20px">
      <div style="width:60px;height:60px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 4px 16px rgba(37,99,235,0.3)">${Icons.support.replace('stroke="currentColor"','stroke="white"')}</div>
      <div style="font-size:18px;font-weight:800">We're here to help</div>
      <div style="font-size:12px;color:var(--muted);margin-top:4px">LocalMart Hub – Partner Support</div>
    </div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:16px;border:1px solid var(--border);margin-bottom:14px">
      <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Phone Support</div>
      <a href="tel:+919491413357" style="font-size:16px;font-weight:700;color:var(--accent);text-decoration:none">📞 +91 94914 13357</a>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">Mon – Sat, 9 AM – 8 PM</div>
    </div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:16px;border:1px solid var(--border);margin-bottom:14px">
      <div style="font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px">Email Support</div>
      <a href="mailto:blazrlit@gmail.com" style="font-size:16px;font-weight:700;color:var(--accent);text-decoration:none">✉️ blazrlit@gmail.com</a>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">We usually respond within 24 hours</div>
    </div>
    <div style="background:var(--bg);border-radius:var(--radius-sm);padding:16px;border:1px solid var(--border)">
      <div style="font-size:13px;font-weight:700;margin-bottom:8px">Common Help Topics</div>
      <div style="font-size:13px;color:var(--muted);line-height:1.8">
        • Order pickup & delivery issues<br>
        • Wallet & withdrawal queries<br>
        • Document verification status<br>
        • Account & profile updates<br>
        • Referral & incentive questions
      </div>
    </div>
    <button class="btn-secondary" onclick="closeModal()" style="margin-top:14px">Close</button>
  `);
}

function openAboutModal() {
  modal('About LocalMart Hub', `
    <div style="text-align:center;padding:10px 0 20px">
      <div style="width:60px;height:60px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;box-shadow:0 4px 16px rgba(37,99,235,0.3)">${Icons.truck.replace('stroke="currentColor"','stroke="white"')}</div>
      <div style="font-size:22px;font-weight:800">LocalMart Hub</div>
      <div style="font-size:12px;color:var(--muted);font-family:var(--mono);margin-top:4px">v1.0.0 · Partner Edition</div>
    </div>
    <div style="background:linear-gradient(135deg,#eff6ff,#f0fdf4);border-radius:var(--radius-sm);padding:18px;margin-bottom:14px;border:1px solid var(--border)">
      <div style="font-size:14px;font-weight:800;color:var(--accent);margin-bottom:8px">🚀 Our Mission</div>
      <p style="font-size:13px;color:var(--text);line-height:1.7;margin:0">
        Anyone can work without any restrictions and earn money. No boss, no limited time —
        work whenever you want, as much as you want. LocalMart Hub gives every delivery partner
        complete freedom and fair, transparent earnings.
      </p>
    </div>
    <p style="font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:20px;text-align:center">
      Empowering hyperlocal delivery partners across Vijayawada and surrounding zones with fair pay and transparent earnings.
    </p>
    <div style="text-align:center;margin-top:8px;font-size:11px;color:var(--muted)">© 2025 LocalMart Technologies Pvt. Ltd.</div>
    <button class="btn-secondary" onclick="closeModal()" style="margin-top:16px">Close</button>
  `);
}

function openWithdrawModal() {
  const w = (State.earnings && State.earnings.wallet) || {};
  modal('Withdraw Funds', `
    <p style="color:var(--muted);font-size:13px;margin-bottom:16px">Available: <strong style="color:var(--text)">₹${fmt(w.balance || 0)}</strong></p>
    <div class="field-group">
      <label class="field-label">Amount (Min ₹${w.min_withdraw || 100})</label>
      <input class="field-input" type="number" id="withdraw-amt" placeholder="Enter amount" inputmode="numeric" />
    </div>
    <button class="btn-primary" onclick="doWithdraw()">Withdraw Now</button>
    <button class="btn-secondary" onclick="closeModal()">Cancel</button>
  `);
}

function openOrdersModal() {
  const orders = State.orders;
  modal('All Orders', orders.length === 0
    ? `<div class="empty-state"><div class="empty-icon">📦</div><div class="empty-title">No orders yet</div></div>`
    : orders.map(o => `
    <div class="order-card" style="margin:0 0 10px">
      <div class="order-card-top">
        <div>
          <div class="order-id">${o.id}</div>
          <div class="order-item">${o.item}</div>
          <div class="order-customer">${o.customer_name || 'Customer'}</div>
        </div>
        ${statusBadge(o.status)}
      </div>
      <div class="order-card-bottom">
        <span class="order-earn">+₹${fmt(o.commission || 0)}</span>
        <span class="order-meta">${fmtDate(o.created_at)}</span>
      </div>
    </div>`).join(''));
}

function openOrderDetail(orderId) {
  const o = State.orders.find(x => x.id === orderId);
  if (!o) return;
  modal(`Order ${o.id}`, `
    <div style="display:flex;flex-direction:column;gap:12px">
      <div style="background:var(--bg);border-radius:var(--radius-sm);padding:14px">${statusBadge(o.status)}<div style="font-size:16px;font-weight:700;margin-top:8px">${o.item}</div></div>
      <div style="display:flex;flex-direction:column;gap:0">
        ${[['Customer',o.customer_name||'—'],['Category',o.category||'—'],['Distance',`${o.distance_km||0} km`],['Date',fmtDate(o.created_at)]].map(([k,v])=>`
        <div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--muted);font-size:13px">${k}</span><span style="font-weight:600;font-size:13px">${v}</span>
        </div>`).join('')}
        <div style="display:flex;justify-content:space-between;padding:11px 0">
          <span style="color:var(--muted);font-size:13px">Commission</span>
          <span style="font-weight:800;font-size:15px;color:var(--green)">₹${fmt(o.commission)}</span>
        </div>
      </div>
      ${o.status === 'pending' ? `<button class="btn-primary" onclick="updateOrderStatus('${o.id}','picked')">Mark as Picked Up</button>` : ''}
      ${o.status === 'picked'  ? `<button class="btn-primary" onclick="updateOrderStatus('${o.id}','done')">Mark as Delivered ✓</button>` : ''}
      <button class="btn-secondary" onclick="closeModal()">Close</button>
    </div>`);
}

function openProfileModal() {
  const p = State.partner || {};
  modal('Edit Profile', `
    <div style="text-align:center;margin-bottom:16px">
      <div id="modal-photo" style="width:72px;height:72px;border-radius:50%;margin:0 auto 8px;background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:800;color:white;overflow:hidden">
        ${p.profile_photo_url ? `<img src="${p.profile_photo_url}" style="width:100%;height:100%;object-fit:cover"/>` : initials(p.name)}
      </div>
      <label style="display:inline-block;font-size:12px;font-weight:700;color:var(--accent);cursor:pointer">
        📷 Change Photo
        <input type="file" accept="image/*" style="display:none" onchange="previewAndUploadPhotoModal(this)" />
      </label>
    </div>
    <div class="field-group"><label class="field-label">Full Name</label>
      <input class="field-input" id="p-name" value="${p.name||''}" /></div>
    <div class="field-group"><label class="field-label">Email</label>
      <input class="field-input" type="email" id="p-email" value="${p.email||''}" /></div>
    <div class="row-2">
      <div class="field-group"><label class="field-label">Date of Birth</label>
        <input class="field-input" type="date" id="p-dob" value="${p.dob||''}" /></div>
      <div class="field-group"><label class="field-label">Gender</label>
        <select class="field-input" id="p-gender">
          <option ${p.gender==='Male'?'selected':''}>Male</option>
          <option ${p.gender==='Female'?'selected':''}>Female</option>
          <option ${p.gender==='Other'?'selected':''}>Other</option>
        </select></div>
    </div>
    <div class="field-group"><label class="field-label">Preferred Location / Area</label>
      <input class="field-input" id="p-zone" value="${p.zone||''}" placeholder="e.g. Benz Circle, Kanuru…" /></div>
    <div class="field-group"><label class="field-label">Address</label>
      <input class="field-input" id="p-address" value="${p.address||''}" /></div>
    <button class="btn-primary" onclick="saveProfile()">Save Changes</button>
    <button class="btn-secondary" onclick="closeModal()">Cancel</button>`);
}

async function previewAndUploadPhotoModal(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const data = e.target.result;
    const el = document.getElementById('modal-photo');
    if (el) el.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover"/>`;
    const { ok, data: res } = await api('POST', '/profile/photo', { image_data: data });
    if (ok) { State.partner.profile_photo_url = res.url; toast('Photo updated!', 'success'); refreshPage('account'); }
    else toast(res.error || 'Upload failed', 'error');
  };
  reader.readAsDataURL(file);
}

function openDocumentsModal() {
  const d = (State.partner && State.partner.documents) || {};
  const imgView = (label, existing) => `
  <div class="field-group">
    <label class="field-label">${label}</label>
    <div style="border:1.5px solid var(--border);border-radius:10px;padding:14px;text-align:center;background:var(--bg)">
      ${existing
        ? `<img src="${existing}" style="max-height:120px;border-radius:6px;object-fit:cover"/>`
        : `<div style="font-size:24px;margin-bottom:4px">📄</div><div style="font-size:12px;color:var(--muted)">Not uploaded</div>`}
    </div>
  </div>`;
  modal('My Documents', `
    ${imgView('Aadhaar Card',          d.aadhaar_img)}
    ${imgView('PAN Card',              d.pan_img)}
    ${imgView('Driving Licence',       d.licence_img)}
    ${imgView('Vehicle RC Book',       d.rc_img)}
    ${imgView('Insurance Certificate', d.insurance_img)}
    ${imgView('PUC Certificate',       d.puc_img)}
    <button class="btn-secondary" onclick="closeModal()">Close</button>`);
}
function openVehicleModal() {
  const v = (State.partner && (State.partner.vehicle_details || State.partner.vehicle)) || {};
  const row = (label, val) => `
  <div style="display:flex;justify-content:space-between;padding:11px 0;border-bottom:1px solid var(--border)">
    <span style="color:var(--muted);font-size:13px">${label}</span>
    <span style="font-weight:600;font-size:13px">${val || '—'}</span>
  </div>`;
  modal('Vehicle Details', `
    <div style="display:flex;flex-direction:column">
      ${row('Vehicle Type',       v.vehicle_type)}
      ${row('Reg. Number',        v.reg_number)}
      ${row('Make',               v.make)}
      ${row('Model',              v.model)}
      ${row('Year',               v.year)}
      ${row('Colour',             v.colour)}
      ${row('RC Expiry',          v.rc_expiry)}
      ${row('Insurance Expiry',   v.insurance_expiry)}
    </div>
    <button class="btn-secondary" onclick="closeModal()" style="margin-top:16px">Close</button>`);
}

function openBankModal() {
  const b = (State.partner && State.partner.bank) || {};
  modal('Bank & UPI', `
    <div class="field-group"><label class="field-label">Bank Name</label>
      <input class="field-input" id="b-bank" value="${b.bank_name||''}" placeholder="State Bank of India…" /></div>
    <div class="field-group"><label class="field-label">Account Holder Name</label>
      <input class="field-input" id="b-holder" value="${b.account_holder||''}" placeholder="As per bank records" /></div>
    <div class="field-group"><label class="field-label">Account Number</label>
      <input class="field-input" id="b-acc" value="${b.account_number||''}" placeholder="Account number" inputmode="numeric" /></div>
    <div class="row-2">
      <div class="field-group"><label class="field-label">IFSC Code</label>
        <input class="field-input" id="b-ifsc" value="${b.ifsc||''}" placeholder="SBIN0001234" style="text-transform:uppercase" /></div>
      <div class="field-group"><label class="field-label">Branch</label>
        <input class="field-input" id="b-branch" value="${b.branch||''}" placeholder="Branch name" /></div>
    </div>
    <div class="field-group"><label class="field-label">UPI ID (Optional)</label>
      <input class="field-input" id="b-upi" value="${(State.partner&&State.partner.upi_ids&&State.partner.upi_ids[0])||''}" placeholder="yourname@upi" /></div>
    <button class="btn-primary" onclick="saveBank()">Save Bank Details</button>
    <button class="btn-secondary" onclick="closeModal()">Cancel</button>`);
}

function openEmergencyModal() {
  const ec = (State.partner && State.partner.emergency) || {};
  const hi = (State.partner && State.partner.health) || {};
  modal('Emergency & Health', `
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:12px">Emergency Contact</div>
    <div class="field-group"><label class="field-label">Contact Name</label>
      <input class="field-input" id="ec-name" value="${ec.contact_name||''}" placeholder="Full name" /></div>
    <div class="row-2">
      <div class="field-group"><label class="field-label">Relationship</label>
        <input class="field-input" id="ec-rel" value="${ec.relationship||''}" placeholder="Spouse, Parent…" /></div>
      <div class="field-group"><label class="field-label">Phone</label>
        <input class="field-input" id="ec-phone" value="${ec.phone||''}" placeholder="10-digit" inputmode="numeric" /></div>
    </div>
    <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin:16px 0 12px">Health Info</div>
    <div class="row-2">
      <div class="field-group"><label class="field-label">Blood Group</label>
        <select class="field-input" id="hi-blood">
          <option value="">Select</option>
          ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg=>`<option ${hi.blood_group===bg?'selected':''}>${bg}</option>`).join('')}
        </select></div>
      <div class="field-group"><label class="field-label">Allergies</label>
        <input class="field-input" id="hi-allergy" value="${hi.allergies||''}" placeholder="If any" /></div>
    </div>
    <button class="btn-primary" onclick="saveEmergency()">Save Details</button>
    <button class="btn-secondary" onclick="closeModal()">Cancel</button>`);
}

/* ─── ACTIONS ───────────────────────────────────────────────── */
async function doLogin() {
  const phone = document.getElementById('login-phone').value.trim();
  const pass  = document.getElementById('login-pass').value;
  if (!phone || !pass) return toast('Enter phone and password', 'error');
  const { ok, data } = await api('POST', '/auth/login', { phone, password: pass });
  if (!ok) return toast(data.error || 'Login failed', 'error');
  State.token = data.token; localStorage.setItem('lmh_token', data.token); State.partner = data.partner;
  await loadAll();
  initApp();
}

/* phone OTP verified flag */
let _phoneVerified = false;



async function doRegister() {
  const body = {
    name:          document.getElementById('reg-name').value.trim(),
    phone:         document.getElementById('reg-phone').value.trim(),
    email:         document.getElementById('reg-email').value.trim().toLowerCase(),
    password:      document.getElementById('reg-pass').value,
    zone:          document.getElementById('reg-zone').value.trim(),
    vehicle_type:  document.getElementById('reg-vehicle').value,
    referral_code: document.getElementById('reg-ref').value.trim().toUpperCase(),
  };
  if (!body.name || !body.phone || !body.email || !body.password)
    return toast('Please fill all required fields', 'error');
  if (body.name.length < 2)
    return toast('Enter your full name (at least 2 characters)', 'error');
  if (!/^[6-9]\d{9}$/.test(body.phone))
    return toast('Enter a valid 10-digit Indian mobile number (starts with 6–9)', 'error');
  if (!/^[\w.+\-]+@[\w\-]+\.[a-z]{2,}$/i.test(body.email))
    return toast('Enter a valid email address', 'error');
  if (body.password.length < 6)
    return toast('Password must be at least 6 characters', 'error');
  if (!body.zone)
    return toast('Enter your preferred location / area', 'error');
  if (!body.vehicle_type)
    return toast('Please select your vehicle type', 'error');

  // Then send email OTP
  const sendBtn = document.querySelector('#register-screen .btn-primary');
  if (sendBtn) { sendBtn.disabled = true; sendBtn.textContent = 'Sending Email OTP…'; }
  const { ok: sent, data: sentData } = await api('POST', '/auth/send-otp', { email: body.email, purpose: 'register' });
  if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = 'Create Account →'; }
  if (!sent) return toast(sentData.error || 'Failed to send email OTP', 'error');
  toast('OTP sent to your email!', 'success');
  showEmailOtpScreen(body);
}

function showEmailOtpScreen(regBody) {
  document.getElementById('app').innerHTML = `
  <div class="auth-screen" id="otp-screen">
    <div class="auth-logo">
      <div class="logo-icon">${Icons.truck}</div>
      <div class="logo-text">LocalMart <span>Hub</span></div>
    </div>
    <h1 class="auth-heading">Verify Email</h1>
    <p class="auth-sub">Enter the 6-digit OTP sent to<br/><strong>${regBody.email}</strong></p>
    <div class="field-group">
      <label class="field-label">Email OTP</label>
      <input class="field-input" type="text" id="otp-input" placeholder="Enter 6-digit OTP"
        maxlength="6" inputmode="numeric"
        style="font-size:28px;font-weight:800;letter-spacing:10px;text-align:center" />
    </div>
    <button class="btn-primary" id="otp-btn" onclick="submitEmailOtp(${JSON.stringify(regBody).replace(/"/g,'&quot;')})">Verify & Create Account →</button>
    <div style="text-align:center;margin-top:12px">
      <a onclick="resendEmailOtp(${JSON.stringify(regBody).replace(/"/g,'&quot;')})" style="font-size:13px;color:var(--accent);cursor:pointer">Resend OTP</a>
      &nbsp;·&nbsp;
      <a onclick="showRegister()" style="font-size:13px;color:var(--muted);cursor:pointer">Go back</a>
    </div>
  </div>`;
}

async function submitEmailOtp(regBody) {
  const otp = document.getElementById('otp-input').value.trim();
  if (otp.length !== 6) return toast('Enter the 6-digit OTP', 'error');
  const btn = document.getElementById('otp-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Verifying…'; }
  const { ok: verified, data: vData } = await api('POST', '/auth/verify-otp', { email: regBody.email, otp, purpose: 'register' });
  if (!verified) {
    if (btn) { btn.disabled = false; btn.textContent = 'Verify & Create Account →'; }
    return toast(vData.error || 'Verification failed', 'error');
  }
  const { ok, data } = await api('POST', '/auth/register', regBody);
  if (!ok) return toast(data.error || 'Registration failed', 'error');
  State.token = data.token; localStorage.setItem('lmh_token', data.token); State.partner = data.partner;
  await loadAll();
  showProfileSetup(1);
}

async function resendEmailOtp(regBody) {
  const { ok, data } = await api('POST', '/auth/send-otp', { email: regBody.email, purpose: 'register' });
  toast(ok ? 'New OTP sent!' : (data.error || 'Failed'), ok ? 'success' : 'error');
}

/* ─── FORGOT PASSWORD ───────────────────────────────────────── */
/* ─── FORGOT PASSWORD — PHONE OTP ──────────────────────────── */
/* ─── FORGOT PASSWORD — PHONE OTP ──────────────────────────── */
function showForgotPassword() {
  document.getElementById('app').innerHTML = `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-icon">${Icons.truck}</div>
      <div class="logo-text">LocalMart <span>Hub</span></div>
    </div>
    <h1 class="auth-heading">Forgot Password?</h1>
    <p class="auth-sub">Enter your registered mobile number. We'll send a 6-digit OTP via SMS to verify it's you.</p>
    <div class="field-group">
      <label class="field-label">Registered Mobile Number</label>
      <input class="field-input" type="tel" id="fp-phone" placeholder="10-digit mobile number"
             maxlength="10" inputmode="numeric" />
    </div>
    <button class="btn-primary" id="fp-btn1" onclick="fpSendOTP()">Send OTP via SMS →</button>
    <button class="btn-secondary" onclick="showLogin()">← Back to Sign In</button>
  </div>`;
}

async function fpSendOTP() {
  const phone = (document.getElementById('fp-phone').value || '').trim();
  if (!/^[6-9]\d{9}$/.test(phone)) return toast('Enter a valid 10-digit mobile number', 'error');
  const btn = document.getElementById('fp-btn1');
  btn.disabled = true; btn.textContent = 'Sending SMS…';
  const { ok, data } = await api('POST', '/auth/forgot/send-otp', { phone });
  btn.disabled = false; btn.textContent = 'Send OTP via SMS →';
  if (!ok) return toast(data.error || 'Failed to send OTP', 'error');
  State.forgotPhone = phone;
  const via  = data.sent_via === 'email' ? 'email' : 'SMS';
  const dest = data.destination || `your mobile`;
  toast(`OTP sent via ${via}!`, 'success');
  document.getElementById('app').innerHTML = `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-icon">${Icons.truck}</div>
      <div class="logo-text">LocalMart <span>Hub</span></div>
    </div>
    <h1 class="auth-heading">Enter OTP</h1>
    <p class="auth-sub">Enter the 6-digit OTP sent to <strong>${dest}</strong> via ${via}.</p>
    <div class="field-group">
      <label class="field-label">OTP</label>
      <input class="field-input" type="tel" id="fp-otp"
             placeholder="• • • • • •" maxlength="6" inputmode="numeric"
             style="font-size:28px;font-weight:800;letter-spacing:12px;text-align:center" />
    </div>
    <div style="text-align:center;margin-bottom:8px">
      <a onclick="showForgotPassword()" style="font-size:13px;color:var(--accent);cursor:pointer;font-weight:600">Resend OTP</a>
    </div>
    <button class="btn-primary" id="fp-btn2" onclick="fpVerifyOTP()">Verify OTP →</button>
    <button class="btn-secondary" onclick="showForgotPassword()">← Change Number</button>
  </div>`;
}

async function fpVerifyOTP() {
  const otp = (document.getElementById('fp-otp').value || '').trim();
  if (otp.length !== 6) return toast('Enter the 6-digit OTP', 'error');
  const btn = document.getElementById('fp-btn2');
  btn.disabled = true; btn.textContent = 'Verifying…';
  const { ok, data } = await api('POST', '/auth/forgot/verify-otp', { phone: State.forgotPhone, otp });
  btn.disabled = false;
  if (!ok) return toast(data.error || 'Verification failed', 'error');
  State.forgotResetToken = data.reset_token;
  document.getElementById('app').innerHTML = `
  <div class="auth-screen">
    <div class="auth-logo">
      <div class="logo-icon">${Icons.truck}</div>
      <div class="logo-text">LocalMart <span>Hub</span></div>
    </div>
    <h1 class="auth-heading">Set New Password</h1>
    <p class="auth-sub">Choose a strong password — at least 6 characters.</p>
    <div class="field-group">
      <label class="field-label">New Password</label>
      <input class="field-input" type="password" id="fp-newpass" placeholder="Min. 6 characters" />
    </div>
    <div class="field-group">
      <label class="field-label">Confirm Password</label>
      <input class="field-input" type="password" id="fp-confirm" placeholder="Re-enter new password" />
    </div>
    <button class="btn-primary" id="fp-btn3" onclick="fpResetPassword()">Update Password →</button>
  </div>`;
}

async function fpResetPassword() {
  const newPass = (document.getElementById('fp-newpass').value || '').trim();
  const confirm = (document.getElementById('fp-confirm').value || '').trim();
  if (newPass.length < 6) return toast('Password must be at least 6 characters', 'error');
  if (newPass !== confirm)  return toast('Passwords do not match', 'error');
  const btn = document.getElementById('fp-btn3');
  btn.disabled = true; btn.textContent = 'Updating…';
  const { ok, data } = await api('POST', '/auth/forgot/reset-password', {
    reset_token:      State.forgotResetToken,
    new_password:     newPass,
    confirm_password: confirm
  });
  btn.disabled = false;
  if (!ok) return toast(data.error || 'Reset failed', 'error');
  State.forgotPhone = null; State.forgotResetToken = null;
  toast('Password updated! Please sign in.', 'success');
  setTimeout(showLogin, 1500);
}

/* ─── PROFILE SETUP (post-registration 5-step wizard) ──────── */
let _setupStep = 1;

function showProfileSetup(step = 1) {
  _setupStep = step;
  const steps = ['My Profile', 'Documents', 'Vehicle', 'Bank & UPI', 'Emergency'];
  const pct   = Math.round((step / steps.length) * 100);
  const content = [null, renderSetupProfile, renderSetupDocuments,
                   renderSetupVehicle, renderSetupBank, renderSetupEmergency][step]();
  document.getElementById('app').innerHTML = `
  <div style="min-height:100vh;background:var(--bg);display:flex;flex-direction:column">
    <div style="background:var(--surface);padding:20px 20px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
        <div style="flex:1">
          <div style="font-size:11px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:0.5px">Step ${step} of ${steps.length}</div>
          <div style="font-size:18px;font-weight:800;color:var(--text);margin-top:2px">${steps[step-1]}</div>
        </div>
        <button onclick="skipSetupStep()" style="background:none;border:none;font-size:13px;color:var(--muted);cursor:pointer;padding:6px 0">Skip</button>
      </div>
      <div style="height:4px;background:var(--border);border-radius:2px">
        <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,var(--accent),var(--accent2));border-radius:2px;transition:width 0.4s"></div>
      </div>
      <div style="display:flex;gap:4px;padding:10px 0 0">
        ${steps.map((s,i) => `
        <div style="flex:1;text-align:center">
          <div style="width:22px;height:22px;border-radius:50%;margin:0 auto 2px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;
            background:${i+1<step?'var(--green)':i+1===step?'var(--accent)':'var(--border)'};
            color:${i+1<=step?'white':'var(--muted)'}">
            ${i+1<step?'✓':i+1}
          </div>
          <div style="font-size:9px;color:${i+1===step?'var(--accent)':'var(--muted)'};font-weight:${i+1===step?700:400}">${s.split(' ')[0]}</div>
        </div>`).join('')}
      </div>
    </div>
    <div style="flex:1;overflow-y:auto;padding:20px 20px 120px">${content}</div>
    <div style="position:fixed;bottom:0;left:0;right:0;background:var(--surface);padding:16px 20px;border-top:1px solid var(--border);display:flex;gap:10px">
      ${step > 1 ? `<button class="btn-secondary" style="flex:0.4" onclick="showProfileSetup(${step-1})">← Back</button>` : ''}
      <button class="btn-primary" id="setup-save-btn" style="flex:1" onclick="saveSetupStep(${step})">${step===steps.length?'Finish & Go Home 🎉':'Save & Continue →'}</button>
    </div>
  </div>
  <div class="modal-overlay" id="modal-overlay"></div>`;
}

function renderSetupProfile() {
  const p = State.partner || {};
  return `
  <div style="text-align:center;margin-bottom:20px">
    <div id="photo-preview" style="width:90px;height:90px;border-radius:50%;margin:0 auto 10px;
      background:linear-gradient(135deg,var(--accent),var(--accent2));display:flex;align-items:center;
      justify-content:center;font-size:32px;font-weight:800;color:white;overflow:hidden">
      ${p.profile_photo_url ? `<img src="${p.profile_photo_url}" style="width:100%;height:100%;object-fit:cover"/>` : initials(p.name)}
    </div>
    <label style="display:inline-block;background:var(--accent);color:white;font-size:12px;font-weight:700;padding:7px 16px;border-radius:8px;cursor:pointer">
      📷 Upload Face Photo *
      <input type="file" accept="image/*" style="display:none" onchange="previewAndUploadPhoto(this)" />
    </label>
    <div style="font-size:11px;color:var(--muted);margin-top:6px">Clear face photo required</div>
  </div>
  <div class="field-group"><label class="field-label">Full Name *</label>
    <input class="field-input" id="sp-name" value="${p.name||''}" placeholder="Your full name" /></div>
  <div class="field-group"><label class="field-label">Email *</label>
    <input class="field-input" type="email" id="sp-email" value="${p.email||''}" /></div>
  <div class="row-2">
    <div class="field-group"><label class="field-label">Date of Birth *</label>
      <input class="field-input" type="date" id="sp-dob" value="${p.dob||''}" /></div>
    <div class="field-group"><label class="field-label">Gender *</label>
      <select class="field-input" id="sp-gender">
        <option value="">Select</option>
        ${['Male','Female','Other'].map(g=>`<option ${p.gender===g?'selected':''}>${g}</option>`).join('')}
      </select></div>
  </div>
  <div class="field-group"><label class="field-label">Preferred Location / Area *</label>
    <input class="field-input" id="sp-zone" value="${p.zone||''}" placeholder="e.g. Benz Circle, Kanuru…" /></div>
  <div class="field-group"><label class="field-label">Full Residential Address *</label>
    <input class="field-input" id="sp-address" value="${p.address||''}" placeholder="Door no, Street, Area, City" /></div>`;
}

function renderSetupDocuments() {
  const d = (State.partner && State.partner.documents) || {};
  const imgField = (label, docType, existing) => `
  <div class="field-group">
    <label class="field-label">${label} *</label>
    <div id="doc-wrap-${docType}" style="border:2px dashed var(--border);border-radius:10px;padding:14px;text-align:center;cursor:pointer;background:var(--bg)"
      onclick="document.getElementById('img-${docType}').click()">
      ${existing ? `<img src="${existing}" style="max-height:80px;border-radius:6px;margin-bottom:4px"/><br/><div style="font-size:11px;color:var(--green);font-weight:700">✓ Uploaded – tap to replace</div>`
                 : `<div style="font-size:24px;margin-bottom:4px">📄</div><div style="font-size:12px;color:var(--muted)">Tap to upload image</div>`}
    </div>
    <input type="file" id="img-${docType}" accept="image/*" style="display:none" onchange="uploadDocImage(this,'${docType}')" />
  </div>`;
  return `
  ${imgField('Aadhaar Card', 'aadhaar', d.aadhaar_img)}
  ${imgField('PAN Card', 'pan', d.pan_img)}
  ${imgField('Driving Licence', 'licence', d.licence_img)}
  ${imgField('Vehicle RC Book', 'rc', d.rc_img)}
  ${imgField('Insurance Certificate', 'insurance', d.insurance_img)}
  ${imgField('PUC Certificate', 'puc', d.puc_img)}`;
}

function renderSetupVehicle() {
  const v = (State.partner && State.partner.vehicle_details) || {};
  return `
  <div class="row-2">
    <div class="field-group"><label class="field-label">Vehicle Type *</label>
      <select class="field-input" id="sv-type">
        <option value="">Select</option>
        ${['Motorcycle','Scooter','Bicycle','Electric Scooter'].map(t=>`<option ${v.vehicle_type===t?'selected':''}>${t}</option>`).join('')}
      </select></div>
    <div class="field-group"><label class="field-label">Reg. Number *</label>
      <input class="field-input" id="sv-reg" value="${v.reg_number||''}" placeholder="AP39XX1234" style="text-transform:uppercase" /></div>
  </div>
  <div class="row-2">
    <div class="field-group"><label class="field-label">Make *</label>
      <input class="field-input" id="sv-make" value="${v.make||''}" placeholder="Honda, TVS…" /></div>
    <div class="field-group"><label class="field-label">Model *</label>
      <input class="field-input" id="sv-model" value="${v.model||''}" placeholder="Activa, Jupiter…" /></div>
  </div>
  <div class="row-2">
    <div class="field-group"><label class="field-label">Year *</label>
      <input class="field-input" id="sv-year" value="${v.year||''}" placeholder="2021" inputmode="numeric" /></div>
    <div class="field-group"><label class="field-label">Colour *</label>
      <input class="field-input" id="sv-colour" value="${v.colour||''}" placeholder="Red, Blue…" /></div>
  </div>
  <div class="row-2">
    <div class="field-group"><label class="field-label">RC Expiry *</label>
      <input class="field-input" type="date" id="sv-rc-exp" value="${v.rc_expiry||''}" /></div>
    <div class="field-group"><label class="field-label">Insurance Expiry *</label>
      <input class="field-input" type="date" id="sv-ins-exp" value="${v.insurance_expiry||''}" /></div>
  </div>`;
}

function renderSetupBank() {
  const b = (State.partner && State.partner.bank) || {};
  return `
  <div class="field-group"><label class="field-label">Bank Name *</label>
    <input class="field-input" id="sb-bank" value="${b.bank_name||''}" placeholder="State Bank of India…" /></div>
  <div class="field-group"><label class="field-label">Account Holder Name *</label>
    <input class="field-input" id="sb-holder" value="${b.account_holder||''}" placeholder="As per bank records" /></div>
  <div class="field-group"><label class="field-label">Account Number *</label>
    <input class="field-input" id="sb-acc" value="${b.account_number||''}" placeholder="Account number" inputmode="numeric" /></div>
  <div class="row-2">
    <div class="field-group"><label class="field-label">IFSC Code *</label>
      <input class="field-input" id="sb-ifsc" value="${b.ifsc||''}" placeholder="SBIN0001234" style="text-transform:uppercase" /></div>
    <div class="field-group"><label class="field-label">Branch *</label>
      <input class="field-input" id="sb-branch" value="${b.branch||''}" placeholder="Branch name" /></div>
  </div>
  <div class="field-group"><label class="field-label">UPI ID (Optional)</label>
    <input class="field-input" id="sb-upi" value="${(State.partner&&State.partner.upi_ids&&State.partner.upi_ids[0])||''}" placeholder="yourname@upi" /></div>`;
}

function renderSetupEmergency() {
  const ec = (State.partner && State.partner.emergency) || {};
  const hi = (State.partner && State.partner.health)    || {};
  return `
  <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:12px">Emergency Contact</div>
  <div class="field-group"><label class="field-label">Contact Name *</label>
    <input class="field-input" id="se-name" value="${ec.contact_name||''}" placeholder="Full name" /></div>
  <div class="row-2">
    <div class="field-group"><label class="field-label">Relationship *</label>
      <input class="field-input" id="se-rel" value="${ec.relationship||''}" placeholder="Spouse, Parent…" /></div>
    <div class="field-group"><label class="field-label">Phone *</label>
      <input class="field-input" type="tel" id="se-phone" value="${ec.phone||''}" placeholder="10-digit" inputmode="numeric" /></div>
  </div>
  <div style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.6px;margin:16px 0 12px">Health Info</div>
  <div class="row-2">
    <div class="field-group"><label class="field-label">Blood Group *</label>
      <select class="field-input" id="se-blood">
        <option value="">Select</option>
        ${['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(bg=>`<option ${hi.blood_group===bg?'selected':''}>${bg}</option>`).join('')}
      </select></div>
    <div class="field-group"><label class="field-label">Allergies</label>
      <input class="field-input" id="se-allergy" value="${hi.allergies||''}" placeholder="None" /></div>
  </div>`;
}

async function saveSetupStep(step) {
  const btn = document.getElementById('setup-save-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
  const re_enable = () => { if (btn) { btn.disabled = false; btn.textContent = step===5?'Finish & Go Home 🎉':'Save & Continue →'; } };

  if (step === 1) {
    const name  = document.getElementById('sp-name').value.trim();
    const email = document.getElementById('sp-email').value.trim().toLowerCase();
    const dob   = document.getElementById('sp-dob').value;
    const gender= document.getElementById('sp-gender').value;
    const zone  = document.getElementById('sp-zone').value.trim();
    const addr  = document.getElementById('sp-address').value.trim();
    if (!name)   { re_enable(); return toast('Full name is required', 'error'); }
    if (!email)  { re_enable(); return toast('Email is required', 'error'); }
    if (!dob)    { re_enable(); return toast('Date of birth is required', 'error'); }
    if (!gender) { re_enable(); return toast('Please select gender', 'error'); }
    if (!zone)   { re_enable(); return toast('Preferred location is required', 'error'); }
    if (!addr)   { re_enable(); return toast('Address is required', 'error'); }
    if (!State.partner.profile_photo_url) { re_enable(); return toast('Please upload your face photo', 'error'); }
    const { ok, data } = await api('PUT', '/profile/personal', { name, email, dob, gender, zone, address: addr });
    if (!ok) { re_enable(); return toast(data.error || 'Save failed', 'error'); }

  } else if (step === 2) {
    // Images uploaded on-the-fly; just validate all uploaded
    const docs = (State.partner && State.partner.documents) || {};
    const required = ['aadhaar_img','pan_img','licence_img','rc_img','insurance_img','puc_img'];
    const labels   = ['Aadhaar Card','PAN Card','Driving Licence','RC Book','Insurance','PUC'];
    for (let i = 0; i < required.length; i++) {
      if (!docs[required[i]]) {
        // check if just uploaded in session (DOM preview exists)
        const wrap = document.getElementById(`doc-wrap-${required[i].replace('_img','')}`);
        const hasImg = wrap && wrap.querySelector('img');
        if (!hasImg) { re_enable(); return toast(`Please upload ${labels[i]}`, 'error'); }
      }
    }

  } else if (step === 3) {
    const vtype = document.getElementById('sv-type').value;
    const vreg  = document.getElementById('sv-reg').value.trim();
    const make  = document.getElementById('sv-make').value.trim();
    const model = document.getElementById('sv-model').value.trim();
    const year  = document.getElementById('sv-year').value.trim();
    const colour= document.getElementById('sv-colour').value.trim();
    const rcexp = document.getElementById('sv-rc-exp').value;
    const insexp= document.getElementById('sv-ins-exp').value;
    if (!vtype||!vreg||!make||!model||!year||!colour||!rcexp||!insexp)
      { re_enable(); return toast('All vehicle fields are required', 'error'); }
    const { ok, data } = await api('PUT', '/profile/vehicle',
      { vehicle_type:vtype, reg_number:vreg.toUpperCase(), make, model, year, colour, rc_expiry:rcexp, insurance_expiry:insexp });
    if (!ok) { re_enable(); return toast(data.error || 'Save failed', 'error'); }

  } else if (step === 4) {
    const bank  = document.getElementById('sb-bank').value.trim();
    const holder= document.getElementById('sb-holder').value.trim();
    const acc   = document.getElementById('sb-acc').value.trim();
    const ifsc  = document.getElementById('sb-ifsc').value.trim().toUpperCase();
    const branch= document.getElementById('sb-branch').value.trim();
    const upi   = document.getElementById('sb-upi').value.trim();
    if (!bank||!holder||!acc||!ifsc||!branch)
      { re_enable(); return toast('All bank fields are required', 'error'); }
    const { ok, data } = await api('PUT', '/profile/bank',
      { bank_name:bank, account_holder:holder, account_number:acc, ifsc, branch, upi_id:upi });
    if (!ok) { re_enable(); return toast(data.error || 'Save failed', 'error'); }

  } else if (step === 5) {
    const ecname  = document.getElementById('se-name').value.trim();
    const ecrel   = document.getElementById('se-rel').value.trim();
    const ecphone = document.getElementById('se-phone').value.trim();
    const blood   = document.getElementById('se-blood').value;
    const allergy = document.getElementById('se-allergy').value.trim();
    if (!ecname||!ecrel||!ecphone||!blood)
      { re_enable(); return toast('All emergency fields are required', 'error'); }
    if (!/^[6-9]\d{9}$/.test(ecphone))
      { re_enable(); return toast('Enter a valid 10-digit emergency contact number', 'error'); }
    const { ok, data } = await api('PUT', '/profile/emergency',
      { contact_name:ecname, relationship:ecrel, phone:ecphone, blood_group:blood, allergies:allergy });
    if (!ok) { re_enable(); return toast(data.error || 'Save failed', 'error'); }
    await loadAll(); initApp(); return;
  }

  await loadProfile();
  re_enable();
  showProfileSetup(step + 1);
}

function skipSetupStep() {
  if (_setupStep < 5) showProfileSetup(_setupStep + 1);
  else loadAll().then(() => initApp());
}

async function previewAndUploadPhoto(input) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const data = e.target.result;
    const preview = document.getElementById('photo-preview');
    if (preview) preview.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover"/>`;
    const { ok, data: res } = await api('POST', '/profile/photo', { image_data: data });
    if (ok) { if (!State.partner) State.partner = {}; State.partner.profile_photo_url = res.url; toast('Photo uploaded! ✓', 'success'); }
    else toast(res.error || 'Upload failed', 'error');
  };
  reader.readAsDataURL(file);
}

async function uploadDocImage(input, docType) {
  const file = input.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    const data = e.target.result;
    const wrap = document.getElementById(`doc-wrap-${docType}`);
    if (wrap) wrap.innerHTML = `
      <img src="${data}" style="max-height:80px;border-radius:6px;margin-bottom:4px"/><br/>
      <div style="font-size:11px;color:var(--green);font-weight:700">✓ Uploaded – tap to replace</div>
      <input type="file" id="img-${docType}" accept="image/*" style="display:none" onchange="uploadDocImage(this,'${docType}')"/>`;
    const { ok, data: res } = await api('POST', '/profile/docimage', { image_data: data, doc_type: docType });
    if (ok) {
      if (!State.partner) State.partner = {};
      if (!State.partner.documents) State.partner.documents = {};
      State.partner.documents[`${docType}_img`] = res.url;
    } else toast(res.error || 'Upload failed', 'error');
  };
  reader.readAsDataURL(file);
}

function doLogout() {
  stopEarningsPolling(); stopLocationTracking();
  State.token = null; State.partner = null; localStorage.removeItem('lmh_token'); showLogin();
}

function toggleOnline() {
  // Going online requires location to be active first
  if (!State.isOnline && !State.location) {
    toast('Please enable location first to go online', 'error');
    requestLocationPermission();
    return;
  }
  State.isOnline = !State.isOnline;
  if (State.isOnline) {
    startLocationTracking();
  } else {
    stopLocationTracking();
  }
  toast(`You are now ${State.isOnline ? 'Online 🟢' : 'Offline'}`, State.isOnline ? 'success' : 'error');
  refreshPage('home');
}

function requestLocationPermission() {
  if (!navigator.geolocation) {
    State.locationError = 'Geolocation not supported by your browser';
    refreshPage('home');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    pos => {
      State.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      State.locationError = null;
      pushLocation(State.location.lat, State.location.lng);
      toast('Location enabled! You can now go online ✅', 'success');
      refreshPage('home');
    },
    err => {
      const msgs = {
        1: 'Permission denied. On non-HTTPS sites, allow it via the lock/info icon next to the address bar, or use HTTPS.',
        2: 'Location unavailable. Check your device GPS/network.',
        3: 'Location request timed out.'
      };
      State.locationError = msgs[err.code] || 'Location error';
      refreshPage('home');
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );
}

function selectDay(el) {
  document.querySelectorAll('.cal-day').forEach(d => d.classList.remove('selected'));
  el.classList.add('selected');
}

let _shiftCheckInterval = null;
let _bookedSlot = null;

function toggleShift(el, time, startHour, endHour) {
  const tag      = el.querySelector('.shift-tag');
  const isBooked = el.classList.contains('booked');

  if (isBooked) {
    // Cancel
    el.classList.remove('booked');
    tag.className   = `shift-tag ${el.classList.contains('high') ? 'high' : 'open'}`;
    tag.textContent = el.classList.contains('high') ? '🔥 High' : 'Book';
    _bookedSlot = null;
    stopShiftLocationCheck();
    api('POST', '/shifts/cancel').then(() => toast(`Slot ${time} cancelled`));
  } else {
    // Cancel previous if any
    const prev = document.querySelector('.shift-slot.booked');
    if (prev) {
      const pt = prev.querySelector('.shift-tag');
      prev.classList.remove('booked');
      pt.className   = `shift-tag ${prev.classList.contains('high') ? 'high' : 'open'}`;
      pt.textContent = prev.classList.contains('high') ? '🔥 High' : 'Book';
    }
    // Book new
    el.classList.add('booked');
    tag.className   = 'shift-tag booked';
    tag.textContent = '✓ Booked';
    _bookedSlot = { time, startHour, endHour };

    api('POST', '/shifts/book', { slot_time: time, start_hour: startHour, end_hour: endHour })
      .then(() => {
        toast(`Shift booked: ${time} ✅`, 'success');
        startShiftLocationCheck(startHour, endHour);
      });
  }
}

function startShiftLocationCheck(startHour, endHour) {
  stopShiftLocationCheck(); // clear any existing

  _shiftCheckInterval = setInterval(() => {
    const now = new Date();
    const h   = now.getHours();

    // Only check during the booked slot window
    if (h < startHour || h >= endHour) return;

    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(pos => {
      api('POST', '/shifts/verify-location', {
        latitude:  pos.coords.latitude,
        longitude: pos.coords.longitude
      }).then(({ ok: success, data }) => {
        if (success && data.alert) {
          // Show alert to partner
          showLocationAlert(data.message, data.distance, data.zone);
        }
      });
    }, () => {}, { enableHighAccuracy: true, timeout: 8000 });

  }, 5 * 60 * 1000); // check every 5 minutes during shift
}

function stopShiftLocationCheck() {
  if (_shiftCheckInterval) {
    clearInterval(_shiftCheckInterval);
    _shiftCheckInterval = null;
  }
}

function showLocationAlert(message, distance, zone) {
  // Don't spam — show max once per 15 min
  const now     = Date.now();
  const lastAlert = parseInt(localStorage.getItem('last_zone_alert') || '0');
  if (now - lastAlert < 15 * 60 * 1000) return;
  localStorage.setItem('last_zone_alert', now.toString());

  // Show banner
  const banner = document.createElement('div');
  banner.innerHTML = `
    <div style="position:fixed;top:0;left:0;right:0;z-index:9999;
      background:#dc2626;color:white;padding:14px 16px;
      display:flex;align-items:center;gap:10px;box-shadow:0 4px 16px rgba(0,0,0,0.3)">
      <span style="font-size:22px">⚠️</span>
      <div style="flex:1">
        <div style="font-weight:800;font-size:14px">Out of Zone Alert!</div>
        <div style="font-size:12px;opacity:0.9;margin-top:2px">
          You are ${distance}km away from ${zone}. Please return to your zone.
        </div>
      </div>
      <button onclick="this.parentElement.parentElement.remove()"
        style="background:rgba(255,255,255,0.2);border:none;color:white;
        padding:6px 12px;border-radius:6px;cursor:pointer;font-weight:700">
        OK
      </button>
    </div>`;
  document.body.appendChild(banner);

  // Auto remove after 10 seconds
  setTimeout(() => banner.remove(), 10000);
}

function copyCode(code) {
  navigator.clipboard.writeText(code)
    .then(() => toast('Invite code copied! 📋', 'success'))
    .catch(() => toast('Copy failed — share manually', 'error'));
}

function shareViaWhatsApp(code) {
  const name = State.partner ? State.partner.name.split(' ')[0] : 'Partner';
  const msg  = encodeURIComponent(
    `🛵 Join me on LocalMart Hub!\n\n` +
    `${name} is inviting you to become a delivery partner.\n\n` +
    `💰 Earn daily · ₹100 joining bonus · Flexible hours\n\n` +
    `Use my code: *${code}*\nRegister: http://localhost:5000`
  );
  window.open(`https://wa.me/?text=${msg}`, '_blank');
}

function sendReferral() {
  const phone = document.getElementById('ref-phone').value.trim();
  const name  = document.getElementById('ref-name-input').value.trim();
  if (!phone || phone.length !== 10) return toast('Enter valid 10-digit number', 'error');

  const code    = (State.referrals && State.referrals.my_code) ||
                  (State.partner && State.partner.referral_code) || 'LMH-XXXX';
  const partnerName = State.partner ? State.partner.name.split(' ')[0] : 'A partner';
  const msg = encodeURIComponent(
    `Hi ${name || 'there'}! 👋\n\n` +
    `${partnerName} has invited you to join LocalMart Hub as a Delivery Partner.\n\n` +
    `🛵 Earn money delivering in your zone\n` +
    `💰 Get ₹100 joining bonus\n` +
    `🎁 Help ${partnerName} earn ₹200 by working consistently\n\n` +
    `Use referral code: *${code}* while registering\n\n` +
    `Download & register: http://localhost:5000`
  );

  // Open WhatsApp with pre-filled message to the entered number
  const waUrl = `https://wa.me/91${phone}?text=${msg}`;
  window.open(waUrl, '_blank');

  toast(`WhatsApp opened for ${name || phone} ✅`, 'success');
  document.getElementById('ref-phone').value = '';
  document.getElementById('ref-name-input').value = '';
}

async function doWithdraw() {
  const amt = parseFloat(document.getElementById('withdraw-amt').value);
  if (!amt || amt <= 0) return toast('Enter a valid amount', 'error');
  const { ok, data } = await api('POST', '/wallet/withdraw', { amount: amt });
  if (!ok) return toast(data.error || 'Withdrawal failed', 'error');
  toast(data.message || 'Withdrawal initiated!', 'success');
  closeModal(); await loadEarnings(); refreshPage('payouts');
}

async function updateOrderStatus(orderId, status) {
  const { ok, data } = await api('PUT', `/orders/${orderId}/status`, { status });
  if (!ok) return toast(data.error || 'Update failed', 'error');
  toast(data.message || 'Updated!', 'success');

  // ✅ Update order in State immediately — no refresh needed
  const order = State.orders.find(o => o.id === orderId);
  if (order) order.status = status;

  // ✅ Refresh earnings counts immediately from updated State
  if (State.earnings) {
    const orders = State.orders.filter(o => o.partner_id === State.partner?.id || o.status !== 'pending');
    State.earnings.total_delivered  = State.orders.filter(o => o.status === 'done').length;
    State.earnings.total_in_transit = State.orders.filter(o => o.status === 'picked').length;
    State.earnings.total_pending    = State.orders.filter(o => o.status === 'pending').length;
  }

  closeModal();
  refreshPage('home');

  // Sync earnings from server in background
  loadEarnings().then(() => refreshPage('home'));
}
async function saveProfile() {
  const name  = document.getElementById('p-name').value.trim();
  const email = document.getElementById('p-email').value.trim().toLowerCase();
  if (!name) return toast('Name cannot be empty', 'error');
  if (!email || !/^[\w.+\-]+@[\w\-]+\.[a-z]{2,}$/i.test(email)) return toast('Enter a valid email address', 'error');
  const body = { name, email, dob: document.getElementById('p-dob').value, gender: document.getElementById('p-gender').value, zone: document.getElementById('p-zone').value.trim(), address: document.getElementById('p-address').value.trim() };
  const { ok, data } = await api('PUT', '/profile/personal', body);
  if (!ok) return toast(data.error || 'Save failed', 'error');
  toast('Profile updated!', 'success'); closeModal(); await loadProfile(); refreshPage('account');
}

async function saveVehicle() {
  const body = { vehicle_type: document.getElementById('v-type').value, reg_number: document.getElementById('v-reg').value.trim().toUpperCase(), make: document.getElementById('v-make').value.trim(), model: document.getElementById('v-model').value.trim(), year: document.getElementById('v-year').value.trim(), colour: document.getElementById('v-colour').value.trim(), rc_expiry: document.getElementById('v-rc-exp').value, insurance_expiry: document.getElementById('v-ins-exp').value };
  const { ok, data } = await api('PUT', '/profile/vehicle', body);
  if (!ok) return toast(data.error || 'Save failed', 'error');
  toast('Vehicle details saved!', 'success'); closeModal();
}

async function saveBank() {
  const body = { bank_name: document.getElementById('b-bank').value.trim(), account_holder: document.getElementById('b-holder').value.trim(), account_number: document.getElementById('b-acc').value.trim(), ifsc: document.getElementById('b-ifsc').value.trim().toUpperCase(), branch: document.getElementById('b-branch').value.trim(), upi_id: document.getElementById('b-upi').value.trim() };
  const { ok, data } = await api('PUT', '/profile/bank', body);
  if (!ok) return toast(data.error || 'Save failed', 'error');
  toast('Bank details saved – pending verification', 'success'); closeModal();
}

async function saveEmergency() {
  const body = { contact_name: document.getElementById('ec-name').value.trim(), relationship: document.getElementById('ec-rel').value.trim(), phone: document.getElementById('ec-phone').value.trim(), blood_group: document.getElementById('hi-blood').value, allergies: document.getElementById('hi-allergy').value.trim() };
  const { ok, data } = await api('PUT', '/profile/emergency', body);
  if (!ok) return toast(data.error || 'Save failed', 'error');
  toast('Emergency details saved!', 'success'); closeModal();
}

/* ─── DATA LOADERS ──────────────────────────────────────────── */
async function loadProfile()    { const { ok, data } = await api('GET', '/profile');    if (ok) State.partner = data.profile; }
async function loadOrders() {
  const { ok, data } = await api('GET', '/orders');
  if (ok) {
    State.orders = data.orders || [];
    // Update counts immediately after loading orders
    if (State.earnings) {
      State.earnings.total_delivered  = State.orders.filter(o => o.status === 'done').length;
      State.earnings.total_in_transit = State.orders.filter(o => o.status === 'picked').length;
      State.earnings.total_pending    = State.orders.filter(o => o.status === 'pending').length;
    }
  }
}
async function loadEarnings()   { const { ok, data } = await api('GET', '/earnings');   if (ok) State.earnings = data; }
async function loadWallet()     { const { ok, data } = await api('GET', '/wallet');     if (ok) { State.wallet = data; refreshPage('payouts'); } }
async function loadIncentives() { const { ok, data } = await api('GET', '/incentives'); if (ok) State.incentives = data.incentives || []; }
async function loadIncentiveSlabs(period = State.incentiveTab, date = State.incentiveDate) {
  const { ok, data } = await api('GET', `/incentives/slabs?period=${period}&date=${date}`);
  if (ok) State.incentiveSlabs[period] = data.slabs || [];
  refreshPage('payouts');
}
async function loadReferrals()  { const { ok, data } = await api('GET', '/referrals'); if (ok) State.referrals = data; }
async function loadTodayShift() {
    const { ok, data } = await api('GET', '/shifts/today');
    if (ok && data.shift) {
        State.todayShift = data.shift;
        // Restart location check if shift is still active
        if (data.shift.status === 'booked') {
            startShiftLocationCheck(data.shift.start_hour, data.shift.end_hour);
        }
    }
}
async function loadAll() {
  await Promise.all([loadProfile(), loadOrders(), loadEarnings(), loadWallet(), loadIncentives(), loadIncentiveSlabs('daily'), loadIncentiveSlabs('weekly'), loadTodayShift(), loadReferrals(), loadReferralStatus()]);
}
// Silently fetches /api/earnings every 15s and patches the DOM in-place.
// No full re-render — only the 4 changing numbers are touched.
async function _tickEarnings() {
  if (!State.token) return;
  const { ok, data } = await api('GET', '/earnings');
  if (!ok) return;
  State.earnings = data;   // keep State in sync

  // Patch the home earnings card stat-pills if visible
  const patch = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  patch('live-stat-delivered',  data.delivered  || 0);
  patch('live-stat-in_transit', data.in_transit || 0);
  patch('live-stat-pending',    data.pending    || 0);
  patch('live-stat-today',      fmt(data.today  || 0));

  // Also refresh the orders list if the total count changed
  const newCount = (data.delivered || 0) + (data.in_transit || 0) + (data.pending || 0);
  if (newCount !== (State._lastOrderCount || 0)) {
    State._lastOrderCount = newCount;
    await loadOrders();
    const listEl = document.getElementById('live-orders-list');
    if (listEl) listEl.innerHTML = renderOrdersList();
  }
}

function startEarningsPolling() {
  stopEarningsPolling();                       // clear any existing timer first
  _tickEarnings();                              // immediate first tick
  State._earningsInterval = setInterval(_tickEarnings, 15000);
}

function stopEarningsPolling() {
  if (State._earningsInterval) {
    clearInterval(State._earningsInterval);
    State._earningsInterval = null;
  }
}


/* ─── WALLET ADD MONEY ──────────────────────────────────────── 
function showAddMoney() {
  const bal = (State.earnings && State.earnings.wallet && State.earnings.wallet.balance) || 0;
  State.topupMethod = 'upi';
  document.getElementById('app').innerHTML = `
  <div class="auth-screen" style="justify-content:flex-start;padding-top:calc(20px + var(--safe-top));overflow-y:auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <div onclick="initApp()" style="width:38px;height:38px;border-radius:10px;background:var(--surface2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </div>
      <div style="font-size:20px;font-weight:800">Add Money to Wallet</div>
    </div>
    <div style="background:linear-gradient(135deg,#1e40af,#2563eb);border-radius:var(--radius);padding:20px;margin-bottom:20px;box-shadow:0 6px 24px rgba(37,99,235,0.25)">
      <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px">Current Balance</div>
      <div style="font-size:36px;font-weight:800;font-family:var(--mono);color:white;margin-top:4px">₹${fmt(bal)}</div>
    </div>
    <div class="field-group">
      <label class="field-label">Amount to Add (₹)</label>
      <input class="field-input" type="number" id="topup-amount" placeholder="Min ₹10 · Max ₹50,000"
             inputmode="numeric" style="font-size:22px;font-weight:700;font-family:var(--mono)" />
    </div>
    <div style="margin-bottom:16px">
      <div class="field-label" style="margin-bottom:8px">Quick Amount</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${[100,200,500,1000].map(a=>`
        <button onclick="document.getElementById('topup-amount').value=${a}"
          style="padding:10px 4px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface);font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;color:var(--accent);touch-action:manipulation">
          ₹${a}
        </button>`).join('')}
      </div>
    </div>
    <div class="field-label" style="margin-bottom:8px">Payment Method</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
      ${[['upi','📲','UPI','Google Pay · PhonePe · Paytm · BHIM'],
         ['card','💳','Card','Debit / Credit · Visa · Mastercard · RuPay'],
         ['netbanking','🏦','Net Banking','All major Indian banks']].map(([val,ico,title,sub],i)=>`
      <div id="method-${val}" onclick="selectTopupMethod('${val}')"
        style="display:flex;align-items:center;gap:12px;padding:14px;border:1.5px solid ${i===0?'var(--accent)':'var(--border)'};border-radius:var(--radius-sm);cursor:pointer;background:${i===0?'var(--accentlt)':'var(--surface)'};transition:all 0.2s">
        <span style="font-size:22px">${ico}</span>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700">${title}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px">${sub}</div>
        </div>
        <div id="radio-${val}" style="width:18px;height:18px;border-radius:50%;border:2px solid ${i===0?'var(--accent)':'var(--border)'};display:flex;align-items:center;justify-content:center">
          ${i===0?`<div style="width:8px;height:8px;border-radius:50%;background:var(--accent)"></div>`:''}
        </div>
      </div>`).join('')}
    </div>
    <button class="btn-primary" onclick="initiateTopup()">Proceed to Pay →</button>
  </div>`;
}

function selectTopupMethod(method) {
  State.topupMethod = method;
  ['upi','card','netbanking'].forEach(m => {
    const el    = document.getElementById(`method-${m}`);
    const radio = document.getElementById(`radio-${m}`);
    if (!el || !radio) return;
    const active = m === method;
    el.style.borderColor    = active ? 'var(--accent)' : 'var(--border)';
    el.style.background     = active ? 'var(--accentlt)' : 'var(--surface)';
    radio.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    radio.innerHTML = active ? `<div style="width:8px;height:8px;border-radius:50%;background:var(--accent)"></div>` : '';
  });
}

async function initiateTopup() {
  const amount = parseFloat(document.getElementById('topup-amount').value);
  if (!amount || amount < 10)  return toast('Enter a valid amount (min ₹10)', 'error');
  if (amount > 50000)           return toast('Maximum top-up is ₹50,000', 'error');
  const btn = document.querySelector('#app .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
  const { ok, data } = await api('POST', '/wallet/topup/initiate', { amount, method: State.topupMethod });
  if (!ok) {
    if (btn) { btn.disabled = false; btn.textContent = 'Proceed to Pay →'; }
    return toast(data.error || 'Failed to initiate', 'error');
  }
  State.topupRef = data.reference;
  const isUPI = State.topupMethod === 'upi';
  document.getElementById('app').innerHTML = `
  <div class="auth-screen" style="justify-content:flex-start;padding-top:calc(20px + var(--safe-top));overflow-y:auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <div onclick="showAddMoney()" style="width:38px;height:38px;border-radius:10px;background:var(--surface2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </div>
      <div style="font-size:20px;font-weight:800">Complete Payment</div>
    </div>
    <div style="background:var(--accentlt);border:1.5px solid #bfdbfe;border-radius:var(--radius);padding:20px;margin-bottom:20px;text-align:center">
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Amount to Pay</div>
      <div style="font-size:40px;font-weight:800;font-family:var(--mono);color:var(--accent)">₹${fmt(amount)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;font-family:var(--mono)">Ref: ${data.reference}</div>
    </div>
    ${isUPI ? `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px;text-align:center">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">Pay via UPI</div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">UPI ID</div>
        <div style="font-size:16px;font-weight:800;font-family:var(--mono);color:var(--accent)">${data.upi_vpa}</div>
      </div>
      <button onclick="window.location.href='${data.upi_link}'"
        style="width:100%;background:linear-gradient(135deg,#16a34a,#22c55e);color:white;border:none;border-radius:var(--radius-sm);padding:14px;font-family:var(--font);font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(22,163,74,0.3);touch-action:manipulation">
        📲 Open UPI App
      </button>
      <div style="font-size:11px;color:var(--muted);margin-top:10px">Opens Google Pay / PhonePe / Paytm</div>
    </div>` : `
    <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:var(--radius);padding:14px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#92400e">⚠️ Simulated Payment</div>
      <div style="font-size:12px;color:#b45309;margin-top:4px">Card/NetBanking gateway not yet integrated. Enter any reference below.</div>
    </div>`}
    <div class="field-group">
      <label class="field-label">UTR / Transaction ID</label>
      <input class="field-input" type="text" id="confirm-utr" placeholder="Enter 12-digit UTR from your UPI app"
             style="text-transform:uppercase;font-family:var(--mono)" />
      <div style="font-size:11px;color:var(--muted);margin-top:5px">Find this in your UPI app after payment is complete</div>
    </div>
    <button class="btn-primary" onclick="confirmTopup('${data.reference}',${amount},'${State.topupMethod}')">✅ I've Paid – Confirm</button>
    <button class="btn-secondary" onclick="showAddMoney()">Cancel</button>
  </div>`;
}

async function confirmTopup(ref, amount, method) {
  const utr = (document.getElementById('confirm-utr').value || '').trim();
  if (!utr) return toast('Enter the UTR / Transaction ID', 'error');
  const btn = document.querySelector('#app .btn-primary');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming…'; }
  const { ok, data } = await api('POST', '/wallet/topup/confirm', { reference: ref, utr, amount, method });
  if (!ok) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ I\'ve Paid – Confirm'; }
    return toast(data.error || 'Confirmation failed', 'error');
  }
  toast(`₹${fmt(amount)} added to wallet! 🎉`, 'success');
  await loadEarnings();
  await loadWallet();
  setTimeout(initApp, 1000);
}*/
/* ─── WALLET ADD MONEY ──────────────────────────────────────── */
function showAddMoney() {
  const bal = (State.earnings && State.earnings.wallet && State.earnings.wallet.balance) || 0;
  State.topupMethod = 'upi';
  document.getElementById('app').innerHTML = `
  <div class="auth-screen" style="justify-content:flex-start;padding-top:calc(20px + var(--safe-top));overflow-y:auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <div onclick="initApp()" style="width:38px;height:38px;border-radius:10px;background:var(--surface2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </div>
      <div style="font-size:20px;font-weight:800">Add Money to Wallet</div>
    </div>
    <div style="background:linear-gradient(135deg,#1e40af,#2563eb);border-radius:var(--radius);padding:20px;margin-bottom:20px;box-shadow:0 6px 24px rgba(37,99,235,0.25)">
      <div style="font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:0.5px">Current Balance</div>
      <div style="font-size:36px;font-weight:800;font-family:var(--mono);color:white;margin-top:4px">₹${fmt(bal)}</div>
    </div>
    <div class="field-group">
      <label class="field-label">Amount to Add (₹)</label>
      <input class="field-input" type="number" id="topup-amount" placeholder="Min ₹10 · Max ₹50,000"
             inputmode="numeric" style="font-size:22px;font-weight:700;font-family:var(--mono)" />
    </div>
    <div style="margin-bottom:16px">
      <div class="field-label" style="margin-bottom:8px">Quick Amount</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
        ${[100,200,500,1000].map(a=>`
        <button onclick="document.getElementById('topup-amount').value=${a}"
          style="padding:10px 4px;border-radius:10px;border:1.5px solid var(--border);background:var(--surface);font-family:var(--font);font-size:13px;font-weight:700;cursor:pointer;color:var(--accent);touch-action:manipulation">
          ₹${a}
        </button>`).join('')}
      </div>
    </div>
    <div class="field-label" style="margin-bottom:8px">Payment Method</div>
    <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:20px">
      ${[['upi','📲','UPI','Google Pay · PhonePe · Paytm · BHIM'],
         ['card','💳','Card','Debit / Credit · Visa · Mastercard · RuPay'],
         ['netbanking','🏦','Net Banking','All major Indian banks']].map(([val,ico,title,sub],i)=>`
      <div id="method-${val}" onclick="selectTopupMethod('${val}')"
        style="display:flex;align-items:center;gap:12px;padding:14px;border:1.5px solid ${i===0?'var(--accent)':'var(--border)'};border-radius:var(--radius-sm);cursor:pointer;background:${i===0?'var(--accentlt)':'var(--surface)'};transition:all 0.2s">
        <span style="font-size:22px">${ico}</span>
        <div style="flex:1"><div style="font-size:14px;font-weight:700">${title}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px">${sub}</div></div>
        <div id="radio-${val}" style="width:18px;height:18px;border-radius:50%;border:2px solid ${i===0?'var(--accent)':'var(--border)'};display:flex;align-items:center;justify-content:center">
          ${i===0?`<div style="width:8px;height:8px;border-radius:50%;background:var(--accent)"></div>`:''}
        </div>
      </div>`).join('')}
    </div>
    <button class="btn-primary" id="topup-proceed-btn" onclick="initiateTopup()">Proceed to Pay →</button>
  </div>`;
}

function selectTopupMethod(method) {
  State.topupMethod = method;
  ['upi','card','netbanking'].forEach(m => {
    const el    = document.getElementById(`method-${m}`);
    const radio = document.getElementById(`radio-${m}`);
    if (!el || !radio) return;
    const active = m === method;
    el.style.borderColor    = active ? 'var(--accent)' : 'var(--border)';
    el.style.background     = active ? 'var(--accentlt)' : 'var(--surface)';
    radio.style.borderColor = active ? 'var(--accent)' : 'var(--border)';
    radio.innerHTML = active
      ? `<div style="width:8px;height:8px;border-radius:50%;background:var(--accent)"></div>` : '';
  });
}

async function initiateTopup() {
  const amount = parseFloat(document.getElementById('topup-amount').value);
  if (!amount || amount < 10)  return toast('Enter a valid amount (min ₹10)', 'error');
  if (amount > 50000)           return toast('Maximum top-up is ₹50,000', 'error');
  const btn = document.getElementById('topup-proceed-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Processing…'; }
  const { ok, data } = await api('POST', '/wallet/topup/initiate', { amount, method: State.topupMethod });
  if (!ok) {
    if (btn) { btn.disabled = false; btn.textContent = 'Proceed to Pay →'; }
    return toast(data.error || 'Failed to initiate', 'error');
  }
  const isUPI = State.topupMethod === 'upi';
  document.getElementById('app').innerHTML = `
  <div class="auth-screen" style="justify-content:flex-start;padding-top:calc(20px + var(--safe-top));overflow-y:auto">
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:24px">
      <div onclick="showAddMoney()" style="width:38px;height:38px;border-radius:10px;background:var(--surface2);border:1.5px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" width="18" height="18"><polyline points="15 18 9 12 15 6"/></svg>
      </div>
      <div style="font-size:20px;font-weight:800">Complete Payment</div>
    </div>
    <div style="background:var(--accentlt);border:1.5px solid #bfdbfe;border-radius:var(--radius);padding:20px;margin-bottom:20px;text-align:center">
      <div style="font-size:12px;color:var(--muted);margin-bottom:4px">Amount to Pay</div>
      <div style="font-size:40px;font-weight:800;font-family:var(--mono);color:var(--accent)">₹${fmt(amount)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px;font-family:var(--mono)">Ref: ${data.reference}</div>
    </div>
    ${isUPI ? `
    <div style="background:var(--surface);border:1.5px solid var(--border);border-radius:var(--radius);padding:20px;margin-bottom:16px;text-align:center">
      <div style="font-size:13px;font-weight:700;margin-bottom:12px">Pay via UPI</div>
      <div style="background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px;margin-bottom:14px">
        <div style="font-size:11px;color:var(--muted);margin-bottom:4px">UPI ID (VPA)</div>
        <div style="font-size:16px;font-weight:800;font-family:var(--mono);color:var(--accent)">${data.upi_vpa}</div>
      </div>
      <button onclick="window.location.href='${data.upi_link}'"
        style="width:100%;background:linear-gradient(135deg,#16a34a,#22c55e);color:white;border:none;border-radius:var(--radius-sm);padding:14px;font-family:var(--font);font-size:15px;font-weight:700;cursor:pointer;touch-action:manipulation">
        📲 Open UPI App
      </button>
      <div style="font-size:11px;color:var(--muted);margin-top:10px">Opens Google Pay / PhonePe / Paytm</div>
    </div>` : `
    <div style="background:#fffbeb;border:1.5px solid #fde68a;border-radius:var(--radius);padding:14px;margin-bottom:16px">
      <div style="font-size:13px;font-weight:700;color:#92400e">⚠️ Gateway not integrated</div>
      <div style="font-size:12px;color:#b45309;margin-top:4px">Card/NetBanking gateway is not yet set up. Enter any reference below for testing.</div>
    </div>`}
    <div class="field-group">
      <label class="field-label">UTR / Transaction ID</label>
      <input class="field-input" type="text" id="confirm-utr"
             placeholder="Enter UTR from your UPI app"
             style="text-transform:uppercase;font-family:var(--mono)" />
      <div style="font-size:11px;color:var(--muted);margin-top:5px">Find this in your UPI app after payment is complete</div>
    </div>
    <button class="btn-primary" id="topup-confirm-btn" onclick="confirmTopup('${data.reference}',${amount},'${State.topupMethod}')">✅ I've Paid – Confirm</button>
    <button class="btn-secondary" onclick="showAddMoney()">Cancel</button>
  </div>`;
}

async function confirmTopup(ref, amount, method) {
  const utr = (document.getElementById('confirm-utr').value || '').trim();
  if (!utr) return toast('Enter the UTR / Transaction ID from your UPI app', 'error');
  const btn = document.getElementById('topup-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Confirming…'; }
  const { ok, data } = await api('POST', '/wallet/topup/confirm', { reference: ref, utr, amount, method });
  if (!ok) {
    if (btn) { btn.disabled = false; btn.textContent = '✅ I\'ve Paid – Confirm'; }
    return toast(data.error || 'Confirmation failed', 'error');
  }
  toast(`₹${fmt(amount)} added to wallet! 🎉`, 'success');
  await loadEarnings();
  await loadWallet();
  setTimeout(initApp, 1200);
}

/* ─── LOCATION ──────────────────────────────────────────────── */
function startLocationTracking() {
  if (!navigator.geolocation) {
    State.locationError = 'Geolocation not supported by your browser';
    return;
  }
  // Request permission and get initial fix
  navigator.geolocation.getCurrentPosition(
    pos => {
      State.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      pushLocation(State.location.lat, State.location.lng);
      refreshPage(State.currentPage);
    },
    err => {
      const msgs = { 1: 'Location permission denied — enable it in browser settings', 2: 'Location unavailable', 3: 'Location request timed out' };
      State.locationError = msgs[err.code] || 'Location error';
      refreshPage(State.currentPage);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
  );
  // Watch for updates every ~30s while online
  if (State.locationWatchId) navigator.geolocation.clearWatch(State.locationWatchId);
  State.locationWatchId = navigator.geolocation.watchPosition(
    pos => {
      State.location = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
      if (State.isOnline) pushLocation(State.location.lat, State.location.lng);
    },
    () => {},
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
  );
}

function stopLocationTracking() {
  if (State.locationWatchId) {
    navigator.geolocation.clearWatch(State.locationWatchId);
    State.locationWatchId = null;
  }
}

async function pushLocation(lat, lng) {
  if (!State.token) return;
  await api('POST', '/location/update', { latitude: lat, longitude: lng });
}

async function loadReferralStatus() {
  const { ok, data } = await api('GET', '/referrals/status');
  if (ok) State.referralStatus = data;
}

/* ─── NAVIGATION ────────────────────────────────────────────── */
const PAGE_RENDERERS = { home: renderHome, payouts: renderPayouts, schedule: renderSchedule, invite: renderInvite, account: renderAccount };

function goTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById(`page-${page}`);
  if (pg) { pg.innerHTML = (PAGE_RENDERERS[page] || renderHome)(); pg.classList.add('active'); }
  const nav = document.getElementById(`nav-${page}`);
  if (nav) nav.classList.add('active');
  State.currentPage = page;
  document.getElementById('page-content').scrollTop = 0;
}

function refreshPage(page) {
  if (State.currentPage === page) {
    const pg = document.getElementById(`page-${page}`);
    if (pg) pg.innerHTML = (PAGE_RENDERERS[page] || renderHome)();
  }
}

/* ─── AUTH HELPERS ──────────────────────────────────────────── */
function showLogin()    { document.getElementById('app').innerHTML = renderLogin(); }
function showRegister() { document.getElementById('app').innerHTML = renderRegister(); }

/* ─── INIT ──────────────────────────────────────────────────── */
function initApp() {
  document.getElementById('app').innerHTML = `
    ${renderShell()}
    <div class="modal-overlay" id="modal-overlay"></div>`;
  goTo('home');
  // Auto-start location tracking on login
  startLocationTracking();
  if (window._orderPollInterval) clearInterval(window._orderPollInterval);
  window._orderPollInterval = setInterval(async () => {
    await loadOrders();
    await loadEarnings();
    refreshPage('home');
  }, 15000);  // every 15 seconds
  // Start auto-refresh for order counts (every 15s)
  startEarningsPolling();
  // Show referral status banner if referred partner
  if (State.referralStatus && State.referralStatus.referred && !State.referralStatus.unlocked) {
    setTimeout(() => {
      const rs = State.referralStatus;
      toast(`⏳ Work ${rs.remaining_days} more day(s) to unlock referrer bonus!`, 'success');
    }, 2000);
  }
}


async function boot() {
  document.getElementById('app').innerHTML = renderLoading();
  await new Promise(r => setTimeout(r, 1200));
  if (State.token) {
    const { ok } = await api('GET', '/profile');
    if (ok) {
      await loadAll();
      document.getElementById('loading-screen').classList.add('hidden');
      setTimeout(initApp, 400); return;
    }
    State.token = null; localStorage.removeItem('lmh_token');
  }
  document.getElementById('loading-screen').classList.add('hidden');
  setTimeout(showLogin, 400);
}

boot();