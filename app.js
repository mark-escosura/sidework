/* Side Work · Tip Tracker. Account required (v26): data is only shown for the signed-in owner. */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); }, $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var SHIFTS = ['breakfast', 'lunch', 'dinner', 'overnight'];
  var K = { shifts: 'serverlife.shifts.v2', roles: 'serverlife.roles', last: 'serverlife.lastRole', sched: 'serverlife.schedule', goals: 'serverlife.goals', theme: 'serverlife.theme', icon: 'serverlife.icon', backup: 'serverlife.lastBackup' };
  var OLD = { shifts: 'tiptracker.shifts.v1', roles: 'tiptracker.roles', wage: 'tiptracker.wage', sched: 'tiptracker.schedule.v1' };
  var DEFAULT_WAGE = 16.90;
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], DOWL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], MONL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function fromIso(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }
  function monday(d) { var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - (x.getDay() + 6) % 7); return x; }
  function r2(v) { return Math.round((+v + Number.EPSILON) * 100) / 100; }
  function money(v) { v = r2(v); var neg = v < 0; v = Math.abs(v); return (neg ? '−$' : '$') + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function money0(v) { return (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString('en-US'); }
  function rate(v) { return v == null || !isFinite(v) ? '—' : '$' + v.toFixed(2) + '/hr'; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function nice(s) { var d = fromIso(s); return DOW[d.getDay()] + ' ' + MON[d.getMonth()] + ' ' + d.getDate(); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function num(v) { if (v == null) return null; v = String(v).replace(/[$,\s]/g, ''); if (v === '') return null; var n = Number(v); return isFinite(n) ? n : NaN; }
  function uid(p) { return (p || 's') + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function okWage(w) { return typeof w === 'number' && isFinite(w) && w >= 0 && w <= 200; }
  function okTime(t) { return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }
  function normTime(t) { if (!t) return null; var m = String(t).trim().match(/^(\d{1,2}):(\d{2})/); if (!m) return null; var v = pad(+m[1]) + ':' + m[2]; return okTime(v) ? v : null; }
  function spanHours(a, b) { if (!okTime(a) || !okTime(b)) return null; var d = (+b.slice(0, 2) * 60 + +b.slice(3)) - (+a.slice(0, 2) * 60 + +a.slice(3)); if (d <= 0) d += 1440; return r2(d / 60); }
  function fmtTime(t) { if (!okTime(t)) return ''; var h = +t.slice(0, 2), m = t.slice(3); return ((h % 12) || 12) + (m === '00' ? '' : ':' + m) + (h < 12 ? 'am' : 'pm'); }
  function shiftFor(t) { if (!okTime(t)) return null; var m = +t.slice(0, 2) * 60 + +t.slice(3); return m < 300 ? 'overnight' : m < 630 ? 'breakfast' : m < 900 ? 'lunch' : m < 1260 ? 'dinner' : 'overnight'; }
  /* v26: account required. User data is only read or written while a signed-in session owns this device's data (sidework.owner === session user id). */
  var USERK = [K.shifts, K.roles, K.last, K.sched, K.goals, K.backup, OLD.shifts, OLD.roles, OLD.wage, OLD.sched], OWNER = 'sidework.owner';
  function sessUid() { try { for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (/^sb-.*-auth-token$/.test(k) || k === 'mock.session') { var v = JSON.parse(localStorage.getItem(k)); var u = v && (v.user || (v.currentSession && v.currentSession.user)); if (u && u.id) return u.id; } } } catch (e) {} return null; }
  var unlocked = (function () { var u = sessUid(); return !!u && localStorage.getItem(OWNER) === u; })();
  function uget(k) { return unlocked || USERK.indexOf(k) < 0 ? localStorage.getItem(k) : null; }
  function getJSON(k) { if (!unlocked && USERK.indexOf(k) >= 0) return null; try { var v = JSON.parse(localStorage.getItem(k)); return v; } catch (e) { return null; } }
  function setJSON(k, v) { if (!unlocked && USERK.indexOf(k) >= 0) return; localStorage.setItem(k, JSON.stringify(v)); }

  /* ---------- roles ---------- */
  function loadRoles() { var a = getJSON(K.roles); if (!Array.isArray(a)) a = getJSON(OLD.roles);
    a = Array.isArray(a) ? a.filter(function (r) { return r && r.name && okWage(+r.wage); }).map(function (r) { return { id: String(r.id || uid('r')), name: String(r.name).slice(0, 40), wage: r2(+r.wage) }; }) : [];
    if (!a.length) { var w = parseFloat(uget(OLD.wage)); a = [{ id: 'r-server', name: 'Server', wage: okWage(w) ? r2(w) : DEFAULT_WAGE }]; }
    setJSON(K.roles, a); return a; }
  var roles = loadRoles();
  function saveRoles() { setJSON(K.roles, roles); }
  function roleByName(n) { n = String(n || '').trim().toLowerCase(); return roles.find(function (r) { return r.name.toLowerCase() === n; }) || null; }
  function defaultRole() { var id = uget(K.last); return roles.find(function (r) { return r.id === id; }) || roles[0]; }

  /* ---------- shifts + safe migration ----------
     New records: cash + card tips (each number or null); tips = cash + card, or null if both blank.
     Old single-Tips records keep their total in `tips` with cash/card = null ("split unknown"). Nothing is invented. Old keys are left untouched. */
  function nOrNull(v) { if (v === '' || v == null) return null; v = +v; return isFinite(v) ? r2(v) : null; }
  function migrate(s) {
    if (!s || typeof s !== 'object') return null;
    var hasSplit = s.cash != null || s.card != null;
    var o = { id: String(s.id || uid()), date: s.date, shift: s.shift, hours: +s.hours, role: s.role || roles[0].name, wage: okWage(+s.wage) ? r2(+s.wage) : roles[0].wage,
      clockIn: normTime(s.clockIn), clockOut: normTime(s.clockOut), cash: hasSplit ? nOrNull(s.cash) : null, card: hasSplit ? nOrNull(s.card) : null,
      tipout: nOrNull(s.tipout) || 0, sales: nOrNull(s.sales), note: String(s.note || '').slice(0, 200), createdAt: s.createdAt || null };
    o.tips = hasSplit ? (o.cash == null && o.card == null ? null : r2((o.cash || 0) + (o.card || 0))) : nOrNull(s.tips);
    return /^\d{4}-\d{2}-\d{2}$/.test(o.date || '') && SHIFTS.indexOf(o.shift) >= 0 && o.hours > 0 ? o : null;
  }
  function loadShifts() { var a = getJSON(K.shifts), first = !Array.isArray(a); if (first) a = getJSON(OLD.shifts);
    var out = (Array.isArray(a) ? a : []).map(migrate).filter(Boolean); setJSON(K.shifts, out); return out; }
  var shifts = loadShifts();
  function save() { setJSON(K.shifts, shifts); if (window.SideWorkSync) window.SideWorkSync.changed(); }
  function tipsOf(s) { return typeof s.tips === 'number' ? s.tips : null; }
  function splitKnown(s) { return s.cash != null || s.card != null; }
  function wages(s) { return s.hours * (okWage(s.wage) ? s.wage : roles[0].wage); }
  function take(s) { return wages(s) + (tipsOf(s) || 0) - (s.tipout || 0); }
  function agg(list) { var a = { n: list.length, hours: 0, wages: 0, tips: 0, cash: 0, card: 0, unknown: 0, tipout: 0, tipN: 0, tipHours: 0, take: 0 };
    list.forEach(function (s) { var t = tipsOf(s); a.hours += s.hours; a.wages += wages(s); a.tipout += s.tipout || 0;
      if (t != null) { a.tips += t; a.tipN++; a.tipHours += s.hours; if (splitKnown(s)) { a.cash += s.cash || 0; a.card += s.card || 0; } else a.unknown += t; } });
    a.take = a.wages + a.tips - a.tipout; a.rate = a.hours > 0 ? a.take / a.hours : null; a.tipRate = a.tipHours > 0 ? (a.tips - a.tipout) / a.tipHours : null; return a; }

  /* ---------- schedule ---------- */
  function validSched(x) { return x && typeof x.id === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x.date) && okTime(x.start) && okTime(x.end) && SHIFTS.indexOf(x.shift) >= 0; }
  function loadSched() { var a = getJSON(K.sched); if (!Array.isArray(a)) a = getJSON(OLD.sched); a = Array.isArray(a) ? a.filter(validSched) : []; setJSON(K.sched, a); return a; }
  var sched = loadSched();
  function saveSched() { setJSON(K.sched, sched); }
  function schedStart(x) { var d = fromIso(x.date); d.setHours(+x.start.slice(0, 2), +x.start.slice(3), 0, 0); return d; }
  function schedEnd(x) { var d = fromIso(x.date); d.setHours(+x.end.slice(0, 2), +x.end.slice(3), 0, 0); if (x.end <= x.start) d.setDate(d.getDate() + 1); return d; }
  function schedLogged(x) { return !!x.logged || shifts.some(function (s) { return s.date === x.date && s.shift === x.shift && (!x.role || s.role === x.role); }); }
  function upcoming() { var now = new Date(); return sched.filter(function (x) { return schedEnd(x) > now; }).sort(function (a, b) { return schedStart(a) - schedStart(b); }); }
  function dueToLog() { var now = new Date(), cut = addDays(now, -14);
    return sched.filter(function (x) { var e = schedEnd(x); return e <= now && e > cut && !x.dismissed && !schedLogged(x); }).sort(function (a, b) { return schedEnd(b) - schedEnd(a); }); }

  /* ---------- period (month picker) ---------- */
  var period = iso(new Date()).slice(0, 7);
  function monthRange(ym) { var y = +ym.slice(0, 4), m = +ym.slice(5) - 1, s = new Date(y, m, 1), e = new Date(y, m + 1, 0), t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate());
    return { ym: ym, start: s, end: e, through: e > t && s <= t ? t : e, current: s <= t && e >= t, days: e.getDate() }; }
  function prevYm(ym) { var d = new Date(+ym.slice(0, 4), +ym.slice(5) - 2, 1); return iso(d).slice(0, 7); }
  function inMonth(ym) { return shifts.filter(function (s) { return s.date.slice(0, 7) === ym; }); }
  function rangeText(R) { return MON[R.start.getMonth()] + ' 1 – ' + MON[R.through.getMonth()] + ' ' + R.through.getDate() + ', ' + R.start.getFullYear(); }
  function renderMonthPick() { if (!$('#monthPick')) return; var now = new Date(), first = shifts.reduce(function (m, s) { return s.date < m ? s.date : m; }, iso(now)).slice(0, 7), opts = [], ym = iso(now).slice(0, 7);
    var guard = 0; while (ym >= first && guard++ < 120) { opts.push(ym); ym = prevYm(ym); }
    if (opts.indexOf(period) < 0) opts.unshift(period);
    $('#monthPick').innerHTML = opts.map(function (v) { return '<option value="' + v + '"' + (v === period ? ' selected' : '') + '>' + MON[+v.slice(5) - 1] + ' ' + v.slice(0, 4) + '</option>'; }).join(''); }

  /* ---------- dashboard ---------- */
  function pct(a, b) { if (a == null || b == null || !b) return null; return (a - b) / Math.abs(b) * 100; }
  function deltaHTML(p, vs) { if (p == null) return '<span class="muted">' + (vs ? 'No data for ' + vs : '') + '</span>'; var up = p >= 0;
    return '<span class="' + (up ? 'up' : 'down') + '">' + (up ? '↑ ' : '↓ ') + Math.abs(p).toFixed(1) + '%</span>' + (vs ? ' vs ' + vs : ''); }
  function similarAvg(x, list) { var m = list.filter(function (s) { return s.shift === x.shift && s.role === x.role; }); if (!m.length) m = list.filter(function (s) { return s.shift === x.shift; }); return m.length ? agg(m).take / m.length : null; }

  function pill(p, txt) { if (p == null || !isFinite(p)) return null; var up = p >= 0; return '<span class="' + (up ? 'up' : 'down') + '">' + (up ? '↑ ' : '↓ ') + Math.abs(p).toFixed(1) + '%</span> ' + txt; }
  function setPill(sel, html) { var el = $(sel); el.hidden = !html; el.className = 'pill' + (html && html.indexOf('down') > 0 ? ' neg' : ''); el.innerHTML = html || ''; }
  function inRange(a, b) { return shifts.filter(function (s) { return s.date >= a && s.date <= b; }); }
  var chartPts = [];
  /* rate line chart: one dot per worked day, last 30 days */
  function lineChart(pts) {
    if (pts.length < 2) return '<p class="muted s chart-empty">Your rate chart fills in after shifts on 2 different days.</p>';
    var W = 400, H = 170, L = 40, Rr = 10, T = 12, B = 24, vs = pts.map(function (p) { return p.v; }), mn = Math.min.apply(null, vs), mx = Math.max.apply(null, vs);
    var pad0 = Math.max(2, (mx - mn) * 0.15); mn = Math.max(0, mn - pad0); mx += pad0;
    var t0 = pts[0].t, t1 = pts[pts.length - 1].t, X = function (t) { return L + (W - L - Rr) * (t - t0) / (t1 - t0); }, Y = function (v) { return T + (H - T - B) * (1 - (v - mn) / (mx - mn)); };
    var line = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p.t).toFixed(1) + ' ' + Y(p.v).toFixed(1); }).join(' ');
    var area = line + ' L' + X(t1).toFixed(1) + ' ' + (H - B) + ' L' + X(t0).toFixed(1) + ' ' + (H - B) + ' Z';
    var grid = [0, 1, 2, 3].map(function (i) { var v = mn + (mx - mn) * i / 3; return '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + Y(v).toFixed(1) + '" y2="' + Y(v).toFixed(1) + '" class="gl"/><text class="axis" x="' + (L - 6) + '" y="' + (Y(v) + 4).toFixed(1) + '" text-anchor="end">$' + Math.round(v) + '</text>'; }).join('');
    var idx = pts.length <= 4 ? pts.map(function (_, i) { return i; }) : [0, Math.round((pts.length - 1) / 3), Math.round((pts.length - 1) * 2 / 3), pts.length - 1];
    var xl = idx.map(function (i, k) { var p = pts[i], d = fromIso(p.d); return '<text class="axis" x="' + X(p.t).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="' + (k === 0 ? 'start' : k === idx.length - 1 ? 'end' : 'middle') + '">' + MON[d.getMonth()] + ' ' + d.getDate() + '</text>'; }).join('');
    chartPts = pts.map(function (p) { return { x: X(p.t) / W, y: Y(p.v) / H, d: p.d, v: p.v }; });
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Effective hourly rate by day"><defs><linearGradient id="ga" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#2DD4BF" stop-opacity=".35"/><stop offset="1" stop-color="#2DD4BF" stop-opacity="0"/></linearGradient></defs>' + grid +
      '<path d="' + area + '" fill="url(#ga)"/><path d="' + line + '" fill="none" stroke="#2DD4BF" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' +
      pts.map(function (p, i) { return '<circle class="dot" data-i="' + i + '" cx="' + X(p.t).toFixed(1) + '" cy="' + Y(p.v).toFixed(1) + '" r="4.5"/>'; }).join('') + xl + '</svg><div class="tip" id="chartTip" hidden></div>'; }
  function chartPoint(e) { var el = $('#dChart svg'); if (!el || !chartPts.length) return; var r = el.getBoundingClientRect(), x = ((e.touches ? e.touches[0].clientX : e.clientX) - r.left) / r.width, best = 0;
    chartPts.forEach(function (p, i) { if (Math.abs(p.x - x) < Math.abs(chartPts[best].x - x)) best = i; });
    var p = chartPts[best], tip = $('#chartTip'); tip.hidden = false; tip.innerHTML = '<b>' + rate(p.v) + '</b><span>' + nice(p.d) + '</span>';
    tip.style.left = Math.min(Math.max(p.x * 100, 14), 86) + '%'; tip.style.top = (p.y * r.height) + 'px';
    $$('#dChart .dot').forEach(function (c, i) { c.classList.toggle('on', i === best); }); }
  function donut(cash, card) { var tot = cash + card, C = 2 * Math.PI * 42, f = tot > 0 ? card / tot : 0;
    return '<svg viewBox="0 0 120 120" role="img" aria-label="Cash vs card"><circle cx="60" cy="60" r="42" fill="none" stroke="' + (tot > 0 ? '#3B4250' : '#2D323C') + '" stroke-width="14"/>' +
      (tot > 0 ? '<circle cx="60" cy="60" r="42" fill="none" stroke="#2DD4BF" stroke-width="14" stroke-linecap="' + (f > 0 && f < 1 ? 'round' : 'butt') + '" stroke-dasharray="' + (C * f).toFixed(2) + ' ' + C.toFixed(2) + '" transform="rotate(-90 60 60)"/>' : '') +
      '<text x="60" y="62" text-anchor="middle" font-size="22" font-weight="800" fill="currentColor">' + (tot > 0 ? Math.round(f * 100) + '%' : '—') + '</text><text x="60" y="80" text-anchor="middle" font-size="11" fill="#9CA3AF">Card</text></svg>'; }
  function spark(vals) { if (vals.length < 2) return ''; var mx = Math.max.apply(null, vals.concat([1])), W = 120, H = 44;
    var d = vals.map(function (v, i) { return (i ? 'L' : 'M') + (W * i / (vals.length - 1)).toFixed(1) + ' ' + (H - 3 - (H - 6) * v / mx).toFixed(1); }).join(' ');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="#2DD4BF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'; }
  /* this week (Mon–Sun) summary */
  function weekInfo() { var m = monday(new Date()), a = iso(m), b = iso(addDays(m, 6)); return { a: a, b: b, A: agg(inRange(a, b)) }; }
  function weekSummary() { var w = weekInfo(), A = w.A; if (!A.n) return '';
    return 'Side Work · week of ' + nice(w.a) + ': ' + money(A.take) + ' take-home, ' + A.n + ' shift' + (A.n > 1 ? 's' : '') + ', ' + r2(A.hours) + 'h, ' + rate(A.rate) + (A.cash + A.card ? ' (cash ' + money(A.cash) + ', card ' + money(A.card) + ')' : ''); }
  function copyText(t) { function fb() { var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok; }
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fb(); }); return Promise.resolve(fb()); }
  function renderDashboard() {
    var now = new Date(), t = iso(now), has = shifts.length > 0;
    $('#dEmpty').hidden = has; $('#dBody').hidden = !has; $('#dLog').hidden = !has; if (!has) return;
    /* rate: last 7 days vs the 7 before */
    var L7 = agg(inRange(iso(addDays(now, -6)), t)), P7 = agg(inRange(iso(addDays(now, -13)), iso(addDays(now, -7))));
    $('#dRate').textContent = L7.rate != null ? L7.rate.toFixed(2) : '—';
    var ymNow = t.slice(0, 7), PMf = agg(inMonth(prevYm(ymNow))), monthEmpty = !inMonth(ymNow).some(function (s) { return s.date <= t; }), fb = monthEmpty && PMf.n > 0, fbName = MONL[fromIso(prevYm(ymNow) + '-01').getMonth()];
    if (!L7.n && fb && PMf.rate != null) $('#dRate').textContent = PMf.rate.toFixed(2);
    $('#dRateSub').innerHTML = L7.n ? 'Last 7 days · ' + money(L7.take) + ' in ' + r2(L7.hours) + 'h' : fb ? 'No shifts in the last 7 days · showing <b>' + fbName + '</b> (' + PMf.n + ' shift' + (PMf.n === 1 ? '' : 's') + ', ' + r2(PMf.hours) + 'h)' : 'No shifts in the last 7 days';
    setPill('#dRatePill', L7.n && P7.n ? pill(pct(L7.rate, P7.rate), 'vs last 7 days') : null);
    var byDay = {}; inRange(iso(addDays(now, -29)), t).forEach(function (s) { (byDay[s.date] = byDay[s.date] || []).push(s); });
    var pts = Object.keys(byDay).sort().map(function (d) { return { d: d, t: fromIso(d).getTime(), v: agg(byDay[d]).rate }; });
    $('#dChart').innerHTML = lineChart(pts);
    /* this month */
    var ym = t.slice(0, 7), R = monthRange(ym), list = inMonth(ym).filter(function (s) { return s.date <= t; }), A = agg(list);
    var cList = fb ? inMonth(prevYm(ym)) : list, C = fb ? PMf : A, tot = C.cash + C.card;
    $('#dMonthLbl').textContent = '· ' + (fb ? fbName : MONL[R.start.getMonth()]);
    $('#dDonut').innerHTML = donut(C.cash, C.card);
    $('#dLegend').innerHTML = tot > 0 ? '<div><i class="c-card"></i><span>Card</span><b>' + Math.round(C.card / tot * 100) + '% · ' + money(C.card) + '</b></div><div><i class="c-cash"></i><span>Cash</span><b>' + Math.round(C.cash / tot * 100) + '% · ' + money(C.cash) + '</b></div>' : '<p class="muted s">No cash/card tips this month yet.</p>';
    $('#dUnknown').textContent = C.unknown ? money(C.unknown) + ' in tips has no cash/card split (not in the donut)' : '';
    $('#dEarned').textContent = fb ? money(C.take) : A.n ? money(A.take) : '$0.00'; $('#dEarnedLbl').textContent = fb ? 'Total earned · ' + fbName : 'Total earned';
    /* best day this month */
    var dm = {}; list.forEach(function (s) { (dm[s.date] = dm[s.date] || []).push(s); }); var dk = Object.keys(dm), best = null;
    dk.forEach(function (d) { var a = agg(dm[d]); if (!best || a.take > best.a.take) best = { d: d, a: a }; });
    if (fb) { var bdm = {}; cList.forEach(function (s) { (bdm[s.date] = bdm[s.date] || []).push(s); }); Object.keys(bdm).forEach(function (d) { var a = agg(bdm[d]); if (!best || a.take > best.a.take) best = { d: d, a: a }; }); }
    var avgDay = dk.length ? A.take / dk.length : null;
    $('#dBest').innerHTML = '<div class="ch"><span class="ic">🏆</span><p class="lbl">Best day</p></div>' + (best ? (fb ? '<p class="muted xs">' + fbName + ' best</p>' : '') + '<p class="money l">' + money(best.a.take) + '</p><p class="muted s">' + DOW[fromIso(best.d).getDay()] + ', ' + MON[fromIso(best.d).getMonth()] + ' ' + fromIso(best.d).getDate() + ' · ' + rate(best.a.rate) + '</p>' +
      (dk.length > 1 && avgDay > 0 ? '<p class="pill sm">' + pill(pct(best.a.take, avgDay), 'above avg.') + '</p>' : '') : '<p class="muted s">No shifts this month yet.</p>');
    /* weekly averages: last 4 weeks, only counting weeks since your first shift */
    var first = shifts.reduce(function (m, s) { return s.date < m ? s.date : m; }, t), from = iso(addDays(now, -27)); if (first > from) from = first;
    var weeks = Math.max(1, Math.ceil(((fromIso(t) - fromIso(from)) / 864e5 + 1) / 7)), W4 = agg(inRange(from, t)), w = weekInfo();
    $('#dWeek').innerHTML = '<div class="ch"><span class="ic"><svg viewBox="0 0 24 24"><path d="M6 20v-6M12 20V9M18 20V4"/></svg></span><p class="lbl">Weekly averages</p></div>' +
      '<div class="wrow"><span>Shifts / week</span><b>' + (W4.n ? (W4.n / weeks).toFixed(1) : '—') + '</b></div><div class="wrow"><span>Hours / shift</span><b>' + (W4.n ? (W4.hours / W4.n).toFixed(1) : '—') + '</b></div><div class="wrow"><span>Earned / shift</span><b class="g">' + (W4.n ? money(W4.take / W4.n) : '—') + '</b></div>' +
      '<div class="thisweek"><p class="muted xs">This week</p><p><b class="g" id="wkTotal">' + money(w.A.take) + '</b> · <span id="wkRate">' + rate(w.A.rate) + '</span></p><button type="button" class="btn sm wide" id="copySum"' + (w.A.n ? '' : ' disabled') + '>Copy summary</button></div>';
    /* projection: so far + current 7-day daily average × days remaining */
    var daysLeft = R.days - now.getDate(), perDay = L7.take / 7, proj = A.take + perDay * daysLeft, PM = agg(inMonth(prevYm(ym)));
    $('#dProj').textContent = money(proj);
    $('#dProjPill').className = 'pill'; if (fb && !L7.n) { var pp = $('#dProjPill'); pp.hidden = false; pp.className = 'pill calm'; pp.textContent = fbName + ': ' + money0(PM.take); } else setPill('#dProjPill', PM.n ? pill(pct(proj, PM.take), 'vs last month') : null);
    $('#dProj').classList.toggle('calm', fb && !L7.n);
    $('#dProjHow').textContent = L7.n ? 'Based on current 7-day average' : fb ? 'New month · log a shift to start the projection' : 'No shifts in the last 7 days, so this is what you have so far';
    $('#dDaysLeft').textContent = daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' remaining';
    var cum = 0, cv = []; for (var d = 1; d <= now.getDate(); d++) { var di = ym + '-' + pad(d); (dm[di] || []).forEach(function (s) { cum += take(s); }); cv.push(cum); }
    $('#dSpark').innerHTML = spark(cv);
    var nx = upcoming()[0]; $('#dNext').hidden = !nx;
    if (nx) $('#dNext').innerHTML = '<p class="lbl">Next scheduled shift</p><p><b>' + nice(nx.date) + ' · ' + cap(nx.shift) + '</b> <span class="muted">' + fmtTime(nx.start) + '–' + fmtTime(nx.end) + '</span></p>';
  }

  /* ---------- shifts: history ---------- */
  var roleFilter = '';
  function tipShort(s) { var t = tipsOf(s); return t == null ? (s.note ? esc(s.note) : 'no tips') : money(t) + ' tips'; }
  function tipText(s) { var t = tipsOf(s); if (t == null) return 'no tips'; return splitKnown(s) ? 'cash ' + money(s.cash || 0) + ' · card ' + money(s.card || 0) : 'tips ' + money(t) + ' (split unknown)'; }
  function shiftRow(s) { var tk = take(s);
    return '<div class="shift" data-id="' + esc(s.id) + '" data-act="edit" role="button" tabindex="0" aria-label="Edit ' + nice(s.date) + ' shift"><div class="main"><div class="t">' + nice(s.date) + ' · ' + cap(s.shift) + (roles.length > 1 || !roleByName(s.role) ? ' · ' + esc(s.role) : '') + '</div>' +
      '<div class="d">' + (s.clockIn ? fmtTime(s.clockIn) + '–' + fmtTime(s.clockOut) + ' · ' : '') + r2(s.hours) + 'h · ' + tipShort(s) + '</div></div>' +
      '<div class="amt"><b>' + money(tk) + '</b><span>' + rate(tk / s.hours) + '</span></div><span class="chev" aria-hidden="true">›</span></div>'; }
  function renderHistory() {
    var names = []; roles.concat(shifts.map(function (s) { return { name: s.role }; })).forEach(function (r) { if (r.name && names.indexOf(r.name) < 0) names.push(r.name); });
    if (roleFilter && names.indexOf(roleFilter) < 0) roleFilter = '';
    $('#roleFilter').hidden = names.length < 2;
    $('#roleFilter').innerHTML = ['All roles'].concat(names).map(function (n, i) { var v = i ? n : ''; return '<button type="button" class="rchip' + (v === roleFilter ? ' on' : '') + '" data-rf="' + esc(v) + '">' + esc(n) + '</button>'; }).join('');
    var list = shifts.filter(function (s) { return !roleFilter || s.role === roleFilter; }), A = agg(list);
    $('#hTotals').innerHTML = '<div><p class="v money">' + money0(A.take) + '</p><p class="k">Take-home</p></div><div><p class="v">' + r2(A.hours) + 'h</p><p class="k">' + A.n + ' shift' + (A.n === 1 ? '' : 's') + '</p></div><div><p class="v">' + rate(A.rate).replace('/hr', '') + '</p><p class="k">per hour</p></div>';
    $('#sEmpty').hidden = !!shifts.length; $('#hTotals').hidden = !shifts.length;
    if (!shifts.length) { $('#hList').innerHTML = ''; return; }
    if (!list.length) { $('#hList').innerHTML = '<div class="card empty"><p class="big">No shifts yet</p><p class="muted">Tap “+ Log” after your next shift.</p></div>'; return; }
    var sorted = list.slice().sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : SHIFTS.indexOf(b.shift) - SHIFTS.indexOf(a.shift); }), groups = [], gi = {};
    sorted.forEach(function (s) { var k = iso(monday(fromIso(s.date))); if (!(k in gi)) { gi[k] = groups.length; groups.push({ k: k, items: [] }); } groups[gi[k]].items.push(s); });
    $('#hList').innerHTML = groups.map(function (g) { var a = agg(g.items); return '<div class="wkhead"><span>Week of ' + nice(g.k) + '</span><span>' + money(a.take) + ' · ' + rate(a.rate) + '</span></div><div class="card">' + g.items.map(shiftRow).join('') + '</div>'; }).join('');
  }
  function onShiftAction(e) { var b = e.target.closest('[data-act]'); if (!b) return; var row = b.closest('[data-id]'); if (!row) return; var id = row.getAttribute('data-id'), s = shifts.find(function (x) { return x.id === id; }); if (!s) return;
    if (b.getAttribute('data-act') === 'edit') { resetForm(); editing = id; fillForm(s); $('#saveBtn').textContent = 'Update shift'; $('#logTitle').textContent = 'Edit shift'; $('#cancelEdit').hidden = false; $('#delShift').hidden = false; go('log'); }
    else if (b.getAttribute('data-act') === 'del' && confirm('Delete ' + nice(s.date) + ' ' + s.shift + ' (' + money(take(s)) + ')?')) { shifts = shifts.filter(function (x) { return x.id !== id; }); save(); renderAll(); toast('Deleted'); } }

  function deleteEditing() { var s = editingRec(); if (!s) return; if (!confirm('Delete ' + nice(s.date) + ' ' + s.shift + ' (' + money(take(s)) + ')? This can’t be undone.')) return;
    shifts = shifts.filter(function (x) { return x.id !== s.id; }); save(); resetForm(); renderAll(); go('shifts'); toast('Deleted'); }
  /* ---------- calendar + schedule ---------- */
  var calMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1), calSel = null;
  function renderCalendar() {
    var y = calMonth.getFullYear(), m = calMonth.getMonth(), ym = y + '-' + pad(m + 1), list = inMonth(ym), A = agg(list);
    $('#calTitle').textContent = MONL[m] + ' ' + y; $('#calSub').textContent = A.n ? money(A.take) + ' · ' + A.n + ' shift' + (A.n > 1 ? 's' : '') : 'No shifts logged';
    var by = {}, mx = 0; list.forEach(function (s) { by[s.date] = (by[s.date] || 0) + take(s); }); Object.keys(by).forEach(function (k) { mx = Math.max(mx, by[k]); });
    var sc = {}; sched.forEach(function (x) { if (x.date.slice(0, 7) === ym && !schedLogged(x)) (sc[x.date] = sc[x.date] || []).push(x); });
    var lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate(), t = iso(new Date()), h = '';
    for (var i = 0; i < lead; i++) h += '<div class="cc blank"></div>';
    for (var d = 1; d <= days; d++) { var di = ym + '-' + pad(d), v = by[di], s = sc[di] || [];
      h += '<button type="button" class="cc' + (v != null ? ' has' : '') + (s.length ? ' sched' : '') + (di === t ? ' today' : '') + (di === calSel ? ' sel' : '') + '" data-date="' + di + '" style="--h:' + (v != null && mx ? (v / mx).toFixed(2) : 0) + '" aria-label="' + nice(di) + (v != null ? ', ' + money(v) : '') + (s.length ? ', scheduled ' + fmtTime(s[0].start) : '') + '">' +
        '<span class="n">' + d + '</span>' + (v != null ? '<span class="v">$' + Math.round(v) + '</span>' : s.length ? '<span class="sc">' + fmtTime(s[0].start).replace(/(a|p)m$/, '$1') + '</span>' : '') + '</button>'; }
    $('#calGrid').innerHTML = h; $('#icsBtn').hidden = !upcoming().length; renderDay(); }
  function schedRow(x) { var past = schedEnd(x) <= new Date(), lg = schedLogged(x);
    return '<div class="shift srow" data-sid="' + esc(x.id) + '"><div class="main"><div class="t">' + cap(x.shift) + ' · scheduled' + (roles.length > 1 ? ' · ' + esc(x.role) : '') + '</div><div class="d">' + fmtTime(x.start) + '–' + fmtTime(x.end) + ' · ' + spanHours(x.start, x.end) + 'h' + (lg ? ' · logged' : past ? ' · not logged yet' : '') + '</div></div>' +
      (past && !lg ? '<button class="btn sm" data-sact="log">Log</button>' : '') + '<button class="ibtn" data-sact="edit" aria-label="Edit scheduled shift">✎</button><button class="ibtn del" data-sact="del" aria-label="Delete scheduled shift">✕</button></div>'; }
  function renderDay() { var el = $('#calDay'); if (!calSel) { el.innerHTML = ''; return; }
    var l = shifts.filter(function (s) { return s.date === calSel; }), sl = sched.filter(function (x) { return x.date === calSel; });
    el.innerHTML = '<h3>' + nice(calSel) + '</h3>' + (l.length || sl.length ? l.map(shiftRow).join('') + sl.map(schedRow).join('') : '<p class="muted s">Nothing on this day.</p>') +
      (calSel <= iso(new Date()) ? '<button class="btn ghost wide" id="dayLog">Log a shift on ' + nice(calSel).slice(4) + '</button>' : ''); }
  var schedEditing = null;
  function schedHint() { var a = normTime($('#sStart').value), b = normTime($('#sEnd').value), g = shiftFor(a), hh = spanHours(a, b);
    $('#sHint').textContent = g ? cap(g) + ' shift' + (hh ? ' · ' + hh + 'h' + (b <= a ? ' (ends next day)' : '') : '') : ''; }
  function openSchedForm(x) { schedEditing = x ? x.id : null; $('#schedTitle').textContent = x ? 'Edit scheduled shift' : 'Add a scheduled shift';
    $('#sDate').value = x ? x.date : (calSel && calSel >= iso(new Date()) ? calSel : iso(new Date()));
    var cur = x && x.role ? x.role : defaultRole().name; $('#sRoles').hidden = roles.length < 2;
    $('#sRoles').innerHTML = roles.map(function (r) { return '<label><input type="radio" name="srole" value="' + esc(r.name) + '"' + (r.name === cur ? ' checked' : '') + '><span>' + esc(r.name) + '</span></label>'; }).join('');
    $('#sStart').value = x ? x.start : ''; $('#sEnd').value = x ? x.end : ''; $('#sErr').textContent = ''; $('#sDel').hidden = !x; $('#sSave').textContent = x ? 'Save changes' : 'Add to schedule'; $('#schedForm').hidden = false; schedHint(); }
  function closeSchedForm() { $('#schedForm').hidden = true; schedEditing = null; }
  function submitSched() { var d = $('#sDate').value, a = normTime($('#sStart').value), b = normTime($('#sEnd').value), rr = document.querySelector('input[name=srole]:checked');
    var err = !/^\d{4}-\d{2}-\d{2}$/.test(d || '') ? 'Pick a date.' : !a || !b ? 'Add a start and end time.' : a === b ? 'Start and end can\'t be the same.' : '';
    var rec = { id: schedEditing || uid('c'), date: d, start: a, end: b, shift: shiftFor(a), role: rr ? rr.value : defaultRole().name };
    if (!err && schedEnd(rec) <= new Date()) err = 'That time has already passed. Pick an upcoming shift.';
    $('#sErr').textContent = err; if (err) return;
    var i = sched.findIndex(function (x) { return x.id === rec.id; }); if (i >= 0) { rec.rev = (sched[i].rev || 0) + 1; sched[i] = rec; } else sched.push(rec);
    saveSched(); closeSchedForm(); calSel = d; calMonth = new Date(fromIso(d).getFullYear(), fromIso(d).getMonth(), 1); renderAll(); toast((i >= 0 ? 'Updated · ' : 'Scheduled · ') + nice(d) + ' ' + fmtTime(a) + '–' + fmtTime(b)); }
  function delSched(x) { if (!confirm('Remove ' + nice(x.date) + ' ' + x.shift + ' from your schedule?')) return; sched = sched.filter(function (y) { return y.id !== x.id; }); saveSched(); if (schedEditing === x.id) closeSchedForm(); renderAll(); toast('Removed from schedule'); }
  /* .ics: upcoming shifts, alarm 1h before + "Log your tips" at end, stable UID per scheduled shift */
  function icsDate(d) { return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, ''); }
  function icsText(s) { return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function icsFold(l) { var out = []; while (l.length > 73) { out.push(l.slice(0, 73)); l = ' ' + l.slice(73); } out.push(l); return out.join('\r\n'); }
  function buildICS(list) { var now = icsDate(new Date()), L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Side Work//Tip Tracker//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Side Work shifts'];
    list.forEach(function (x) { var t = cap(x.shift) + ' shift' + (x.role ? ' (' + x.role + ')' : '');
      L.push('BEGIN:VEVENT', 'UID:' + x.id + '@tip-tracker.mark-escosura.github.io', 'SEQUENCE:' + (x.rev || 0), 'DTSTAMP:' + now, 'DTSTART:' + icsDate(schedStart(x)), 'DTEND:' + icsDate(schedEnd(x)),
        'SUMMARY:' + icsText(t), 'DESCRIPTION:' + icsText('Scheduled ' + fmtTime(x.start) + '–' + fmtTime(x.end) + '. After your shift, open Side Work to log your tips.'),
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsText(t + ' starts in 1 hour'), 'TRIGGER:-PT1H', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:Log your tips', 'DESCRIPTION:Log your tips', 'TRIGGER;RELATED=END:PT0S', 'END:VALARM', 'END:VEVENT'); });
    L.push('END:VCALENDAR'); return L.map(icsFold).join('\r\n') + '\r\n'; }
  function download(name, text, type) { var url = URL.createObjectURL(new Blob([text], { type: type })), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 4000); }
  function downloadICS() { var l = upcoming(); if (!l.length) { toast('Add an upcoming shift first'); return; } download('work-shifts.ics', buildICS(l), 'text/calendar;charset=utf-8'); toast(l.length + ' shift' + (l.length > 1 ? 's' : '') + ' ready for Calendar. Re-adding updates them.'); }
  /* banner */
  var pendingSched = null;
  function renderBanner() { var d = dueToLog()[0], b = $('#logBanner'); b.hidden = !d; if (d) { b.setAttribute('data-sid', d.id); $('#bannerText').textContent = 'Log your ' + DOW[fromIso(d.date).getDay()] + ' ' + d.shift + ' shift?'; } }
  function openFromSched(x) { resetForm(); fillForm({ date: x.date, shift: x.shift, role: x.role, clockIn: x.start, clockOut: x.end, hours: spanHours(x.start, x.end) }); pendingSched = x.id; go('log'); setTimeout(function () { $('#fCash').focus(); }, 60); }

  /* ---------- tips ---------- */
  function renderInsightsEmpty() { var has = !!shifts.length; $('#iEmpty').hidden = has; $$('#s-insights > *').forEach(function (el) { if (el.id !== 'iEmpty' && !el.classList.contains('h1row')) { if (!has) { if (!el.hasAttribute('data-eh')) { el.setAttribute('data-eh', el.hidden ? '1' : '0'); } el.hidden = true; } else if (el.hasAttribute('data-eh')) { el.hidden = el.getAttribute('data-eh') === '1'; el.removeAttribute('data-eh'); } } }); }
  var iMode = 'week', SHN = { breakfast: 'breakfast', lunch: 'lunch', dinner: 'dinner', overnight: 'late' };
  function inRange(a, b) { return shifts.filter(function (s) { return s.date >= a && s.date <= b; }); }
  function md(d) { return MON[d.getMonth()] + ' ' + d.getDate(); }
  function insightBars() { var t = new Date(); t = new Date(t.getFullYear(), t.getMonth(), t.getDate()); var B = [], R = {}, ti = iso(t);
    if (iMode === 'week') { var ws = monday(t), we = addDays(ws, 6); for (var i = 0; i < 7; i++) { var d = iso(addDays(ws, i)); B.push({ a: d, b: d, l: DOW[addDays(ws, i).getDay()].slice(0, 3), t: nice(d) }); }
      R = { a: iso(ws), b: iso(we), txt: 'This week · ' + md(ws) + ' – ' + md(we), pa: iso(addDays(ws, -7)), pb: iso(addDays(t, -7)), vs: 'last week' }; }
    else if (iMode === 'month') { var ms = new Date(t.getFullYear(), t.getMonth(), 1), me = new Date(t.getFullYear(), t.getMonth() + 1, 0), w = monday(ms);
      while (w <= me) { var a0 = w < ms ? ms : w, b0 = addDays(w, 6) > me ? me : addDays(w, 6); B.push({ a: iso(a0), b: iso(b0), l: md(a0), t: md(a0) + ' – ' + md(b0) }); w = addDays(w, 7); }
      var pms = new Date(t.getFullYear(), t.getMonth() - 1, 1), pme = new Date(t.getFullYear(), t.getMonth(), 0), pd = new Date(pms.getFullYear(), pms.getMonth(), Math.min(t.getDate(), pme.getDate()));
      R = { a: iso(ms), b: iso(me), txt: MONL[t.getMonth()] + ' ' + t.getFullYear(), pa: iso(pms), pb: iso(pd), vs: 'last month' }; }
    else { var first = shifts.reduce(function (m, s) { return s.date < m ? s.date : m; }, ti), f = fromIso(first), n = Math.min(6, (t.getFullYear() - f.getFullYear()) * 12 + t.getMonth() - f.getMonth() + 1);
      for (var k = n - 1; k >= 0; k--) { var s0 = new Date(t.getFullYear(), t.getMonth() - k, 1), e0 = new Date(t.getFullYear(), t.getMonth() - k + 1, 0); B.push({ a: iso(s0), b: iso(e0), l: MON[s0.getMonth()], t: MONL[s0.getMonth()] + ' ' + s0.getFullYear() }); }
      R = { a: '0000-01-01', b: '9999-12-31', txt: 'All time · since ' + nice(first) }; }
    B.forEach(function (x) { x.A = agg(inRange(x.a, x.b)); x.future = x.a > ti; }); return { B: B, R: R, ti: ti }; }
  function tipsHTML(A) { var tot = A.cash + A.card + A.unknown, pc = tot > 0 ? A.cash / tot * 100 : 0, pk = tot > 0 ? A.card / tot * 100 : 0, pu = tot > 0 ? 100 - pc - pk : 0;
    return '<div class="in-lg"><span>Total tips</span><b>' + money(A.tips) + '</b></div><div class="in-split" aria-hidden="true"><i class="c1" style="width:' + pc.toFixed(1) + '%"></i><i class="c2" style="width:' + pk.toFixed(1) + '%"></i><i class="c3" style="width:' + pu.toFixed(1) + '%"></i></div>' +
      '<div class="in-lg"><span><b class="d1">●</b> Cash ' + money(A.cash) + '</span><span><b class="d2">●</b> Card ' + money(A.card) + '</span></div>' + (A.unknown ? '<div class="in-lg"><span><b class="d3">●</b> Split unknown</span><b>' + money(A.unknown) + '</b></div>' : '') +
      '<div class="in-lg"><span>Tipped out</span><b>' + money(A.tipout) + '</b></div><div class="in-lg"><span>Tip $/hr (after tip-out)</span><b class="g">' + rate(A.tipRate) + '</b></div>'; }
  function openRange(a, b, title) { var L = inRange(a, b).sort(function (x, y) { return x.date < y.date ? -1 : 1; }), A = agg(L);
    $('#iShH').textContent = title;
    $('#iShBody').innerHTML = '<p class="in-big c">' + money(A.take) + '<small> take-home</small></p><p class="muted s c">' + A.n + ' shift' + (A.n === 1 ? '' : 's') + ' · ' + r2(A.hours) + 'h · ' + rate(A.rate) + '</p>' +
      '<div class="pf-grp">' + L.slice(0, 40).map(function (x) { return '<div class="pf-row"><span class="pf-t">' + (a === b ? '' : esc(nice(x.date)) + ' · ') + esc(cap(x.shift === 'overnight' ? 'late' : x.shift)) + ' · ' + esc(x.role) + '<small>' + (x.clockIn && x.clockOut ? esc(x.clockIn) + '–' + esc(x.clockOut) + ' · ' : '') + x.hours + 'h · wages ' + money(wages(x)) + '</small></span><b class="in-amt">' + money(take(x)) + '</b></div>'; }).join('') + '</div>' +
      '<div class="card in-tips" style="margin-top:12px">' + tipsHTML(A) + '</div>';
    pfSheet('iSheet', true); }
  function iSub(more, focusId) { $('#iMain').hidden = !!more; $('#iMore').hidden = !more; if (more && focusId) { var e = $('#' + focusId); window.scrollTo(0, e.getBoundingClientRect().top + scrollY - 80); } else window.scrollTo(0, 0); }
  function renderTips() { if (!$('#iBars')) return; var I = insightBars(), R = I.R, list = inRange(R.a, R.b), A = agg(list);
    $('#iRange').textContent = R.txt; $('#iTake').textContent = money(A.take);
    var dl = $('#iDelta'); if (R.vs) { var cur = agg(inRange(R.a, I.ti)), prev = agg(inRange(R.pa, R.pb));
      if (!prev.n) { dl.className = 'in-delta muted'; dl.textContent = 'Nothing logged ' + R.vs + ' to compare'; }
      else { var df = cur.take - prev.take; dl.className = 'in-delta ' + (df >= 0 ? 'up' : 'dn'); dl.textContent = (df >= 0 ? '▲ ' : '▼ ') + money0(Math.abs(df)) + ' vs ' + R.vs + ' at this point'; } }
    else { dl.className = 'in-delta muted'; dl.textContent = A.n + ' shift' + (A.n === 1 ? '' : 's') + ' · ' + r2(A.hours) + 'h'; }
    var mx = I.B.reduce(function (m, x) { return Math.max(m, x.A.take); }, 0);
    $('#iBars').innerHTML = I.B.map(function (x) { var v = x.A.take, on = mx > 0 && v === mx; return '<button type="button" class="in-bar' + (on ? ' hi' : '') + '" data-a="' + x.a + '" data-b="' + x.b + '" data-t="' + esc(x.t) + '" aria-label="' + esc(x.t) + ': ' + (x.A.n ? money(v) : 'no shifts') + '"' + (x.A.n ? '' : ' disabled') + '><span>' + (x.A.n ? money0(v) : x.future ? '' : 'off') + '</span><i style="height:' + (mx > 0 && x.A.n ? Math.max(6, v / mx * 76) : 4).toFixed(0) + 'px"></i>' + esc(x.l) + '</button>'; }).join('');
    $('#iTiles').innerHTML = '<div class="pf-st g"><b>' + (A.rate == null ? '—' : '$' + A.rate.toFixed(2)) + '</b><small>avg per hour</small></div><div class="pf-st"><b>' + r2(A.hours) + 'h</b><small>hours</small></div><div class="pf-st"><b>' + A.n + '</b><small>shift' + (A.n === 1 ? '' : 's') + '</small></div>';
    var G = {}; shifts.forEach(function (s) { if (!(s.hours > 0)) return; var k = ((fromIso(s.date).getDay() + 6) % 7) + '|' + s.shift; (G[k] = G[k] || []).push(s); });
    var DN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], bt = Object.keys(G).map(function (k) { var a = agg(G[k]), p = k.split('|'); return { n: DN[+p[0]] + ' ' + (SHN[p[1]] || p[1]), a: a }; }).filter(function (x) { return x.a.rate != null; }).sort(function (x, y) { return y.a.rate - x.a.rate; }).slice(0, 3);
    var top = bt.length ? bt[0].a.rate : 1;
    $('#iBest').innerHTML = bt.length ? bt.map(function (x, i) { return '<div class="in-bt"><span class="in-rk">' + (i + 1) + '</span><div class="pf-t">' + esc(x.n) + '<small>' + money0(x.a.take / x.a.n) + ' avg · ' + x.a.n + ' shift' + (x.a.n === 1 ? '' : 's') + '</small><div class="in-meter"><i style="width:' + (x.a.rate / top * 100).toFixed(0) + '%"></i></div></div><b class="in-amt">' + rate(x.a.rate) + '</b></div>'; }).join('') + '<p class="muted xs in-bnote">All time, by average take-home per hour.</p>' : '<p class="muted s in-bnote">Log shifts to see your best days and shifts.</p>';
    $('#tKpis').innerHTML = tipsHTML(A);
    var G = {}; shifts.forEach(function (s) { var k = ((fromIso(s.date).getDay() + 6) % 7) + s.shift; (G[k] = G[k] || []).push(s); });
    $('#dayGrid').innerHTML = shifts.length ? '<table class="dg"><thead><tr><th></th>' + SHIFTS.map(function (s) { return '<th>' + ({ breakfast: 'Bkfst', lunch: 'Lunch', dinner: 'Dinner', overnight: 'Late' }[s] || cap(s)) + '</th>'; }).join('') + '</tr></thead><tbody>' +
      ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(function (dn, i) { return '<tr><th>' + dn + '</th>' + SHIFTS.map(function (sh) { var g = G[i + sh]; if (!g) return '<td class="none">·</td>'; var a = agg(g);
        return '<td data-k="' + dn + '-' + sh + '"><b>' + money0(a.take / a.n) + '</b><span>' + rate(a.rate).replace('/hr', '/h') + ' · ' + a.n + '</span></td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table><p class="xs">Bkfst = breakfast · Late = overnight</p><p class="xs">All time · avg take-home per shift, $/hr, shift count</p>' : '<p class="muted s">Log shifts to see which days and shifts pay best.</p>'; }

  /* ---------- reports ---------- */
  var wkStart = monday(new Date());
  function kp(k, v, g) { return '<div><p class="k">' + k + '</p><p class="v' + (g ? ' g' : '') + '">' + v + '</p></div>'; }
  function renderReports() {
    var A = agg(shifts); $('#stAll').innerHTML = A.n ? kp('Take-home', money(A.take), 1) + kp('Effective rate', rate(A.rate), 1) + kp('Shifts · hours', A.n + ' · ' + r2(A.hours) + 'h') + kp('Tips', money(A.tips)) + kp('Wages', money(A.wages)) + kp('Tip $/hr', rate(A.tipRate)) : '<p class="muted s">No shifts yet.</p>';
    var br = {}; shifts.forEach(function (s) { (br[s.role] = br[s.role] || []).push(s); }); var ks = Object.keys(br);
    $('#stRoles').hidden = ks.length < 2; $('#stRoles').innerHTML = '<p class="lbl">By role</p>' + ks.map(function (k) { var a = agg(br[k]); return '<div class="dayrow"><span>' + esc(k) + '</span><span class="muted">' + r2(a.hours) + 'h · ' + rate(a.rate) + '</span><b>' + money(a.take) + '</b></div>'; }).join('');
    var best = shifts.map(function (s) { return { s: s, r: take(s) / s.hours }; }).sort(function (a, b) { return b.r - a.r; }).slice(0, 5);
    $('#stBest').innerHTML = best.length ? best.map(function (x) { return '<li>' + nice(x.s.date) + ' · ' + esc(cap(x.s.shift === 'overnight' ? 'late' : x.s.shift)) + ' <b>' + rate(x.r) + '</b><div class="xs">' + money(take(x.s)) + ' in ' + x.s.hours + 'h</div></li>'; }).join('') : '<li class="muted">Log a shift to see your best ones.</li>';
    var g = getJSON(K.goals) || {}; if (document.activeElement !== $('#gWeek')) $('#gWeek').value = g.week || ''; if (document.activeElement !== $('#gMonth')) $('#gMonth').value = g.month || '';
    var tw = monday(new Date()), cw = agg(shifts.filter(function (s) { return s.date >= iso(tw) && s.date <= iso(addDays(tw, 6)); })).take, cm = agg(inMonth(iso(new Date()).slice(0, 7))).take;
    function bar(lbl, have, goal) { return goal ? '<div class="gbar"><div class="dayrow" style="border:0;padding:0"><span>' + lbl + '</span><span class="muted">' + money0(have) + ' of ' + money0(goal) + '</span><b>' + Math.round(have / goal * 100) + '%</b></div><div class="tr"><i style="width:' + Math.min(100, have / goal * 100).toFixed(1) + '%"></i></div></div>' : ''; }
    $('#goalBars').innerHTML = (bar('This week', cw, g.week) + bar('This month', cm, g.month)) || '<p class="muted s">Set a goal to see your progress.</p>'; }

  /* ---------- CSV ---------- */
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) || /^[=+\-@]/.test(v) ? '"' + (/^[=+\-@]/.test(v) ? "'" : '') + v.replace(/"/g, '""') + '"' : v; }
  function toCSV() { var H = ['date', 'shift', 'role', 'hourly_wage', 'clock_in', 'clock_out', 'hours', 'cash_tips', 'card_tips', 'total_tips', 'tipped_out', 'sales', 'wages', 'take_home', 'note'];
    var rows = shifts.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }).map(function (s) { var sk = splitKnown(s);
      return [s.date, s.shift, s.role, s.wage.toFixed(2), s.clockIn, s.clockOut, s.hours, sk && s.cash != null ? s.cash.toFixed(2) : '', sk && s.card != null ? s.card.toFixed(2) : '', tipsOf(s) != null ? tipsOf(s).toFixed(2) : '', (s.tipout || 0).toFixed(2), s.sales != null ? s.sales.toFixed(2) : '', r2(wages(s)).toFixed(2), r2(take(s)).toFixed(2), s.note].map(csvCell).join(','); });
    return [H.join(',')].concat(rows).join('\r\n') + '\r\n'; }
  function exportCSV() { if (!shifts.length) { toast('No shifts to export yet'); return; } download('side-work-shifts-' + iso(new Date()) + '.csv', '\ufeff' + toCSV(), 'text/csv;charset=utf-8'); toast('Exported ' + shifts.length + ' shift' + (shifts.length > 1 ? 's' : '')); }

  /* ---------- log form ---------- */
  var editing = null, formWage = null;
  function selRole() { var r = document.querySelector('input[name=role]:checked'); return r ? r.value : null; }
  function renderRoleChips(cur) { $('#roleChips').hidden = roles.length < 2;
    $('#roleChips').innerHTML = roles.map(function (r) { return '<label><input type="radio" name="role" value="' + esc(r.name) + '"' + (r.name === cur ? ' checked' : '') + '><span>' + esc(r.name) + '<em>$' + r.wage.toFixed(2) + '</em></span></label>'; }).join('');
    if (cur && !roleByName(cur)) { $('#roleChips').hidden = false; $('#roleChips').insertAdjacentHTML('beforeend', '<label><input type="radio" name="role" value="' + esc(cur) + '" checked><span>' + esc(cur) + '<em>deleted</em></span></label>'); } }
  /* shift type comes from clock in/out (overnight-aware); records without times keep their saved shift */
  var keptShift = null;
  function deriveShift(ci, co) { if (!okTime(ci)) return null; var g = shiftFor(ci); if (okTime(co) && co <= ci && g === 'dinner' && +co.slice(0, 2) >= 2) g = 'overnight'; return g; }
  function guessShift() { var ci = normTime($('#fIn').value), co = normTime($('#fOut').value), g = deriveShift(ci, co) || keptShift, h = spanHours(ci, co);
    $('#autoShift').innerHTML = g ? 'Shift: <b>' + cap(g) + '</b>' + (h ? ' · ' + h + 'h' + (co && co <= ci ? ' (ends next day)' : '') : '') : '<span class="muted">Shift type fills in from your clock-in time</span>'; }
  function resetForm() { var dz = document.getElementById('delShift'); if (dz) dz.hidden = true; editing = null; pendingSched = null; formWage = null; $('#form').reset(); keptShift = null; $('#fDate').value = iso(new Date()); renderRoleChips(defaultRole().name); guessShift();
    $('#saveBtn').textContent = 'Add shift'; $('#logTitle').textContent = 'Log shift'; $('#cancelEdit').hidden = true; $('#formErr').textContent = ''; $('#hoursHint').textContent = ''; $('#legacyNote').hidden = true; $('#more').open = false; moreSummary(); updateTake(); }
  function fillForm(s) { $('#fDate').value = s.date || iso(new Date()); renderRoleChips(s.role || defaultRole().name); formWage = okWage(s.wage) ? s.wage : null;
    keptShift = s.clockIn ? null : (s.shift || null);
    $('#fIn').value = s.clockIn || ''; $('#fOut').value = s.clockOut || ''; $('#fHours').value = s.hours != null ? s.hours : '';
    var legacy = s.id && tipsOf(s) != null && !splitKnown(s);
    $('#fCash').value = s.cash != null ? s.cash : ''; $('#fCard').value = s.card != null ? s.card : '';
    $('#legacyNote').hidden = !legacy; $('#legacyNote').textContent = legacy ? 'This older shift has ' + money(s.tips) + ' in tips with no cash/card split. Leave both blank to keep it, or enter cash and card to replace it.' : '';
    $('#fTipout').value = s.tipout ? s.tipout : ''; $('#fSales').value = s.sales != null ? s.sales : ''; $('#fNote').value = s.note || '';
    $('#more').open = !!(s.sales != null || s.note || s.tipout || (s.hours && !s.clockIn)); guessShift(); hoursHint(); moreSummary(); updateTake(); }
  function readForm() { var ci = normTime($('#fIn').value), co = normTime($('#fOut').value);
    return { date: $('#fDate').value, shift: deriveShift(ci, co) || keptShift, role: selRole(), clockIn: normTime($('#fIn').value), clockOut: normTime($('#fOut').value), hours: num($('#fHours').value),
      cash: num($('#fCash').value), card: num($('#fCard').value), tipout: num($('#fTipout').value), sales: num($('#fSales').value), note: $('#fNote').value.trim() }; }
  function validate(f) { if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date || '')) return 'Pick a date.'; if (!f.role) return 'Pick a role.';
    if (!!f.clockIn !== !!f.clockOut) return 'Add both clock in and clock out.'; if (!f.shift) return 'Add your clock in and clock out times.';
    if (!(f.hours > 0) || f.hours > 24) return 'Hours should be between 0 and 24.';
    if ([f.cash, f.card, f.tipout, f.sales].some(function (v) { return v != null && (isNaN(v) || v < 0); })) return 'Amounts should be numbers, 0 or more.'; return ''; }
  function editingRec() { return editing ? shifts.find(function (x) { return x.id === editing; }) : null; }
  function formRate(name) { var e = editingRec(); if (e && e.role === name && okWage(formWage)) return formWage; var r = roleByName(name); return r ? r.wage : e && okWage(e.wage) ? e.wage : roles[0].wage; }
  function formTips(f) { var e = editingRec(); if (f.cash == null && f.card == null) return e && !splitKnown(e) ? { tips: tipsOf(e), cash: null, card: null } : { tips: null, cash: null, card: null };
    return { cash: f.cash == null ? null : r2(f.cash), card: f.card == null ? null : r2(f.card), tips: r2((f.cash || 0) + (f.card || 0)), split: true }; }
  function updateTake() { var f = readForm(); if ([f.cash, f.card, f.tipout].some(function (v) { return v != null && isNaN(v); }) || !(f.hours > 0)) { $('#takeLine').innerHTML = ''; return; }
    var T = formTips(f), w = f.hours * formRate(f.role), tk = w + (T.tips || 0) - (f.tipout || 0);
    $('#takeLine').innerHTML = 'Take-home <b>' + money(tk) + '</b> · ' + rate(tk / f.hours) + '<br><span class="muted s">Wages ' + money(w) + (T.tips != null ? ' + tips ' + money(T.tips) : ' · no tips') + (f.tipout ? ' − tip-out ' + money(f.tipout) : '') + '</span>'; }
  function hoursHint() { var sp = spanHours(normTime($('#fIn').value), normTime($('#fOut').value)), h = num($('#fHours').value);
    $('#hoursHint').textContent = sp == null ? '' : h != null && !isNaN(h) && Math.abs(h - sp) > 0.004 ? '(' + sp + 'h clocked, ' + (h < sp ? r2(sp - h) + 'h break' : 'override') + ')' : '(from clock)'; }
  function moreSummary() { var f = readForm(), b = []; if (f.date && f.date !== iso(new Date())) b.push(nice(f.date)); if (f.tipout) b.push('tipped out ' + money(f.tipout)); if (f.sales) b.push('sales ' + money(f.sales)); if (f.note) b.push('note'); $('#moreSum').textContent = b.length ? '· ' + b.join(' · ') : ''; }
  function commit(f) { var role = roleByName(f.role), prev = editingRec(), T = formTips(f), msBefore = milestones(shifts, lastBackup());
    var w = prev && prev.role === f.role && okWage(prev.wage) ? prev.wage : role ? role.wage : prev ? prev.wage : roles[0].wage; if (role && unlocked) localStorage.setItem(K.last, role.id);
    var rec = { date: f.date, shift: f.shift, role: f.role, wage: r2(w), clockIn: f.clockIn, clockOut: f.clockOut, hours: r2(f.hours), cash: T.cash, card: T.card, tips: T.tips,
      tipout: r2(f.tipout || 0), sales: f.sales == null ? null : r2(f.sales), note: f.note.slice(0, 200) };
    if (prev) { rec.id = prev.id; rec.createdAt = prev.createdAt; shifts[shifts.indexOf(prev)] = rec; } else { rec.id = uid(); rec.createdAt = new Date().toISOString(); shifts.push(rec); }
    if (pendingSched && !prev) { var ps = sched.find(function (x) { return x.id === pendingSched; }); if (ps) { ps.logged = rec.id; saveSched(); } }
    save(); var msCel = celebrate(msBefore, milestones(shifts, lastBackup()), rec); if (!msCel) toast((prev ? 'Updated' : 'Saved') + ' · ' + money(take(rec)) + ' take-home · ' + rate(take(rec) / rec.hours)); resetForm(); period = rec.date.slice(0, 7) <= iso(new Date()).slice(0, 7) ? rec.date.slice(0, 7) : period; renderAll(); go(prev ? 'shifts' : 'dashboard'); }
  function prefillFromLink() { var q = new URLSearchParams(location.search); if (!q.has('log') && !q.has('in')) return false;
    var d = q.get('log'), sh = q.get('shift'), rl = roleByName(q.get('role')), ci = normTime(q.get('in')), co = normTime(q.get('out'));
    resetForm(); fillForm({ date: /^\d{4}-\d{2}-\d{2}$/.test(d || '') ? d : iso(new Date()), shift: !(ci && co) && SHIFTS.indexOf(sh) >= 0 ? sh : null, role: rl ? rl.name : null, clockIn: ci && co ? ci : null, clockOut: ci && co ? co : null, hours: ci && co ? spanHours(ci, co) : null });
    return true; }

  /* ---------- settings ---------- */
  var rolesRendering = false;
  function renderRoleSettings() { rolesRendering = true;
    $('#roleList').innerHTML = roles.map(function (r) { return '<div class="role-row" data-id="' + esc(r.id) + '"><input type="text" class="rName" maxlength="40" value="' + esc(r.name) + '" aria-label="Role name"><span>$</span><input type="text" inputmode="decimal" class="rWage" value="' + r.wage.toFixed(2) + '" aria-label="' + esc(r.name) + ' hourly wage"><button type="button" class="ibtn rDel" aria-label="Delete ' + esc(r.name) + '"' + (roles.length < 2 ? ' disabled' : '') + '>✕</button></div>'; }).join('');
    rolesRendering = false; }
  function rolesChanged(msg) { saveRoles(); renderRoleSettings(); renderAll(); if (msg) toast(msg); }
  function applyIcon(v) { v = v === 'dark' ? 'dark' : 'green'; var s = v === 'dark' ? '-dark' : ''; $('#hdrLogo').src = 'icon-192' + s + '.png'; $('#atiLink').href = 'apple-touch-icon' + s + '.png'; $('#favLink').href = 'favicon-32' + s + '.png'; $$('#iconPick button').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-icon') === v ? 'true' : 'false'); }); }
  function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); $('#darkToggle').checked = t === 'dark'; $('#themeBtn').setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'); var m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', t === 'dark' ? '#0F1115' : '#F3F4F6'); }

  /* ---------- navigation ---------- */
  var TAB = { dashboard: 'dashboard', shifts: 'shifts', insights: 'insights', stats: 'insights', profile: 'profile', log: 'shifts', settings: 'profile', tips: 'insights', reports: 'insights' }, ALIAS = { settings: 'profile', tips: 'insights', reports: 'insights', stats: 'insights' }, SUB = { dashboard: 'Performance Overview', shifts: 'Your shifts', log: 'Log a shift', insights: 'Tips & reports', profile: 'Settings & data' }, screen = 'dashboard';
  function go(name, sub) { name = ALIAS[name] || name; if (!document.getElementById('s-' + name)) name = 'dashboard'; screen = name; $('#hdrSub').textContent = SUB[name] || '';
    $$('.screen').forEach(function (s) { s.hidden = s.id !== 's-' + name; }); if ($('#iMain') && !$('#iMain').hasAttribute('data-eh')) { $('#iMain').hidden = false; $('#iMore').hidden = true; } if ($('#iSheet')) $('#iSheet').hidden = true; if ($('#pfMain')) { pfSub(false); $$('.pf-sheet').forEach(function (x) { x.hidden = true; }); }
    $$('#tabbar button').forEach(function (b) { var on = b.getAttribute('data-tab') === TAB[name]; b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
    if (sub) setSeg('shiftsSeg', sub); if (history.replaceState) history.replaceState(null, '', location.pathname + '#' + name); window.scrollTo(0, 0); }
  function setSeg(id, v) { $$('#' + id + ' button').forEach(function (b) { b.classList.toggle('on', b.getAttribute('data-v') === v); });
    if (id === 'shiftsSeg') { $('#vList').hidden = v !== 'list'; $('#vCal').hidden = v !== 'cal'; }
 }
  /* ---------- backup / restore (on-device only) ---------- */
  function backupData() { var d = {}; for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k.indexOf('serverlife.') === 0) { var v = localStorage.getItem(k); try { d[k] = JSON.parse(v); } catch (e) { d[k] = v; } } }
    return { app: 'Side Work', format: 1, exportedAt: new Date().toISOString(), data: d }; }
  function doBackup() { localStorage.setItem(K.backup, new Date().toISOString()); renderMilestones(); var txt = JSON.stringify(backupData(), null, 1), name = 'sidework-backup-' + iso(new Date()) + '.json';
    try { var f = new File([txt], name, { type: 'application/json' }); if (navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f], title: 'Side Work backup' }).catch(function () {}); return; } } catch (e) {}
    download(name, txt, 'application/json'); toast('Backup saved · ' + shifts.length + ' shift' + (shifts.length === 1 ? '' : 's')); }
  function restoreFrom(obj) { var d = obj && obj.data && typeof obj.data === 'object' ? obj.data : obj, inc = Array.isArray(d) ? d : d && (d[K.shifts] || d.shifts);
    if (!Array.isArray(inc)) return { error: 'That file has no Side Work shifts.' };
    var ids = {}, keys = {}, added = 0, skipped = 0; shifts.forEach(function (s) { ids[s.id] = 1; keys[s.date + '|' + (s.clockIn || '')] = 1; });
    if (d && !Array.isArray(d)) { var rl = d[K.roles]; if (Array.isArray(rl)) rl.forEach(function (r) { if (r && r.name && okWage(+r.wage) && !roleByName(r.name)) roles.push({ id: String(r.id || uid('r')), name: String(r.name).slice(0, 40), wage: r2(+r.wage) }); }); saveRoles();
      var sc = d[K.sched]; if (Array.isArray(sc)) { sc.forEach(function (x) { if (validSched(x) && !sched.some(function (y) { return y.id === x.id; })) sched.push(x); }); saveSched(); }
      [K.goals, K.theme, K.icon].forEach(function (k) { if (d[k] != null && localStorage.getItem(k) == null) localStorage.setItem(k, typeof d[k] === 'string' ? d[k] : JSON.stringify(d[k])); }); }
    inc.forEach(function (s) { var m = migrate(s); if (!m) { skipped++; return; } var k = m.date + '|' + (m.clockIn || ''); if (ids[m.id] || keys[k]) { skipped++; return; } ids[m.id] = keys[k] = 1; shifts.push(m); added++; });
    save(); return { added: added, skipped: skipped }; }
  function onRestoreFile(e) { var f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; var rd = new FileReader();
    rd.onload = function () { var obj; try { obj = JSON.parse(rd.result); } catch (x) { toast('Could not read that file'); return; } var r = restoreFrom(obj);
      if (r.error) { toast(r.error); return; } renderRoleSettings(); renderAll(); toast('Restored ' + r.added + ' shift' + (r.added === 1 ? '' : 's') + (r.skipped ? ' · ' + r.skipped + ' already here' : '')); };
    rd.readAsText(f); }
  /* ---------- streaks & milestones (computed from logged shifts only) ---------- */
  var MS = [
    { id: 'first', ic: '⭐', name: 'First shift', kind: 'count', n: 1 },
    { id: 'n50', ic: '💵', name: 'First $50 night', kind: 'night', n: 50 },
    { id: 'n100', ic: '💸', name: 'First $100 night', kind: 'night', n: 100 },
    { id: 'n150', ic: '🤑', name: 'First $150 night', kind: 'night', n: 150 },
    { id: 'm500', ic: '📅', name: '$500 month', kind: 'month', n: 500 },
    { id: 'm1000', ic: '🗓️', name: '$1,000 month', kind: 'month', n: 1000 },
    { id: 'c10', ic: '🔟', name: '10 shifts logged', kind: 'count', n: 10 },
    { id: 'c25', ic: '🎯', name: '25 shifts', kind: 'count', n: 25 },
    { id: 'c50', ic: '🏅', name: '50 shifts', kind: 'count', n: 50 },
    { id: 'c100', ic: '💯', name: '100 shifts', kind: 'count', n: 100 },
    { id: 'bk', ic: '🛡️', name: 'Backed up this month', kind: 'backup' }];
  function shortD(d) { var x = new Date(d + 'T12:00:00'); return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  function milestones(list, backupTs, today) {
    today = today || new Date(); var L = list.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.createdAt || '') < String(b.createdAt || '') ? -1 : 1; });
    var earned = {}, mon = {}, bestNight = 0, bestNightDates = [], bestRate = 0, weeks = {};
    L.forEach(function (s, i) { var t = tipsOf(s) || 0, ym = s.date.slice(0, 7); weeks[iso(monday(new Date(s.date + 'T12:00:00')))] = 1; mon[ym] = r2((mon[ym] || 0) + t);
      if (t > bestNight) { bestNight = t; bestNightDates = [s.date]; } else if (t > 0 && t === bestNight) bestNightDates.push(s.date);
      if (t > 0 && s.hours > 0 && t / s.hours > bestRate) bestRate = r2(t / s.hours);
      MS.forEach(function (m) { if (earned[m.id]) return; if ((m.kind === 'count' && i + 1 >= m.n) || (m.kind === 'night' && t >= m.n) || (m.kind === 'month' && mon[ym] >= m.n)) earned[m.id] = s.date; }); });
    var thisYm = iso(today).slice(0, 7); if (backupTs && iso(new Date(backupTs)).slice(0, 7) === thisYm) earned.bk = iso(new Date(backupTs));
    var monthBest = 0; Object.keys(mon).forEach(function (k) { if (mon[k] > monthBest) monthBest = mon[k]; });
    var wk = Object.keys(weeks).sort(), best = 0, run = 0, prev = null;
    wk.forEach(function (w) { var d = new Date(w + 'T12:00:00'); if (prev) { var p = new Date(prev + 'T12:00:00'); p.setDate(p.getDate() + 7); run = iso(p) === w ? run + 1 : 1; } else run = 1; if (run > best) best = run; prev = w; });
    var cur = 0, c = monday(today); if (!weeks[iso(c)]) c.setDate(c.getDate() - 7); while (weeks[iso(c)]) { cur++; c.setDate(c.getDate() - 7); }
    var items = MS.map(function (m) { var have = m.kind === 'count' ? L.length : m.kind === 'night' ? bestNight : m.kind === 'month' ? (mon[thisYm] || 0) : 0;
      var prog = m.kind === 'count' ? L.length + ' / ' + m.n : m.kind === 'night' ? money0(bestNight) + ' best' : m.kind === 'month' ? 'This month ' + money0(mon[thisYm] || 0) : 'Tap Backup';
      return { id: m.id, ic: m.ic, name: m.name, kind: m.kind, n: m.n, earned: earned[m.id] || null, have: have, frac: m.n ? Math.min(1, have / m.n) : 0, prog: prog }; });
    var locked = items.filter(function (x) { return !x.earned && x.kind !== 'backup'; }), next = null;
    locked.forEach(function (x) { if (!next || x.frac > next.frac) next = x; });
    return { items: items, earned: earned, bestNight: bestNight, bestNightDates: bestNightDates, bestRate: bestRate, cur: cur, best: best, count: L.length, next: next }; }
  function lastBackup() { var v = uget(K.backup); return v && !isNaN(Date.parse(v)) ? v : null; }
  var msOpen = false;
  function renderMilestones() { var w = $('#msWrap'); if (!w) return; var m = milestones(shifts, lastBackup());
    if (!m.count) { w.innerHTML = '<div class="card ms-empty muted s">Log your first shift to start earning milestones.</div>'; return; }
    var h = '';
    if (m.cur > 0) h += '<div class="card ms-streak"><span class="ms-fl" aria-hidden="true">🔥</span><div><b>' + m.cur + ' week' + (m.cur === 1 ? '' : 's') + ' in a row</b><small>Weeks with at least one shift.' + (m.best > m.cur ? ' Best: ' + m.best + ' weeks.' : '') + '</small></div></div>';
    else if (m.best > 0) h += '<div class="card ms-streak"><span class="ms-fl" aria-hidden="true">🔥</span><div><b>Best streak: ' + m.best + ' week' + (m.best === 1 ? '' : 's') + '</b><small>Weeks in a row with at least one shift.</small></div></div>';
    if (m.next) { var nx = m.next, lab = nx.kind === 'count' ? nx.have + ' / ' + nx.n : money0(nx.have) + ' / ' + money0(nx.n), sub = nx.kind === 'night' ? 'Best night ' + money0(m.bestNight) + (m.bestNightDates.length ? ' (' + m.bestNightDates.map(shortD).join(' & ') + ')' : '') + ' · ' + money0(nx.n - nx.have) + ' to go' : nx.kind === 'month' ? money0(nx.n - nx.have) + ' to go this month' : (nx.n - nx.have) + ' more shift' + (nx.n - nx.have === 1 ? '' : 's');
      h += '<div class="card ms-next" id="msNext"><div class="ms-top"><span><b>Next up:</b> ' + esc(nx.name) + '</span><b class="money">' + lab + '</b></div><div class="ms-bar"><i style="width:' + Math.round(nx.frac * 100) + '%"></i></div><small class="muted">' + sub + '</small></div>'; }
    var E = m.items.filter(function (x) { return x.earned; }), Lk = m.items.filter(function (x) { return !x.earned; });
    function bd(x) { return '<div class="ms-bd' + (x.earned ? '' : ' lk') + '" data-ms="' + x.id + '"><div class="ms-c" aria-hidden="true">' + (x.earned ? x.ic : '🔒') + '</div><span>' + esc(x.name) + '</span><em>' + (x.earned ? shortD(x.earned) : esc(x.prog)) + '</em></div>'; }
    h += '<div class="card"><p class="ms-h">Earned · ' + E.length + '</p><div class="ms-grid" id="msEarned">' + E.map(bd).join('') + '</div>' + (Lk.length ? '<button type="button" class="btn sm wide ms-more" id="msMore" aria-expanded="' + msOpen + '">' + (msOpen ? 'Hide locked badges' : 'Show ' + Lk.length + ' locked badge' + (Lk.length === 1 ? '' : 's') + ' ›') + '</button><div id="msLockedBox"' + (msOpen ? '' : ' hidden') + '><p class="ms-h">Locked · ' + Lk.length + '</p><div class="ms-grid" id="msLocked">' + Lk.map(bd).join('') + '</div></div>' : '') + '</div>';
    w.innerHTML = h; }
  function celebrate(before, after, rec) { var t = tipsOf(rec) || 0, title = null, sub = '', ic = '🏆', newIds = MS.filter(function (m) { return after.earned[m.id] && !before.earned[m.id]; });
    if (before.count > 0 && after.bestNight > before.bestNight && t === after.bestNight) { title = 'New best night! <b>' + money0(t) + '</b>'; sub = 'Your top tip night so far · ' + nice(rec.date) + '.'; }
    else if (newIds.length) { ic = newIds[0].ic; title = esc(newIds[0].name) + '!'; sub = 'Milestone unlocked · ' + nice(rec.date) + '.'; }
    else if (before.bestRate > 0 && after.bestRate > before.bestRate && t > 0 && r2(t / rec.hours) === after.bestRate) { ic = '⚡'; title = 'New best tips rate! <b>' + money(after.bestRate) + '/hr</b>'; sub = nice(rec.date) + '.'; }
    if (!title) return false;
    if (title.indexOf('best') >= 0 && newIds.length) sub += ' Also unlocked: ' + newIds.map(function (m) { return esc(m.name); }).join(', ') + '.';
    $('#celIc').textContent = ic; $('#celT').innerHTML = title; $('#celSub').textContent = sub.replace(/<[^>]*>/g, '');
    $('#celChips').innerHTML = '<span>' + rec.hours + ' h</span>' + (t > 0 ? '<span>' + money(t / rec.hours) + '/hr in tips</span>' : '') + '<span>' + esc(rec.shift.charAt(0).toUpperCase() + rec.shift.slice(1)) + '</span>';
    var cf = $('#celConf'); cf.innerHTML = ''; if (!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) { var c = ['#34D399', '#10B981', '#2DD4BF', '#FBBF24', '#F3F4F6'], s = ''; for (var i = 0; i < 28; i++) s += '<i style="left:' + ((i * 37) % 96 + 2) + '%;background:' + c[i % 5] + ';animation-delay:' + ((i * 53) % 600) + 'ms;--r:' + ((i * 47) % 360) + 'deg"></i>'; cf.innerHTML = s; }
    $('#cel').hidden = false; $('#celDone').focus(); return true; }
  var toastT; function toast(m) { var t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2600); }
  function renderProfile() { if (!$('#pfStats')) return; var a = agg(shifts), m = milestones(shifts, lastBackup()), g = getJSON(K.goals) || {};
    $('#pfStats').innerHTML = '<div class="pf-st"><b>' + a.n + '</b><small>shift' + (a.n === 1 ? '' : 's') + ' logged</small></div><div class="pf-st g"><b>' + (a.rate == null ? '—' : '$' + a.rate.toFixed(2)) + '</b><small>avg per hour</small></div><div class="pf-st"><b>' + m.cur + '</b><small>week streak</small></div>';
    $('#pfWageV').textContent = roles.length ? '$' + roles[0].wage.toFixed(2) + '/hr' : '';
    $('#pfGoalV').textContent = g.month ? money0(g.month) + '/mo' : g.week ? money0(g.week) + '/wk' : 'Not set'; }
  function pfSub(more) { $('#pfMain').hidden = !!more; $('#pfMore').hidden = !more; window.scrollTo(0, 0); }
  var pfLast = null;
  function pfSheet(id, open) { var el = $('#' + id); el.hidden = !open; if (open) { pfLast = document.activeElement; var f = el.querySelector('[data-close]'); if (f) f.focus(); } else if (pfLast && pfLast.focus) pfLast.focus(); }
  function renderAll() { renderMonthPick(); renderBanner(); renderDashboard(); renderHistory(); renderCalendar(); renderTips(); renderReports(); renderInsightsEmpty(); renderMilestones(); renderProfile(); }

  function bind() {
    $('#tabbar').addEventListener('click', function (e) { var b = e.target.closest('[data-tab]'); if (b) go(b.getAttribute('data-tab')); });
    document.addEventListener('click', function (e) { var g = e.target.closest('[data-go]'); if (!g) return; var n = g.getAttribute('data-go'); if (n === 'log' && !editing) resetForm(); go(n); });
    $('#hdrCal').addEventListener('click', function () { go('shifts', 'cal'); });
    $('#themeBtn').addEventListener('click', function () { var t = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'; localStorage.setItem(K.theme, t); applyTheme(t); });
    $('#dChart').addEventListener('pointerdown', chartPoint); $('#dChart').addEventListener('pointermove', chartPoint);
    $('#dBody').addEventListener('click', function (e) { if (e.target.id !== 'copySum') return; var t = weekSummary(); if (!t) return; copyText(t).then(function (ok) { toast(ok ? 'Summary copied' : 'Couldn\'t copy. Try again.'); }); });
    
    $('#shiftsSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b) setSeg('shiftsSeg', b.getAttribute('data-v')); });
    $('#repSeg').addEventListener('click', function (e) { var b = e.target.closest('[data-v]'); if (b) { iMode = b.getAttribute('data-v'); setSeg('repSeg', iMode); renderTips(); } });
    $('#iBars').addEventListener('click', function (e) { var b = e.target.closest('.in-bar'); if (b && !b.disabled) openRange(b.getAttribute('data-a'), b.getAttribute('data-b'), b.getAttribute('data-t')); });
    $('#iGridBtn').addEventListener('click', function () { iSub(true, 'iGridH'); }); $('#iBestBtn').addEventListener('click', function () { iSub(true, 'iBestH'); }); $('#iBack').addEventListener('click', function () { iSub(false); });
    $('#logBack').addEventListener('click', function () { var was = editing; resetForm(); go(was ? 'shifts' : 'dashboard'); });
    $('#cancelEdit').addEventListener('click', function () { resetForm(); go('shifts'); });
    ['#fIn', '#fOut'].forEach(function (s) { ['input', 'change'].forEach(function (ev) { $(s).addEventListener(ev, function () { guessShift(); var sp = spanHours(normTime($('#fIn').value), normTime($('#fOut').value)); if (sp != null) $('#fHours').value = sp; hoursHint(); updateTake(); }); }); });
    $('#fHours').addEventListener('input', hoursHint); $('#form').addEventListener('input', function () { updateTake(); moreSummary(); }); $('#form').addEventListener('change', updateTake);
    $('#form').addEventListener('submit', function (e) { e.preventDefault(); var f = readForm(), err = validate(f); $('#formErr').textContent = err; if (/Hours|date/.test(err)) $('#more').open = true; if (!err) commit(f); });
    $('#hList').addEventListener('click', onShiftAction); $('#hList').addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.shift[data-act]')) { e.preventDefault(); onShiftAction(e); } });
    $('#roleFilter').addEventListener('click', function (e) { var b = e.target.closest('[data-rf]'); if (b) { roleFilter = b.getAttribute('data-rf'); renderHistory(); } });
    $('#calPrev').addEventListener('click', function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() - 1, 1); calSel = null; renderCalendar(); });
    $('#calNext').addEventListener('click', function () { calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth() + 1, 1); calSel = null; renderCalendar(); });
    $('#calGrid').addEventListener('click', function (e) { var c = e.target.closest('[data-date]'); if (!c) return; var d = c.getAttribute('data-date'); calSel = calSel === d ? null : d; renderCalendar(); });
    $('#calDay').addEventListener('click', function (e) { if (e.target.id === 'dayLog') { resetForm(); $('#fDate').value = calSel; moreSummary(); go('log'); return; }
      var b = e.target.closest('[data-sact]'); if (b) { var x = sched.find(function (y) { return y.id === b.closest('[data-sid]').getAttribute('data-sid'); }); if (!x) return; var a = b.getAttribute('data-sact');
        if (a === 'edit') openSchedForm(x); else if (a === 'log') openFromSched(x); else delSched(x); return; } onShiftAction(e); });
    $('#calAdd').addEventListener('click', function () { openSchedForm(null); setTimeout(function () { $('#sStart').focus(); }, 50); });
    $('#schedForm').addEventListener('submit', function (e) { e.preventDefault(); submitSched(); }); $('#schedForm').addEventListener('input', schedHint);
    $('#sCancel').addEventListener('click', closeSchedForm); $('#sDel').addEventListener('click', function () { var x = sched.find(function (y) { return y.id === schedEditing; }); if (x) delSched(x); });
    $('#icsBtn').addEventListener('click', downloadICS);
    $('#bannerText').addEventListener('click', function () { var x = sched.find(function (y) { return y.id === $('#logBanner').getAttribute('data-sid'); }); if (x) openFromSched(x); });
    $('#bannerX').addEventListener('click', function () { var x = sched.find(function (y) { return y.id === $('#logBanner').getAttribute('data-sid'); }); if (x) { x.dismissed = true; saveSched(); } renderBanner(); });
    ['#gWeek', '#gMonth'].forEach(function (s) { $(s).addEventListener('change', function () { var v = num(this.value), g = getJSON(K.goals) || {}; if (v != null && (isNaN(v) || v < 0)) { toast('Goal should be a number'); this.value = ''; return; }
      g[s === '#gWeek' ? 'week' : 'month'] = v ? r2(v) : null; setJSON(K.goals, g); renderReports(); renderProfile(); }); });
    $('#pfMoreBtn').addEventListener('click', function () { pfSub(true); }); $('#pfBack').addEventListener('click', function () { pfSub(false); });
    $('#pfRolesBtn').addEventListener('click', function () { pfSheet('pfRoleSheet', true); }); $('#pfGoalsBtn').addEventListener('click', function () { pfSheet('pfGoalSheet', true); });
    $$('.pf-sheet').forEach(function (sh) { sh.addEventListener('click', function (e) { if (e.target === sh || e.target.closest('[data-close]')) { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); pfSheet(sh.id, false); } }); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') $$('.pf-sheet').forEach(function (sh) { if (!sh.hidden) pfSheet(sh.id, false); }); });
    $('#csvBtn').addEventListener('click', exportCSV); $('#repCsv').addEventListener('click', exportCSV);
    $('#msWrap').addEventListener('click', function (e) { if (e.target.closest('#msMore')) { msOpen = !msOpen; renderMilestones(); } });
    $('#delShift').addEventListener('click', deleteEditing);
    $('#celDone').addEventListener('click', function () { $('#cel').hidden = true; $('#celConf').innerHTML = ''; }); $('#cel').addEventListener('click', function (e) { if (e.target === this) $('#celDone').click(); });
    $('#backupBtn').addEventListener('click', doBackup); $('#restoreBtn').addEventListener('click', function () { $('#restoreFile').click(); }); $('#restoreFile').addEventListener('change', onRestoreFile);
    $('#iconPick').addEventListener('click', function (e) { var b = e.target.closest('[data-icon]'); if (!b) return; var v = b.getAttribute('data-icon'); localStorage.setItem(K.icon, v); applyIcon(v); toast(v === 'dark' ? 'Dark icon on' : 'Green icon on'); });
    $('#darkToggle').addEventListener('change', function () { var t = this.checked ? 'dark' : 'light'; localStorage.setItem(K.theme, t); applyTheme(t); });
    $('#roleList').addEventListener('change', function (e) { if (rolesRendering) return; var row = e.target.closest('.role-row'); if (!row) return; var r = roles.find(function (x) { return x.id === row.getAttribute('data-id'); }); if (!r) return;
      if (e.target.classList.contains('rName')) { var n = e.target.value.trim().slice(0, 40), dup = roleByName(n); if (!n || (dup && dup !== r)) { e.target.value = r.name; toast(n ? 'You already have ' + n : 'Role needs a name'); return; } r.name = n; rolesChanged('Renamed to ' + n + ' (past shifts keep their saved name)'); }
      else { var v = num(e.target.value); if (v == null || isNaN(v) || v < 0 || v > 200) { e.target.value = r.wage.toFixed(2); toast('Wage should be between $0 and $200'); return; } r.wage = r2(v); rolesChanged(r.name + ' set to $' + r.wage.toFixed(2) + '/hr for new shifts'); } });
    $('#roleList').addEventListener('click', function (e) { var b = e.target.closest('.rDel'); if (!b || roles.length < 2) return; var id = b.closest('.role-row').getAttribute('data-id'), r = roles.find(function (x) { return x.id === id; });
      if (r && confirm('Delete role ' + r.name + '? Past shifts keep their saved role and wage.')) { roles = roles.filter(function (x) { return x.id !== id; }); rolesChanged('Deleted ' + r.name); } });
    $('#addRole').addEventListener('click', function () { var n = $('#newRoleName').value.trim().slice(0, 40), v = num($('#newRoleWage').value);
      if (!n) { toast('Give the role a name'); return; } if (roleByName(n)) { toast('You already have ' + n); return; } if (v == null || isNaN(v) || v < 0 || v > 200) { toast('Wage should be between $0 and $200'); return; }
      roles.push({ id: uid('r'), name: n, wage: r2(v) }); $('#newRoleName').value = ''; $('#newRoleWage').value = ''; rolesChanged('Added ' + n + ' $' + r2(v).toFixed(2) + '/hr'); });
    window.addEventListener('storage', function (e) { if (!unlocked) return; if (e.key === K.sched) { sched = loadSched(); renderAll(); } if (e.key === K.shifts) { shifts = loadShifts(); renderAll(); } });
  }
  function init() { document.body.classList.toggle('locked', !unlocked); applyIcon(localStorage.getItem(K.icon)); applyTheme(localStorage.getItem(K.theme) === 'light' ? 'light' : 'dark'); bind(); resetForm(); renderRoleSettings(); renderAll();
    window.addEventListener('hashchange', function () { var k = (location.hash || '').slice(1); if (TAB[k] && (ALIAS[k] || k) !== screen) go(k); });
    var h = (location.hash || '').slice(1); if (prefillFromLink()) { renderAll(); go('log'); } else go(TAB[h] ? h : 'dashboard');
    if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(function () {}); }
  window.__ttTest = { weekSummary: weekSummary, deriveShift: deriveShift, buildICS: function () { return buildICS(upcoming()); }, toCSV: toCSV, sched: function () { return sched; }, roles: function () { return roles; }, shifts: function () { return shifts; }, milestones: function (d) { return milestones(shifts, lastBackup(), d ? new Date(d + 'T12:00:00') : undefined); } };
  /* Optional cloud sync bridge (sync.js). Never writes unless sync.js is configured and signed in. */
  window.SideWork = { key: K.shifts, normalize: migrate, get: function () { return shifts.slice(); },
    set: function (list) { shifts = list.map(migrate).filter(Boolean); setJSON(K.shifts, shifts); renderAll(); }, toast: function (m) { toast(m); }, userKeys: USERK.slice(), owner: OWNER,
    unlocked: function () { return unlocked; },
    unlock: function () { if (unlocked) return; unlocked = true; document.body.classList.remove('locked'); reload(); go('dashboard'); },
    lock: function () { unlocked = false; document.body.classList.add('locked'); reload(); } };
  function reload() { roles = loadRoles(); shifts = loadShifts(); sched = loadSched(); resetForm(); renderRoleSettings(); renderAll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
