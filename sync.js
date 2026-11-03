/* Side Work optional cloud sync (Supabase). Inactive unless config.js has a URL + anon key.
   Local data is the source of truth on this phone: sync only adds/updates, and signing out never clears it. */
(function () {
  'use strict';
  var C = window.SIDEWORK_CONFIG || {}, URL_ = (C.SUPABASE_URL || '').trim(), KEY = (C.SUPABASE_ANON_KEY || '').trim();
  if (!URL_ || !KEY || !window.SideWork) return;
  var SW = window.SideWork, META = 'sidework.sync', CDN = 'vendor/supabase.js';
  var $ = function (s) { return document.querySelector(s); };
  var sb = null, user = null, busy = false, again = false, timer = null, applying = false;
  function meta() { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch (e) { return {}; } }
  function setMeta(m) { localStorage.setItem(META, JSON.stringify(m)); }
  var F = [['id', 'id'], ['date', 'date'], ['shift', 'shift'], ['hours', 'hours'], ['role', 'role'], ['wage', 'wage'], ['clockIn', 'clock_in'], ['clockOut', 'clock_out'],
    ['cash', 'cash'], ['card', 'card'], ['tips', 'tips'], ['tipout', 'tipout'], ['sales', 'sales'], ['note', 'note'], ['createdAt', 'created_at']];
  function toRow(s) { var r = { user_id: user.id, deleted: false, updated_at: new Date().toISOString() }; F.forEach(function (f) { r[f[1]] = s[f[0]] == null ? null : s[f[0]]; }); if (typeof r.note === 'string') r.note = r.note.slice(0, 2000); if (typeof r.role === 'string') r.role = r.role.slice(0, 60); return r; }
  function fromRow(r) { var s = {}; F.forEach(function (f) { s[f[0]] = r[f[1]]; }); s.hours = +s.hours; ['wage', 'cash', 'card', 'tips', 'tipout', 'sales'].forEach(function (k) { if (s[k] != null) s[k] = +s[k]; }); return SW.normalize(s); }
  function sig(s) { var o = {}; F.forEach(function (f) { o[f[0]] = s[f[0]] == null ? null : s[f[0]]; }); return JSON.stringify(o); }
  function k2(s) { return s.date + '|' + (s.clockIn || ''); }
  function status(t) { var el = $('#acStatus'); if (el) el.textContent = t; }
  function msg(t) { var el = $('#acMsg'); if (el) el.textContent = t || ''; }
  function fmt(d) { var h = d.getHours(), m = d.getMinutes(); return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? 'am' : 'pm'); }

  /* Two-way merge. snap = what we last agreed with the cloud. Local changes since snap win; otherwise cloud changes apply. */
  var running = null, last = { ok: true };
  function sync(prog) {
    if (!user || !sb) return Promise.resolve({ ok: false, error: 'Not signed in' });
    if (busy) { again = true; return running; }
    if (navigator.onLine === false) { status('Offline · will sync later'); return Promise.resolve({ ok: false, error: 'You’re offline' }); }
    prog = prog || function () {};
    busy = true; status('Syncing…'); prog(1);
    running = sync1(prog); return running;
  }
  function sync1(prog) {
    var m = meta(), first = m.uid !== user.id, snap = first ? {} : (m.snap || {});
    return sb.from('shifts').select('*').then(function (res) {
      if (res.error) throw res.error;
      prog(2);
      var remote = res.data || [], local = SW.get(), byId = {}, byKey = {}, changed = false;
      local.forEach(function (s) { byId[s.id] = s; byKey[k2(s)] = s; });
      remote.forEach(function (r) {
        var loc = byId[r.id], rs = r.deleted ? null : fromRow(r);
        if (first) {
          if (r.deleted || !rs) return;                       // first merge: never delete anything local
          if (loc) return;                                     // same id: keep local copy, push it
          var twin = byKey[k2(rs)];                            // same date + start: same shift (restore rule)
          if (twin && !byId[r.id]) { delete byId[twin.id]; twin.id = r.id; byId[r.id] = twin; changed = true; return; }
          byId[rs.id] = rs; byKey[k2(rs)] = rs; local.push(rs); changed = true; return;
        }
        var localDirty = loc ? sig(loc) !== snap[r.id] : (r.id in snap ? false : false);
        if (loc && localDirty) return;                         // local edit wins, pushed below
        if (r.deleted) { if (loc) { local = local.filter(function (x) { return x.id !== r.id; }); delete byId[r.id]; changed = true; } return; }
        if (!rs) return;
        if (!loc && r.id in snap) return;                      // deleted here since last sync: push delete below
        if (!loc) { local.push(rs); byId[rs.id] = rs; changed = true; return; }
        if (sig(loc) !== sig(rs)) { local[local.indexOf(loc)] = rs; byId[rs.id] = rs; changed = true; }
      });
      if (changed) { applying = true; try { SW.set(local); } finally { applying = false; } local = SW.get(); }
      var rmap = {}; remote.forEach(function (r) { rmap[r.id] = r; });
      var ups = [];
      local.forEach(function (s) { var r = rmap[s.id]; if (!r || r.deleted || sig(fromRow(r) || {}) !== sig(s)) ups.push(toRow(s)); });
      var have = {}; local.forEach(function (s) { have[s.id] = 1; });
      Object.keys(snap).forEach(function (id) { if (!have[id] && rmap[id] && !rmap[id].deleted) { var r = rmap[id]; r.deleted = true; r.updated_at = new Date().toISOString(); ups.push(r); } });
      prog(3, ups.length);
      var p = ups.length ? sb.from('shifts').upsert(ups, { onConflict: 'user_id,id' }) : Promise.resolve({});
      return p.then(function (u) { if (u && u.error) throw u.error;
        var ns = {}; local.forEach(function (s) { ns[s.id] = sig(s); }); setMeta({ uid: user.id, snap: ns, at: new Date().toISOString() });
        status('Synced ' + fmt(new Date()) + ' · ' + local.length + ' shift' + (local.length === 1 ? '' : 's'));
        last = { ok: true, n: local.length, pushed: ups.length, pulled: remote.length }; });
    }).catch(function (e) { last = { ok: false, error: (e && e.message) || 'error' }; status('Not synced · ' + last.error + '. Your shifts are safe on this phone.'); })
      .then(function () { busy = false; if (again) { again = false; return sync1(prog); } return last; });
  }
  function changed() { if (applying || !user) return; clearTimeout(timer); timer = setTimeout(sync, 800); }

  /* ---------- Full-screen auth UI ---------- */
  var SKIP = 'sidework.authSkip', inFlow = false, A = $('#auth');
  var EMAIL_RE = /^\S+@\S+\.\S+$/;
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function hasSessKey() { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k) || k === 'mock.session') return true; } return false; }
  function view(v) {
    if (!A) return;
    A.hidden = false; document.body.classList.add('authing');
    [].forEach.call(A.querySelectorAll('.au-v'), function (el) { el.hidden = el.getAttribute('data-v') !== v; });
    A.setAttribute('data-view', v); A.scrollTop = 0;
  }
  function closeAuth() { if (!A) return; A.hidden = true; A.removeAttribute('data-view'); document.body.classList.remove('authing'); }
  function curView() { return A && !A.hidden ? A.getAttribute('data-view') : null; }
  function box(id, t) { var el = $(id); if (!el) return; el.textContent = t || ''; el.hidden = !t; }
  function clearErr() { ['#inErr', '#upErr', '#fgErr', '#npErr', '#inNote', '#fgNote', '#ckNote'].forEach(function (i) { box(i, ''); });
    $('#inPwErr').hidden = true; [].forEach.call(A.querySelectorAll('.au-in.au-bad'), function (el) { el.classList.remove('au-bad'); }); }
  function friendly(m) {
    m = m || 'Something went wrong';
    if (/invalid login/i.test(m)) return 'Incorrect email or password. Try again or reset your password.';
    if (/not confirmed/i.test(m)) return 'Confirm your email first. Check your inbox for the link, then sign in.';
    if (/already registered/i.test(m)) return 'That email already has an account. Sign in instead.';
    if (/rate limit|too many/i.test(m)) return 'Too many tries. Wait a minute and try again.';
    if (/fetch|network/i.test(m)) return 'Can’t reach your account right now. Check your connection.';
    return m;
  }
  function openAuth(v, note) { clearErr(); view(v || 'signin'); if (note) box('#inNote', note); }
  function steps(title, sub, list, i, foot) {
    view('busy'); $('#bzTitle').textContent = title; $('#bzSub').textContent = sub || ''; $('#bzFoot').textContent = foot || 'Nothing is deleted from this phone.';
    var ul = $('#bzSteps'); ul.innerHTML = '';
    list.forEach(function (t, k) { var li = document.createElement('li'); li.className = k < i ? 'd' : (k === i ? 'n' : ''); li.textContent = (k < i ? '✓ ' : k === i ? '◌ ' : '○ ') + t; ul.appendChild(li); });
    var done = Math.min(i, list.length); $('#bzBar').style.width = Math.round(100 * Math.max(done, .25) / list.length) + '%';
    $('#bzN').textContent = done >= list.length ? 'Done' : 'Step ' + (done + 1) + ' of ' + list.length;
    A.setAttribute('data-step', String(done));
  }
  function show() {
    $('#acctCard').hidden = false;
    $('#acctOut').hidden = !!user; $('#acctIn').hidden = !user;
    if (user) $('#acWho').textContent = user.email || '';
    var pn = $('#privNote'); if (pn) pn.textContent = user ? 'Signed in: your shifts are saved on this phone and synced to your account. No bank, nothing shared.' : 'Everything stays on this phone unless you sign in. No bank, nothing shared.';
  }
  function afterIn(email, title) {
    var L = ['Signed in as ' + email, 'Merging shifts from this phone', 'Saving to your account'];
    steps(title || 'Signing in…', 'Syncing your shifts', L, 1, 'Don’t close the app. This takes a few seconds.');
    return sync(function (n) { steps(title || 'Signing in…', 'Syncing your shifts', L, n); }).then(function (r) {
      r = r || last; steps(title || 'Signing in…', 'Syncing your shifts', L, 3); show();
      $('#wbTitle').textContent = title === 'Creating account…' ? 'You’re all set' : 'Welcome back';
      $('#wbSub').textContent = r && r.ok ? 'You’re signed in and ' + r.n + ' shift' + (r.n === 1 ? ' is' : 's are') + ' synced.' : 'You’re signed in. Sync will retry soon. Your shifts are safe on this phone.';
      return wait(350).then(function () { view('welcome'); return wait(1400); });
    }).then(function () { inFlow = false; closeAuth(); var tb = document.querySelector('#tabbar [data-tab=dashboard]'); if (tb) tb.click(); scrollTo(0, 0); });
  }
  function doSignIn(e) {
    if (e) e.preventDefault(); clearErr();
    var em = $('#acEmail').value.trim(), pw = $('#acPass').value;
    if (!EMAIL_RE.test(em)) { box('#inErr', 'Enter a valid email.'); $('#acEmail').classList.add('au-bad'); return; }
    if (!pw) { box('#inErr', 'Enter your password.'); $('#acPass').classList.add('au-bad'); return; }
    inFlow = true; steps('Signing in…', 'Checking your account', ['Signing in', 'Merging shifts from this phone', 'Saving to your account'], 0, 'Don’t close the app. This takes a few seconds.');
    sb.auth.signInWithPassword({ email: em, password: pw }).then(function (r) {
      if (r.error || !r.data || !r.data.session) { inFlow = false; view('signin'); box('#inErr', friendly(r.error && r.error.message)); $('#acPass').classList.add('au-bad'); $('#inPwErr').hidden = !/invalid login/i.test((r.error && r.error.message) || ''); return; }
      user = r.data.session.user; $('#acPass').value = ''; localStorage.removeItem(SKIP); return afterIn(user.email || em);
    }, function (err) { inFlow = false; view('signin'); box('#inErr', friendly(err && err.message)); });
  }
  function strength(p) { var n = 0; if (p.length >= 8) n++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) n++; if (/\d/.test(p)) n++; if (/[^A-Za-z0-9]/.test(p) || p.length >= 12) n++; return p ? Math.max(n, 1) : 0; }
  function meter() { var p = $('#upPass').value, n = strength(p); [].forEach.call($('#upMeter').children, function (i, k) { i.classList.toggle('on', k < n); });
    $('#upHint').textContent = !p ? 'At least 8 characters' : p.length < 8 ? 'Too short · at least 8 characters' : ['Weak', 'Weak', 'Okay', 'Good', 'Strong'][n] + ' · at least 8 characters'; }
  function doSignUp(e) {
    if (e) e.preventDefault(); clearErr();
    var em = $('#upEmail').value.trim(), p1 = $('#upPass').value, p2 = $('#upPass2').value;
    if (!EMAIL_RE.test(em)) { box('#upErr', 'Enter a valid email.'); $('#upEmail').classList.add('au-bad'); return; }
    if (p1.length < 8) { box('#upErr', 'Password needs at least 8 characters.'); $('#upPass').classList.add('au-bad'); return; }
    if (p1 !== p2) { box('#upErr', 'Passwords don’t match.'); $('#upPass2').classList.add('au-bad'); return; }
    inFlow = true; $('#acUp').disabled = true;
    sb.auth.signUp({ email: em, password: p1, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
      $('#acUp').disabled = false;
      if (r.error) { inFlow = false; box('#upErr', friendly(r.error.message)); return; }
      $('#upPass').value = $('#upPass2').value = ''; meter(); localStorage.removeItem(SKIP);
      if (!r.data.session) { inFlow = false; $('#ckEmail').textContent = em; $('#acEmail').value = em; view('check'); return; }
      user = r.data.session.user; return afterIn(user.email || em, 'Creating account…');
    }, function (err) { inFlow = false; $('#acUp').disabled = false; box('#upErr', friendly(err && err.message)); });
  }
  function doForgot(e) {
    if (e) e.preventDefault(); clearErr();
    var em = $('#fgEmail').value.trim(); if (!EMAIL_RE.test(em)) { box('#fgErr', 'Enter a valid email.'); $('#fgEmail').classList.add('au-bad'); return; }
    $('#fgSend').disabled = true;
    sb.auth.resetPasswordForEmail(em, { redirectTo: location.origin + location.pathname }).then(function (r) {
      $('#fgSend').disabled = false; if (r.error) box('#fgErr', friendly(r.error.message)); else box('#fgNote', 'Reset link sent to ' + em + '. Open it on this phone.'); });
  }
  function doNewPw(e) {
    if (e) e.preventDefault(); clearErr(); var p = $('#acNewPass').value;
    if (p.length < 8) { box('#npErr', 'Password needs at least 8 characters.'); $('#acNewPass').classList.add('au-bad'); return; }
    sb.auth.updateUser({ password: p }).then(function (r) { if (r.error) { box('#npErr', friendly(r.error.message)); return; }
      $('#acNewPass').value = ''; closeAuth(); show(); msg('Password updated.'); SW.toast('Password updated'); });
  }
  function doSignOut() {
    $('#soSheet').hidden = true; inFlow = true;
    var L = ['Saving unsynced changes', 'Signing out'];
    steps('Signing out…', 'Saving your shifts on this phone', L, 0);
    clearTimeout(timer);
    var t0 = Date.now();
    (user ? sync() : Promise.resolve({ ok: true })).then(function (r) {
      r = r || last; var ok = r && r.ok;
      steps('Signing out…', ok ? 'Your changes are saved to your account' : 'Couldn’t reach your account. Changes stay on this phone and sync next time you sign in.', L, 1);
      return sb.auth.signOut({ scope: 'local' }).catch(function () {}).then(function () { return wait(Math.max(0, 900 - (Date.now() - t0))); }).then(function () { return ok; });
    }).then(function (ok) {
      user = null; inFlow = false; localStorage.removeItem(SKIP); show(); msg('Signed out. Your shifts are still on this phone.');
      openAuth('signin', ok ? 'Signed out. Your shifts are still on this phone.' : 'Signed out. Your shifts are still on this phone. Unsynced changes will sync when you sign in again.');
      if (user === null) { var em = $('#acWho').textContent; if (em) $('#acEmail').value = em; }
    });
  }
  function bind() {
    $('#auFormIn').addEventListener('submit', doSignIn);
    $('#auFormUp').addEventListener('submit', doSignUp);
    $('#auFormFg').addEventListener('submit', doForgot);
    $('#acctNewPw').addEventListener('submit', doNewPw);
    $('#upPass').addEventListener('input', meter);
    $('#acForgot').addEventListener('click', function () { clearErr(); $('#fgEmail').value = $('#acEmail').value.trim(); view('forgot'); });
    $('#ckResend').addEventListener('click', function () { var em = $('#ckEmail').textContent, b = $('#ckResend'); if (!sb.auth.resend) return;
      b.disabled = true; sb.auth.resend({ type: 'signup', email: em, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) { box('#ckNote', r && r.error ? friendly(r.error.message) : 'Sent again. You can resend in 60 seconds.'); setTimeout(function () { b.disabled = false; }, 60000); }); });
    A.addEventListener('click', function (e) {
      var g = e.target.closest('[data-go]'); if (g) { clearErr(); var v = g.getAttribute('data-go');
        if (v === 'signup' && !$('#upEmail').value) $('#upEmail').value = $('#acEmail').value.trim();
        if (v === 'signin' && !$('#acEmail').value) $('#acEmail').value = $('#upEmail').value.trim(); view(v); return; }
      if (e.target.closest('[data-skip]')) { localStorage.setItem(SKIP, '1'); closeAuth(); return; }
      var sh = e.target.closest('[data-show]'); if (sh) { var inp = document.getElementById(sh.getAttribute('data-show')), vis = inp.type === 'password'; inp.type = vis ? 'text' : 'password'; sh.textContent = vis ? 'Hide' : 'Show'; sh.setAttribute('aria-label', vis ? 'Hide password' : 'Show password'); }
    });
    $('#acOpen').addEventListener('click', function () { openAuth('signin'); });
    $('#acSync').addEventListener('click', function () { sync(); });
    $('#acOutBtn').addEventListener('click', function () { $('#soSheet').hidden = false; });
    [].forEach.call(document.querySelectorAll('[data-socancel]'), function (el) { el.addEventListener('click', function () { $('#soSheet').hidden = true; }); });
    $('#soOk').addEventListener('click', doSignOut);
    window.addEventListener('online', changed);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') changed(); });
  }
  function start() {
    sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    bind(); show();
    sb.auth.onAuthStateChange(function (ev, session) {
      var was = user && user.id;
      if (inFlow && ev !== 'PASSWORD_RECOVERY') { if (session && session.user) user = session.user; return; }
      user = session && session.user || null; show();
      if (ev === 'PASSWORD_RECOVERY') { inFlow = false; clearErr(); view('newpw'); return; }
      if (user && curView() && curView() !== 'newpw') closeAuth();
      if (user && user.id !== was) sync();
    });
    sb.auth.getSession().then(function (r) { var s = r && r.data && r.data.session;
      if (s && (!user || user.id !== s.user.id)) { user = s.user; show(); sync(); }
      if (s && curView() === 'signin' && !inFlow) closeAuth();
      if (!s && !user && !inFlow && !localStorage.getItem(SKIP) && !curView()) openAuth('signin'); });
  }
  // Gate first paint: show sign-in right away unless the user chose to stay offline or a session is stored.
  if (A && !localStorage.getItem(SKIP) && !hasSessKey()) view('signin');
  window.SideWorkSync = { changed: changed, sync: sync, open: function (v) { openAuth(v); } };
  if (window.supabase && window.supabase.createClient) start();
  else { var t = document.createElement('script'); t.src = CDN; t.onload = start; t.onerror = function () { closeAuth(); $('#acctCard').hidden = false; $('#acOpen').hidden = true; msg('Account sign-in could not load. Your shifts are safe on this phone.'); }; document.head.appendChild(t); }
})();
