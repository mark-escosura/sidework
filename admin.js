/* Side Work v27: two-step login (TOTP) and the owner-only Admin screen.
   Admin shows usage only (accounts, activity, shift counts). The server functions return no money, hours or notes,
   check the owner's user id themselves, and require a two-step (aal2) session. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  if (!$('#pfAdmin')) return;
  var S = function () { return window.SideWorkSync || {}; };
  function sb() { return S().client ? S().client() : null; }
  function me() { return S().user ? S().user() : null; }
  var PANELS = ['#pfMain', '#pfMore', '#pfMfa', '#pfAdmin'];
  function panel(id) { PANELS.forEach(function (p) { var e = $(p); if (e) e.hidden = p !== id; }); scrollTo(0, 0); }
  function part(id) { ['#adNeed', '#adCode', '#adMain', '#adDetail'].forEach(function (p) { $(p).hidden = p !== id; }); }
  function err(id, t) { var e = $(id); e.textContent = t || ''; e.hidden = !t; }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  var isAdmin = false, factors = [], users = [], filt = 'all', pending = null;

  function verified() { return factors.filter(function (f) { return f.factor_type === 'totp' && f.status === 'verified'; }); }
  function loadFactors() {
    var c = sb(); if (!c || !c.auth.mfa) return Promise.resolve([]);
    return c.auth.mfa.listFactors().then(function (r) { factors = (r && r.data && (r.data.all || r.data.totp)) || []; $('#mfaV').textContent = verified().length ? 'On' : 'Off'; return factors; }, function () { return []; });
  }
  function refresh() {
    var c = sb(), u = me();
    if (!c || !u) { isAdmin = false; users = []; $('#adList').textContent = ''; $('#adminBtn').hidden = true; return; }
    loadFactors();
    c.rpc('am_i_admin').then(function (r) { isAdmin = !!(r && !r.error && r.data === true); $('#adminBtn').hidden = !isAdmin; }, function () { $('#adminBtn').hidden = true; });
  }
  document.addEventListener('sidework:account', refresh); setTimeout(refresh, 0);

  /* Two-step login */
  function mfaView() {
    err('#mfaErr'); $('#mfaEnroll').hidden = true;
    var on = verified().length > 0; $('#mfaOn').hidden = !on; $('#mfaOffV').hidden = on;
  }
  function openMfa() { panel('#pfMfa'); mfaView(); loadFactors().then(mfaView); }
  function startEnroll() {
    var c = sb(); err('#mfaErr'); $('#mfaStart').disabled = true;
    var stale = factors.filter(function (f) { return f.factor_type === 'totp' && f.status !== 'verified'; });
    Promise.all(stale.map(function (f) { return c.auth.mfa.unenroll({ factorId: f.id }).catch(function () {}); }))
      .then(function () { return c.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Side Work ' + Date.now().toString(36) }); })
      .then(function (r) {
        $('#mfaStart').disabled = false;
        if (r.error) { err('#mfaErr', /disabled|not enabled/i.test(r.error.message) ? 'Two-step login isn’t turned on for this app yet.' : r.error.message); return; }
        pending = r.data.id; $('#mfaQr').src = r.data.totp.qr_code; $('#mfaSecret').textContent = r.data.totp.secret;
        $('#mfaOffV').hidden = true; $('#mfaEnroll').hidden = false; $('#mfaCode').value = ''; $('#mfaCode').focus();
      }, function (e) { $('#mfaStart').disabled = false; err('#mfaErr', (e && e.message) || 'Couldn’t start setup.'); });
  }
  function codeOf(id) { var v = $(id).value.replace(/\D/g, ''); return v.length === 6 ? v : null; }
  function verifyEnroll() {
    var code = codeOf('#mfaCode'); if (!code) { err('#mfaErr', 'Enter the 6-digit code.'); return; }
    sb().auth.mfa.challengeAndVerify({ factorId: pending, code: code }).then(function (r) {
      if (r.error) { err('#mfaErr', 'That code didn’t work. Check the time on your phone and try again.'); return; }
      pending = null; loadFactors().then(mfaView);
    });
  }
  function turnOff() {
    var f = verified()[0]; if (!f || !confirm('Turn off two-step login? You’ll need it again to open Admin.')) return;
    sb().auth.mfa.unenroll({ factorId: f.id }).then(function (r) {
      if (r && r.error) { err('#mfaErr', /aal2|AAL2/.test(r.error.message) ? 'Open Admin and enter a code first, then turn it off.' : r.error.message); return; }
      loadFactors().then(mfaView);
    });
  }

  /* Admin */
  function openAdmin() {
    if (!isAdmin) return;
    panel('#pfAdmin'); err('#adErr'); part(null);
    var c = sb();
    loadFactors().then(function () {
      if (!verified().length) { part('#adNeed'); return; }
      return c.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
        if (r && r.data && r.data.currentLevel === 'aal2') load(); else { part('#adCode'); $('#adCodeIn').value = ''; }
      });
    });
  }
  function verifyCode() {
    var code = codeOf('#adCodeIn'); if (!code) { err('#adErr', 'Enter the 6-digit code.'); return; }
    err('#adErr'); sb().auth.mfa.challengeAndVerify({ factorId: verified()[0].id, code: code }).then(function (r) {
      if (r.error) { err('#adErr', 'That code didn’t work. Try the newest one.'); return; } load();
    });
  }
  function rpc(n, a) { return sb().rpc(n, a).then(function (r) { if (r.error) throw r.error; return r.data || []; }); }
  function load() {
    err('#adErr');
    Promise.all([rpc('admin_usage_summary'), rpc('admin_signups_weekly', { weeks: 8 }), rpc('admin_user_list')]).then(function (d) {
      var s = d[0][0] || {};
      users = d[2].map(function (u) { return { email: String(u.email || ''), joined: u.joined, confirmed: !!u.confirmed, last_sign_in: u.last_sign_in, last_sync: u.last_sync, shift_count: +u.shift_count || 0, shifts_this_week: +u.shifts_this_week || 0 }; });
      tiles(s); bars(d[1]); list(); part('#adMain');
    }).catch(function (e) { if (/mfa/i.test(e && e.message)) { part('#adCode'); } else { part(null); err('#adErr', 'Couldn’t load admin data. ' + ((e && e.message) || '')); } });
  }
  function pct(a, b) { return b ? Math.round(100 * a / b) + '% of users' : '—'; }
  function tiles(s) {
    var t = +s.total_users || 0, box = $('#adTiles'); box.textContent = '';
    [['Users', t, '+' + (+s.new_7d || 0) + ' this week'], ['Active 7d', +s.active_7d || 0, pct(+s.active_7d || 0, t)], ['Active 30d', +s.active_30d || 0, pct(+s.active_30d || 0, t)], ['Shifts logged', +s.total_shifts || 0, (+s.shifts_7d || 0) + ' in last 7 days']]
      .forEach(function (x) { var c = el('div', 'card ad-tile'); c.appendChild(el('div', 'ad-k', x[0])); c.appendChild(el('div', 'ad-v', String(x[1]))); c.appendChild(el('div', 'ad-d', x[2])); box.appendChild(c); });
  }
  function md(d) { return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function bars(w) {
    var b = $('#adBars'), ax = $('#adAx'), mx = 1; b.textContent = ''; ax.textContent = '';
    w.forEach(function (x) { mx = Math.max(mx, +x.signups || 0); });
    w.forEach(function (x) { var i = el('i'); i.style.height = Math.max(4, Math.round(100 * (+x.signups || 0) / mx)) + '%'; i.title = md(x.week_start) + ': ' + x.signups; b.appendChild(i); });
    if (w.length) { ax.appendChild(el('span', '', md(w[0].week_start))); ax.appendChild(el('span', '', 'This week')); }
  }
  function ago(t) {
    if (!t) return 'Never'; var m = (Date.now() - new Date(t)) / 60000;
    if (m < 60) return Math.max(1, Math.round(m)) + 'm ago'; if (m < 1440) return Math.round(m / 60) + 'h ago';
    var d = Math.round(m / 1440); return d === 1 ? 'Yesterday' : d + 'd ago';
  }
  function last(u) { var a = u.last_sign_in ? +new Date(u.last_sign_in) : 0, b = u.last_sync ? +new Date(u.last_sync) : 0; return Math.max(a, b) || null; }
  function dfmt(t, time) { if (!t) return '—'; var d = new Date(t); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Los_Angeles' }) + (time ? ', ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' }) + ' PT' : ''); }
  function list() {
    var q = $('#adSearch').value.trim().toLowerCase(), box = $('#adList'); box.textContent = '';
    var rows = users.filter(function (u) {
      if (filt === 'active' && !(last(u) && Date.now() - last(u) < 7 * 864e5)) return false;
      if (filt === 'unconf' && u.confirmed) return false;
      return !q || u.email.toLowerCase().indexOf(q) >= 0;
    }).sort(function (a, b) { return (last(b) || 0) - (last(a) || 0); });
    if (!rows.length) box.appendChild(el('p', 'muted s', 'No users match.'));
    rows.forEach(function (u) {
      var r = el('button', 'ad-row'); r.type = 'button';
      r.appendChild(el('span', 'pf-av ad-av', (u.email.charAt(0) || '?').toUpperCase()));
      var m = el('span', 'ad-m'), e = el('span', 'ad-e', u.email); if (!u.confirmed) e.appendChild(el('span', 'ad-pill no', 'Unconfirmed'));
      var act = last(u), sub = el('span', 'ad-s'); sub.appendChild(el('i', 'ad-dot' + (act && Date.now() - act < 7 * 864e5 ? '' : ' off')));
      sub.appendChild(document.createTextNode((act ? ago(act) : 'Never signed in') + ' · joined ' + dfmt(u.joined).replace(/, \d{4}$/, '')));
      m.appendChild(e); m.appendChild(sub); r.appendChild(m);
      var n = el('span', 'ad-n'); n.appendChild(el('b', '', String(u.shift_count))); n.appendChild(document.createTextNode(u.shifts_this_week + ' this wk')); r.appendChild(n);
      r.addEventListener('click', function () { detail(u); }); box.appendChild(r);
    });
  }
  function detail(u) {
    $('#adDAv').textContent = (u.email.charAt(0) || '?').toUpperCase(); $('#adDEmail').textContent = u.email;
    $('#adDConf').textContent = u.confirmed ? 'Email confirmed' : 'Not confirmed'; $('#adDConf').className = 'ad-pill' + (u.confirmed ? '' : ' no');
    var kv = $('#adDKv'); kv.textContent = '';
    [['Joined', dfmt(u.joined)], ['Last sign-in', dfmt(u.last_sign_in, true)], ['Last sync', dfmt(u.last_sync, true)], ['Shifts logged', String(u.shift_count)], ['Shifts this week', String(u.shifts_this_week)]]
      .forEach(function (x) { var r = el('div', 'ad-kv'); r.appendChild(el('span', '', x[0])); r.appendChild(document.createTextNode(x[1])); kv.appendChild(r); });
    part('#adDetail'); scrollTo(0, 0);
  }

  $('#mfaBtn').addEventListener('click', openMfa);
  $('#adminBtn').addEventListener('click', openAdmin);
  $('#adToMfa').addEventListener('click', openMfa);
  $('#mfaStart').addEventListener('click', startEnroll);
  $('#mfaVerify').addEventListener('click', verifyEnroll);
  $('#mfaOff').addEventListener('click', turnOff);
  $('#adCodeBtn').addEventListener('click', verifyCode);
  $('#adCodeIn').addEventListener('keydown', function (e) { if (e.key === 'Enter') verifyCode(); });
  $('#mfaCode').addEventListener('keydown', function (e) { if (e.key === 'Enter') verifyEnroll(); });
  $('#adDBack').addEventListener('click', function () { part('#adMain'); });
  $('#adSearch').addEventListener('input', list);
  [].forEach.call(document.querySelectorAll('#adSeg button'), function (b) { b.addEventListener('click', function () { filt = b.getAttribute('data-f'); [].forEach.call(document.querySelectorAll('#adSeg button'), function (x) { x.classList.toggle('on', x === b); }); list(); }); });
  [].forEach.call(document.querySelectorAll('[data-pfback]'), function (b) { b.addEventListener('click', function () { panel('#pfMain'); refresh(); }); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden' && !$('#pfAdmin').hidden) { users = []; $('#adList').textContent = ''; panel('#pfMain'); } });
  window.SideWorkAdmin = { refresh: refresh };
})();
