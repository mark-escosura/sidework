/* Side Work optional cloud sync (Supabase). Inactive unless config.js has a URL + anon key.
   Local data is the source of truth on this phone: sync only adds/updates, and signing out never clears it. */
(function () {
  'use strict';
  var C = window.SIDEWORK_CONFIG || {}, URL_ = (C.SUPABASE_URL || '').trim(), KEY = (C.SUPABASE_ANON_KEY || '').trim();
  if (!URL_ || !KEY || !window.SideWork) return;
  var SW = window.SideWork, META = 'sidework.sync', CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js';
  var $ = function (s) { return document.querySelector(s); };
  var sb = null, user = null, busy = false, again = false, timer = null, applying = false;
  function meta() { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch (e) { return {}; } }
  function setMeta(m) { localStorage.setItem(META, JSON.stringify(m)); }
  var F = [['id', 'id'], ['date', 'date'], ['shift', 'shift'], ['hours', 'hours'], ['role', 'role'], ['wage', 'wage'], ['clockIn', 'clock_in'], ['clockOut', 'clock_out'],
    ['cash', 'cash'], ['card', 'card'], ['tips', 'tips'], ['tipout', 'tipout'], ['sales', 'sales'], ['note', 'note'], ['createdAt', 'created_at']];
  function toRow(s) { var r = { user_id: user.id, deleted: false, updated_at: new Date().toISOString() }; F.forEach(function (f) { r[f[1]] = s[f[0]] == null ? null : s[f[0]]; }); return r; }
  function fromRow(r) { var s = {}; F.forEach(function (f) { s[f[0]] = r[f[1]]; }); s.hours = +s.hours; ['wage', 'cash', 'card', 'tips', 'tipout', 'sales'].forEach(function (k) { if (s[k] != null) s[k] = +s[k]; }); return SW.normalize(s); }
  function sig(s) { var o = {}; F.forEach(function (f) { o[f[0]] = s[f[0]] == null ? null : s[f[0]]; }); return JSON.stringify(o); }
  function k2(s) { return s.date + '|' + (s.clockIn || ''); }
  function status(t) { var el = $('#acStatus'); if (el) el.textContent = t; }
  function msg(t) { var el = $('#acMsg'); if (el) el.textContent = t || ''; }
  function fmt(d) { var h = d.getHours(), m = d.getMinutes(); return ((h % 12) || 12) + ':' + (m < 10 ? '0' : '') + m + (h < 12 ? 'am' : 'pm'); }

  /* Two-way merge. snap = what we last agreed with the cloud. Local changes since snap win; otherwise cloud changes apply. */
  function sync() {
    if (!user || !sb) return Promise.resolve();
    if (busy) { again = true; return Promise.resolve(); }
    if (navigator.onLine === false) { status('Offline · will sync later'); return Promise.resolve(); }
    busy = true; status('Syncing…');
    var m = meta(), first = m.uid !== user.id, snap = first ? {} : (m.snap || {});
    return sb.from('shifts').select('*').then(function (res) {
      if (res.error) throw res.error;
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
      var p = ups.length ? sb.from('shifts').upsert(ups, { onConflict: 'user_id,id' }) : Promise.resolve({});
      return p.then(function (u) { if (u && u.error) throw u.error;
        var ns = {}; local.forEach(function (s) { ns[s.id] = sig(s); }); setMeta({ uid: user.id, snap: ns, at: new Date().toISOString() });
        status('Synced ' + fmt(new Date()) + ' · ' + local.length + ' shift' + (local.length === 1 ? '' : 's'));
        if (first && remote.length + ups.length) SW.toast('Synced with your account'); });
    }).catch(function (e) { status('Not synced · ' + ((e && e.message) || 'error') + '. Your shifts are safe on this phone.'); })
      .then(function () { busy = false; if (again) { again = false; return sync(); } });
  }
  function changed() { if (applying || !user) return; clearTimeout(timer); timer = setTimeout(sync, 800); }

  function show() {
    $('#acctCard').hidden = false;
    $('#acctOut').hidden = !!user; $('#acctIn').hidden = !user;
    if (user) $('#acWho').textContent = user.email || '';
    var pn = $('#privNote'); if (pn) pn.textContent = user ? 'Signed in: your shifts are saved on this phone and synced to your account. No bank, nothing shared.' : 'Everything stays on this phone unless you sign in below. No bank, nothing shared.';
  }
  function creds() { var e = $('#acEmail').value.trim(), p = $('#acPass').value; if (!/^\S+@\S+\.\S+$/.test(e)) { msg('Enter a valid email.'); return null; } return { email: e, password: p }; }
  function bind() {
    $('#acIn').addEventListener('click', function () { var c = creds(); if (!c) return; if (!c.password) { msg('Enter your password.'); return; } msg('Signing in…');
      sb.auth.signInWithPassword(c).then(function (r) { if (r.error) msg(r.error.message); else { msg(''); $('#acPass').value = ''; } }); });
    $('#acUp').addEventListener('click', function () { var c = creds(); if (!c) return; if ((c.password || '').length < 6) { msg('Password needs at least 6 characters.'); return; } msg('Creating account…');
      sb.auth.signUp({ email: c.email, password: c.password, options: { emailRedirectTo: location.origin + location.pathname } }).then(function (r) {
        if (r.error) msg(r.error.message); else if (!r.data.session) msg('Check your email to confirm, then sign in.'); else msg(''); }); });
    $('#acForgot').addEventListener('click', function () { var e = $('#acEmail').value.trim(); if (!/^\S+@\S+\.\S+$/.test(e)) { msg('Type your email above first.'); return; }
      sb.auth.resetPasswordForEmail(e, { redirectTo: location.origin + location.pathname + '#profile' }).then(function (r) { msg(r.error ? r.error.message : 'Reset link sent. Open it on this phone.'); }); });
    $('#acSetPw').addEventListener('click', function () { var p = $('#acNewPass').value; if (p.length < 6) { msg('Password needs at least 6 characters.'); return; }
      sb.auth.updateUser({ password: p }).then(function (r) { if (r.error) msg(r.error.message); else { msg('Password updated.'); $('#acctNewPw').hidden = true; $('#acNewPass').value = ''; show(); } }); });
    $('#acSync').addEventListener('click', function () { sync(); });
    $('#acOutBtn').addEventListener('click', function () { sb.auth.signOut().then(function () { msg('Signed out. Your shifts are still on this phone.'); }); });
    window.addEventListener('online', changed);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') changed(); });
  }
  function start() {
    sb = window.supabase.createClient(URL_, KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
    bind(); show();
    sb.auth.onAuthStateChange(function (ev, session) {
      var was = user && user.id; user = session && session.user || null; show();
      if (ev === 'PASSWORD_RECOVERY') { $('#acctNewPw').hidden = false; $('#acctIn').hidden = true; msg('Choose a new password.'); }
      if (user && user.id !== was) sync();
    });
    sb.auth.getSession().then(function (r) { var s = r && r.data && r.data.session; if (s && (!user || user.id !== s.user.id)) { user = s.user; show(); sync(); } });
  }
  window.SideWorkSync = { changed: changed, sync: sync };
  if (window.supabase && window.supabase.createClient) start();
  else { var t = document.createElement('script'); t.src = CDN; t.onload = start; t.onerror = function () { $('#acctCard').hidden = false; msg('Account sign-in needs internet. Your shifts are safe on this phone.'); }; document.head.appendChild(t); }
})();
