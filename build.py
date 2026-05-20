import csv, json, re, urllib.parse

# ── Parse CSV ─────────────────────────────────────────────────────────────────
rows = []
with open('fliesenleger_kob_bonn_wiesb - leads-details.csv', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        if len(row) < 3: continue
        firma = row[2].strip()
        if not firma: continue
        def g(i): return row[i].strip() if len(row) > i else ''
        def conv(s):
            m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', s)
            if m: return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
            return ''
        t1 = g(8); t1l = t1.lower()
        status = 'neu'
        if 'termin' in t1l:                                    status = 'termin'
        elif 'warm' in t1l or 'interessiert' in t1l:           status = 'interessiert'
        elif 'urlaub' in t1l or 'call back' in t1l or 'follow up' in t1l: status = 'followup'
        elif 'gatekeeper' in t1l:                              status = 'gatekeeper'
        elif 'no show' in t1l:                                 status = 'nicht_erreicht'
        elif t1.strip():                                       status = 'in_bearbeitung'
        roi = 1
        m = re.search(r'\d', g(7))
        if m: roi = int(m.group())
        followup = conv(g(12)) or conv(g(15))
        besonderheit = g(23) if g(23) not in ('NA', '') else ''
        notiz_parts = []
        if t1: notiz_parts.append(f"T1: {t1}")
        if g(10): notiz_parts.append(f"Einwand: {g(10)}")
        if besonderheit: notiz_parts.append(besonderheit)
        rows.append({
            'id': g(0) or str(len(rows)+1), 'created': 1747000000000,
            'firma': firma, 'kontakt': g(3), 'title': g(28),
            'telefon': g(4), 'email': g(5) if g(5) not in ('NA','') else '',
            'website': g(6), 'roi': roi, 'status': status, 'followup': followup,
            't1_status': t1, 't1_datum': conv(g(9)), 't1_einwand': g(10),
            'reviews': g(18), 'webseite_alter': g(19),
            'webseite_vorhanden': g(20), 'hat_kalkulator': g(21) == 'TRUE',
            'hauptleistung': g(22), 'besonderheit': besonderheit,
            'facebook': g(27) if g(27) not in ('NA','') else '',
            'notiz': ' | '.join(notiz_parts), 'gewerk': 'Fliesenleger',
        })

DATA = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))

# ── SVG favicon ───────────────────────────────────────────────────────────────
with open('rais-pictogram-orange.svg', encoding='utf-8') as f:
    svg_raw = f.read().strip()
svg_raw = re.sub(r'<filter[^>]*>.*?</filter>', '', svg_raw, flags=re.DOTALL)
svg_raw = re.sub(r'filter="url\([^)]+\)"', '', svg_raw)
svg_inner = re.sub(r'<svg[^>]*>', '', svg_raw).replace('</svg>', '').strip()
favicon_svg = f'<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">{svg_inner}</svg>'
favicon = 'data:image/svg+xml,' + urllib.parse.quote(favicon_svg)

# ── CSS ───────────────────────────────────────────────────────────────────────
CSS = """
:root {
  --or: #EC6A37; --orh: #F37A48;
  --bg: #F5F2EC; --sf: #FBF8F3;
  --sg: #789464; --pn: #3C5A2A;
  --ch: #2F2A24; --st: #7B746B; --bd: #D9D1C7;
  --rd: #C0392B; --yw: #A06800; --bl: #2C5F8A;
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: Georgia, 'Times New Roman', serif; background: var(--bg); color: var(--ch); min-height: 100vh; font-size: 15px; line-height: 1.5; }

/* Header */
header { background: var(--ch); padding: 0 28px; display: flex; align-items: center; justify-content: space-between; height: 54px; border-bottom: 3px solid var(--or); position: sticky; top: 0; z-index: 100; }
.logo { display: flex; align-items: center; gap: 10px; text-decoration: none; }
.logo svg { width: 28px; height: 28px; }
.logo-text { font-size: 17px; font-weight: bold; color: #fff; letter-spacing: .3px; }
.logo-text em { color: var(--or); font-style: normal; }
.hact { display: flex; gap: 8px; align-items: center; }

/* Buttons */
.btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px; border-radius: 5px; font-size: 13px; font-family: sans-serif; font-weight: 600; cursor: pointer; border: none; transition: background .15s, color .15s, border-color .15s; white-space: nowrap; }
.bp { background: var(--or); color: #fff; }
.bp:hover { background: var(--orh); }
.bs { background: var(--sf); color: var(--ch); border: 1px solid var(--bd); }
.bs:hover { border-color: var(--or); color: var(--or); }
.bg { background: transparent; color: var(--st); border: none; padding: 4px 8px; }
.bg:hover { color: var(--or); }
.bsm { padding: 4px 10px; font-size: 12px; }

main { padding: 22px 28px; max-width: 1480px; width: 100%; margin: 0 auto; }

/* Banner */
.banner { background: #FEF3EE; border: 1px solid #F5CCBB; border-radius: 6px; padding: 11px 16px; margin-bottom: 16px; display: none; align-items: center; gap: 10px; font-family: sans-serif; font-size: 13px; }
.banner.on { display: flex; }
.banner strong { color: var(--or); }

/* Stats */
.stats { display: grid; grid-template-columns: repeat(8, 1fr); gap: 10px; margin-bottom: 18px; }
.stat { background: var(--sf); border: 1px solid var(--bd); border-radius: 6px; padding: 12px 14px; cursor: pointer; transition: border-color .15s, background .15s; }
.stat:hover { border-color: var(--or); }
.stat.on { border-color: var(--or); background: #FEF3EE; }
.stat.on .sn { color: var(--or); }
.sn { font-size: 22px; font-weight: bold; display: block; line-height: 1; margin-bottom: 3px; color: var(--ch); }
.sl { font-size: 10px; color: var(--st); text-transform: uppercase; letter-spacing: .5px; font-family: sans-serif; }

/* Toolbar */
.tb { display: flex; gap: 8px; margin-bottom: 14px; align-items: center; flex-wrap: wrap; }
.srch { flex: 1; min-width: 180px; padding: 8px 13px; border: 1px solid var(--bd); border-radius: 5px; background: var(--sf); font-size: 14px; color: var(--ch); font-family: sans-serif; outline: none; }
.srch:focus { border-color: var(--or); }
select.fs { padding: 8px 11px; border: 1px solid var(--bd); border-radius: 5px; background: var(--sf); font-size: 13px; color: var(--ch); font-family: sans-serif; cursor: pointer; outline: none; }
select.fs:focus { border-color: var(--or); }

/* Table */
.tw { background: var(--sf); border: 1px solid var(--bd); border-radius: 6px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,.05); }
table { width: 100%; border-collapse: collapse; font-family: sans-serif; font-size: 13px; }
thead { background: var(--ch); }
thead th { color: #fff; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 600; letter-spacing: .5px; text-transform: uppercase; white-space: nowrap; }
tbody tr { border-bottom: 1px solid var(--bd); cursor: pointer; transition: background .12s; }
tbody tr:last-child { border-bottom: none; }
tbody tr:hover { background: #F0EDE8; }
tbody tr.ov { background: #FDF5F4; }
td { padding: 9px 12px; vertical-align: middle; }
.fc { font-weight: 600; color: var(--ch); }
.nc { max-width: 190px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--st); font-size: 12px; }

/* Badges */
.badge { display: inline-block; padding: 2px 8px; border-radius: 3px; font-size: 11px; font-weight: 700; letter-spacing: .3px; font-family: sans-serif; text-transform: uppercase; }
.b-neu   { background: #EDF4FA; color: #2C5F8A; }
.b-ni    { background: #FDF0EF; color: var(--rd); }
.b-fu    { background: #FEF3EE; color: var(--or); }
.b-in    { background: #EEF3EA; color: var(--pn); }
.b-te    { background: #EEF3EA; color: var(--pn); border: 1px solid var(--sg); }
.b-gk    { background: #FEF8EC; color: var(--yw); }
.b-ib    { background: #F0EBF8; color: #6B46A8; }
.b-ki    { background: #F0EDE8; color: var(--st); }

/* ROI */
.roi { display: inline-flex; width: 22px; height: 22px; border-radius: 50%; font-size: 11px; font-weight: 700; align-items: center; justify-content: center; font-family: sans-serif; }
.r1 { background: #EDF4FA; color: #2C5F8A; }
.r2 { background: #FEF8EC; color: var(--yw); }
.r3 { background: #EEF3EA; color: var(--pn); }

/* Follow-up date */
.fd { font-size: 12px; font-family: sans-serif; }
.fdov { color: var(--rd); font-weight: 600; }
.fdtd { color: var(--or); font-weight: 600; }
.fdup { color: var(--st); }

/* Row actions */
.ra { display: flex; gap: 3px; opacity: 0; transition: opacity .1s; }
tr:hover .ra { opacity: 1; }

/* Empty */
.empty { text-align: center; padding: 50px 20px; color: var(--st); font-family: sans-serif; }
.empty h3 { font-size: 16px; color: var(--ch); margin-bottom: 6px; font-family: Georgia, serif; }

/* Table footer */
.tf { display: flex; align-items: center; justify-content: space-between; padding: 10px 13px; border-top: 1px solid var(--bd); font-family: sans-serif; font-size: 12px; color: var(--st); background: var(--bg); }
.pb { display: flex; gap: 4px; }
.pbb { padding: 3px 9px; border: 1px solid var(--bd); border-radius: 4px; background: var(--sf); font-size: 12px; cursor: pointer; font-family: sans-serif; color: var(--ch); }
.pbb:hover { border-color: var(--or); }
.pbb.on { background: var(--or); color: #fff; border-color: var(--or); }

/* Side panel */
.po { position: fixed; inset: 0; z-index: 300; display: none; }
.po.on { display: block; }
.pbg { position: absolute; inset: 0; background: rgba(0,0,0,.35); }
.panel { position: absolute; right: 0; top: 0; bottom: 0; width: 440px; background: var(--sf); border-left: 1px solid var(--bd); box-shadow: -4px 0 24px rgba(0,0,0,.12); overflow-y: auto; display: flex; flex-direction: column; }
.ph { padding: 16px 20px; border-bottom: 1px solid var(--bd); display: flex; align-items: flex-start; justify-content: space-between; background: var(--ch); color: #fff; }
.ph-firma { font-size: 16px; font-weight: bold; line-height: 1.3; }
.ph-sub { font-size: 12px; color: #B0A898; margin-top: 3px; font-family: sans-serif; }
.pb2 { padding: 16px 20px; flex: 1; }
.pf { padding: 12px 20px; border-top: 1px solid var(--bd); display: flex; gap: 7px; flex-wrap: wrap; background: var(--bg); }
.ir { display: flex; gap: 8px; margin-bottom: 9px; align-items: flex-start; font-family: sans-serif; font-size: 13px; }
.il { color: var(--st); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .4px; min-width: 86px; padding-top: 1px; flex-shrink: 0; }
.iv { color: var(--ch); flex: 1; word-break: break-word; }
.iv a { color: var(--bl); text-decoration: none; }
.iv a:hover { color: var(--or); }
.sh { font-size: 10px; font-weight: 700; color: var(--st); text-transform: uppercase; letter-spacing: .7px; font-family: sans-serif; margin: 14px 0 8px; padding-bottom: 4px; border-bottom: 1px solid var(--bd); }
.tblk { background: var(--bg); border: 1px solid var(--bd); border-radius: 5px; padding: 10px 13px; margin-bottom: 8px; font-family: sans-serif; font-size: 13px; }
.tbl-l { font-size: 10px; font-weight: 700; color: var(--st); text-transform: uppercase; letter-spacing: .5px; margin-bottom: 4px; }
.pills { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
.pill { padding: 3px 9px; border-radius: 12px; font-size: 11px; font-family: sans-serif; font-weight: 600; }
.py { background: #EEF3EA; color: var(--pn); }
.pn2 { background: #FDF0EF; color: var(--rd); }

/* Modal */
.ovl { position: fixed; inset: 0; background: rgba(0,0,0,.45); z-index: 400; display: none; align-items: center; justify-content: center; padding: 20px; }
.ovl.on { display: flex; }
.modal { background: var(--sf); border-radius: 8px; width: 100%; max-width: 540px; max-height: 90vh; overflow-y: auto; box-shadow: 0 8px 40px rgba(0,0,0,.2); }
.mh { padding: 18px 22px 13px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--bd); margin-bottom: 16px; }
.mh h2 { font-size: 16px; font-weight: bold; }
.mb { padding: 0 22px 16px; }
.mf { padding: 12px 22px; border-top: 1px solid var(--bd); display: flex; gap: 8px; justify-content: flex-end; }
.fr { margin-bottom: 13px; }
.fr2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 13px; }
label { display: block; font-size: 11px; font-weight: 600; color: var(--st); margin-bottom: 4px; font-family: sans-serif; text-transform: uppercase; letter-spacing: .4px; }
input[type=text], input[type=tel], input[type=date], input[type=email], select.fs2, textarea { width: 100%; padding: 8px 11px; border: 1px solid var(--bd); border-radius: 5px; background: #fff; font-size: 13px; color: var(--ch); font-family: sans-serif; outline: none; transition: border-color .15s; }
input:focus, select.fs2:focus, textarea:focus { border-color: var(--or); }
textarea { resize: vertical; min-height: 68px; }

/* Drop zone */
.dz { border: 2px dashed var(--bd); border-radius: 6px; padding: 28px; text-align: center; cursor: pointer; font-family: sans-serif; color: var(--st); transition: border-color .15s; }
.dz:hover, .dz.drag { border-color: var(--or); background: #FEF8F5; }
.ih { font-size: 12px; color: var(--st); margin-top: 10px; font-family: sans-serif; line-height: 1.6; background: var(--bg); padding: 9px 13px; border-radius: 4px; border: 1px solid var(--bd); }
.ih code { background: var(--bd); padding: 1px 4px; border-radius: 2px; font-size: 11px; }

/* Toast */
.toast { position: fixed; bottom: 22px; right: 22px; background: var(--ch); color: #fff; padding: 9px 16px; border-radius: 5px; font-family: sans-serif; font-size: 13px; z-index: 9999; display: none; box-shadow: 0 4px 16px rgba(0,0,0,.2); border-left: 3px solid var(--or); animation: si .2s ease; }
@keyframes si { from { transform: translateY(8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }

@media (max-width: 1100px) { .stats { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 700px) { main { padding: 12px 14px; } header { padding: 0 14px; } }
"""

# ── JS (plain string — no f-string, braces work normally) ────────────────────
JS = """
const KEY = 'rais_crm_v3';
let contacts = [], flt = 'all', pg = 1, PG = 30, ibuf = [], dueMode = false, eid = null;

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    contacts = (s && s.length) ? s.filter(function(c) {
      return !(c && typeof c.id === 'string' && /^\d+$/.test(c.id));
    }) : [];
    if (s && s.length && contacts.length !== s.length) {
      localStorage.setItem(KEY, JSON.stringify(contacts));
    }
  } catch(e) {
    contacts = [];
  }
}
function persist() { localStorage.setItem(KEY, JSON.stringify(contacts)); }
function gid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,5); }
function td() { return new Date().toISOString().slice(0,10); }

const SM = {
  neu:           ['b-neu', 'Neu'],
  nicht_erreicht:['b-ni',  'Nicht erreicht'],
  followup:      ['b-fu',  'Follow-up'],
  interessiert:  ['b-in',  'Interessiert'],
  termin:        ['b-te',  'Termin'],
  gatekeeper:    ['b-gk',  'Gatekeeper'],
  in_bearbeitung:['b-ib',  'In Bearb.'],
  kein_interesse:['b-ki',  'Kein Interesse'],
};

function sbadge(s) {
  const [c, l] = SM[s] || ['b-neu', s || 'Neu'];
  return '<span class="badge ' + c + '">' + l + '</span>';
}
function roib(n) {
  const c = n >= 3 ? 'r3' : n >= 2 ? 'r2' : 'r1';
  return '<span class="roi ' + c + '">' + (n || 1) + '</span>';
}
function fdc(d) {
  if (!d) return '<span style="color:#ccc;font-family:sans-serif;font-size:12px">—</span>';
  const t = td();
  if (d < t)  return '<span class="fd fdov">&#9888; ' + d + '</span>';
  if (d === t) return '<span class="fd fdtd">&#128222; Heute</span>';
  return '<span class="fd fdup">' + d + '</span>';
}
function esc(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function getList() {
  const q   = document.getElementById('srch').value.toLowerCase();
  const roi = document.getElementById('roiF').value;
  const srt = document.getElementById('sortS').value;
  let list = contacts.filter(function(c) {
    if (flt !== 'all' && c.status !== flt) return false;
    if (roi && String(c.roi || 1) !== roi) return false;
    if (dueMode) { const t = td(); return c.followup && c.followup <= t; }
    if (q) {
      const hay = [c.firma, c.kontakt, c.hauptleistung, c.t1_status, c.besonderheit, c.notiz].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  list = list.slice().sort(function(a, b) {
    if (srt === 'name') return (a.firma || '').localeCompare(b.firma || '');
    if (srt === 'roi')  return (b.roi || 0) - (a.roi || 0);
    if (srt === 'rev')  return (parseInt(b.reviews) || 0) - (parseInt(a.reviews) || 0);
    if (srt === 'new')  return (b.created || 0) - (a.created || 0);
    const da = a.followup || '9999', db = b.followup || '9999';
    return da.localeCompare(db);
  });
  return list;
}

function setF(f) {
  flt = f; pg = 1; dueMode = false;
  document.querySelectorAll('.stat').forEach(function(el) { el.classList.remove('on'); });
  const map = {all:'s-all', neu:'s-neu', nicht_erreicht:'s-ni', followup:'s-fu',
               interessiert:'s-in', termin:'s-te', gatekeeper:'s-gk', kein_interesse:'s-ki'};
  if (map[f]) document.getElementById(map[f]).classList.add('on');
  render();
}
function filterDue() { dueMode = true; pg = 1; render(); }

function render() {
  const t = td();
  const cnt = {all: contacts.length};
  Object.keys(SM).forEach(function(k) { cnt[k] = contacts.filter(function(c) { return c.status === k; }).length; });
  document.getElementById('c-all').textContent = cnt.all;
  document.getElementById('c-neu').textContent = cnt.neu || 0;
  document.getElementById('c-ni').textContent  = cnt.nicht_erreicht || 0;
  document.getElementById('c-fu').textContent  = cnt.followup || 0;
  document.getElementById('c-in').textContent  = cnt.interessiert || 0;
  document.getElementById('c-te').textContent  = cnt.termin || 0;
  document.getElementById('c-gk').textContent  = cnt.gatekeeper || 0;
  document.getElementById('c-ki').textContent  = cnt.kein_interesse || 0;

  const due = contacts.filter(function(c) { return c.followup && c.followup <= t; }).length;
  document.getElementById('banner').classList.toggle('on', due > 0);
  document.getElementById('bannerC').textContent = due;

  const list = getList();
  const tot  = list.length;
  const pages = Math.max(1, Math.ceil(tot / PG));
  if (pg > pages) pg = pages;
  const sl = list.slice((pg - 1) * PG, pg * PG);

  const tbody = document.getElementById('tbody');
  const empty = document.getElementById('empty');
  if (!sl.length) {
    tbody.innerHTML = '';
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    tbody.innerHTML = sl.map(function(c) {
      const ovr = (c.followup && c.followup < t) ? ' ov' : '';
      const note = (c.t1_status || c.besonderheit || c.notiz || '').slice(0, 55);
      return '<tr class="' + ovr + '" onclick="openP(\'' + c.id + '\')">' +
        '<td class="fc">'  + esc(c.firma) + '</td>' +
        '<td>'             + esc(c.kontakt || '—') + '</td>' +
        '<td><a href="tel:' + esc(c.telefon) + '" onclick="event.stopPropagation()" style="color:#2C5F8A;text-decoration:none;font-family:monospace;font-size:12.5px">' + esc(c.telefon || '—') + '</a></td>' +
        '<td>'             + roib(c.roi) + '</td>' +
        '<td>'             + sbadge(c.status) + '</td>' +
        '<td>'             + fdc(c.followup) + '</td>' +
        '<td class="nc" title="' + esc((c.t1_status||'') + ' ' + (c.besonderheit||'')) + '">' + esc(note) + (note.length === 55 ? '…' : '') + '</td>' +
        '<td style="font-family:sans-serif;font-size:12px;color:#7B746B">' + (c.reviews || '—') + '</td>' +
        '<td onclick="event.stopPropagation()"><div class="ra">' +
          '<button class="btn bg bsm" onclick="openE(\'' + c.id + '\')" title="Bearbeiten">&#9998;</button>' +
          '<button class="btn bg bsm" onclick="del(\'' + c.id + '\')" title="Loeschen">&#128465;</button>' +
        '</div></td>' +
      '</tr>';
    }).join('');
  }

  document.getElementById('rc').textContent = tot === contacts.length
    ? tot + ' Einträge' : tot + ' von ' + contacts.length;

  const pb = document.getElementById('pb');
  if (pages <= 1) { pb.innerHTML = ''; return; }
  pb.innerHTML = Array.from({length: pages}, function(_, i) { return i + 1; })
    .map(function(p) { return '<button class="pbb' + (p === pg ? ' on' : '') + '" onclick="goPg(' + p + ')">' + p + '</button>'; })
    .join('');
}
function goPg(p) { pg = p; render(); }

// ── Panel ─────────────────────────────────────────────────────────────────────
function openP(id) {
  const c = contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('pFirma').textContent = c.firma;
  document.getElementById('pSub').textContent = [c.title, c.kontakt].filter(Boolean).join(' · ');
  const wsOk = c.webseite_vorhanden === 'TRUE' || c.webseite_vorhanden === true;
  const kalk = c.hat_kalkulator === 'TRUE' || c.hat_kalkulator === true;
  const b = document.getElementById('pBody');
  b.innerHTML =
    '<div class="sh">Kontakt</div>' +
    ir('Telefon', c.telefon ? '<a href="tel:' + esc(c.telefon) + '">' + esc(c.telefon) + '</a>' : '—') +
    ir('E-Mail',  c.email   ? '<a href="mailto:' + esc(c.email) + '">' + esc(c.email) + '</a>' : '—') +
    ir('Website', c.website ? '<a href="' + esc(c.website) + '" target="_blank" rel="noopener">' + esc(c.website.replace(/^https?:\/\//,'')) + '</a>' : '—') +
    (c.facebook ? ir('Facebook', '<a href="' + esc(c.facebook) + '" target="_blank" rel="noopener">Profil öffnen</a>') : '') +
    '<div class="sh">Status</div>' +
    ir('Status',   sbadge(c.status)) +
    ir('ROI',      roib(c.roi)) +
    ir('Follow-up', fdc(c.followup)) +
    '<div class="sh">Touch 1</div>' +
    '<div class="tblk"><div class="tbl-l">Touch 1</div>' +
      (c.t1_status ? '<div>' + esc(c.t1_status) + '</div>' : '<div style="color:#7B746B">Noch nicht kontaktiert</div>') +
      (c.t1_datum  ? '<div style="font-size:12px;color:#7B746B;margin-top:2px">' + c.t1_datum + '</div>' : '') +
      (c.t1_einwand ? '<div style="font-size:12px;margin-top:2px">Einwand: ' + esc(c.t1_einwand) + '</div>' : '') +
    '</div>' +
    (c.besonderheit ? '<div class="sh">Website-Analyse</div><div style="font-family:sans-serif;font-size:13px;background:#F5F2EC;border:1px solid #D9D1C7;border-radius:5px;padding:10px 13px;line-height:1.6;margin-bottom:8px">' + esc(c.besonderheit) + '</div>' : '') +
    '<div class="sh">Website-Info</div>' +
    ir('Alter',    c.webseite_alter || '—') +
    ir('Leistung', c.hauptleistung  || '—') +
    ir('Reviews',  c.reviews        || '—') +
    '<div class="ir"><span class="il">Website</span><div class="iv"><div class="pills">' +
      '<span class="pill ' + (wsOk ? 'py' : 'pn2') + '">' + (wsOk ? '&#10003; vorhanden' : '&#10007; keine Website') + '</span>' +
      '<span class="pill ' + (kalk ? 'py' : 'pn2') + '">' + (kalk ? '&#10003; Kalkulator' : '&#10007; kein Kalkulator') + '</span>' +
    '</div></div></div>';

  document.getElementById('pFoot').innerHTML =
    '<button class="btn bp bsm" onclick="openE(\'' + id + '\');closeP()">Bearbeiten</button>' +
    '<button class="btn bs bsm" onclick="qs(\'' + id + '\',\'nicht_erreicht\')">Nicht erreicht</button>' +
    '<button class="btn bs bsm" onclick="qs(\'' + id + '\',\'interessiert\')">Interessiert</button>' +
    '<button class="btn bs bsm" onclick="qs(\'' + id + '\',\'termin\')">Termin</button>' +
    '<button class="btn bs bsm" onclick="qs(\'' + id + '\',\'kein_interesse\')">Kein Interesse</button>';

  document.getElementById('po').classList.add('on');
}
function ir(l, v) { return '<div class="ir"><span class="il">' + l + '</span><div class="iv">' + v + '</div></div>'; }
function closeP() { document.getElementById('po').classList.remove('on'); }
function qs(id, s) {
  const c = contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  c.status = s; persist(); render(); closeP();
  toast('Status: ' + (SM[s] ? SM[s][1] : s));
}

// ── Edit ──────────────────────────────────────────────────────────────────────
function openAdd() {
  eid = null;
  document.getElementById('mt').textContent = 'Kontakt hinzufügen';
  clrF();
  const tm = new Date(); tm.setDate(tm.getDate() + 1);
  document.getElementById('efu').value = tm.toISOString().slice(0,10);
  document.getElementById('eo').classList.add('on');
}
function openE(id) {
  const c = contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  eid = id;
  document.getElementById('mt').textContent    = 'Kontakt bearbeiten';
  document.getElementById('ef').value          = c.firma        || '';
  document.getElementById('ek').value          = c.kontakt      || '';
  document.getElementById('etit').value        = c.title        || '';
  document.getElementById('et').value          = c.telefon      || '';
  document.getElementById('em').value          = c.email        || '';
  document.getElementById('ew').value          = c.website      || '';
  document.getElementById('es').value          = c.status       || 'neu';
  document.getElementById('efu').value         = c.followup     || '';
  document.getElementById('er').value          = String(c.roi   || 1);
  document.getElementById('erev').value        = c.reviews      || '';
  document.getElementById('et1').value         = c.t1_status    || '';
  document.getElementById('en').value          = c.besonderheit || c.notiz || '';
  document.getElementById('eo').classList.add('on');
}
function closeE() { document.getElementById('eo').classList.remove('on'); clrF(); }
function clrF() {
  ['ef','ek','etit','et','em','ew','efu','erev','et1','en'].forEach(function(i) {
    const el = document.getElementById(i); if (el) el.value = '';
  });
  document.getElementById('es').value = 'neu';
  document.getElementById('er').value = '1';
}
function save() {
  const f = document.getElementById('ef').value.trim();
  if (!f) { toast('Firma fehlt.'); return; }
  const d = {
    firma:       f,
    kontakt:     document.getElementById('ek').value.trim(),
    title:       document.getElementById('etit').value.trim(),
    telefon:     document.getElementById('et').value.trim(),
    email:       document.getElementById('em').value.trim(),
    website:     document.getElementById('ew').value.trim(),
    status:      document.getElementById('es').value,
    followup:    document.getElementById('efu').value,
    roi:         parseInt(document.getElementById('er').value) || 1,
    reviews:     document.getElementById('erev').value.trim(),
    t1_status:   document.getElementById('et1').value.trim(),
    besonderheit:document.getElementById('en').value.trim(),
    notiz:       document.getElementById('en').value.trim(),
    gewerk:      'Fliesenleger',
  };
  if (eid) {
    const i = contacts.findIndex(function(c) { return c.id === eid; });
    if (i >= 0) contacts[i] = Object.assign({}, contacts[i], d);
  } else {
    contacts.push(Object.assign({id: gid(), created: Date.now()}, d));
  }
  persist(); closeE(); render();
  toast(eid ? 'Gespeichert.' : 'Kontakt hinzugefügt.');
}
function del(id) {
  if (!confirm('Kontakt wirklich löschen?')) return;
  contacts = contacts.filter(function(c) { return c.id !== id; });
  persist(); render(); toast('Gelöscht.');
}

// ── Import ────────────────────────────────────────────────────────────────────
function openImport() {
  ibuf = [];
  document.getElementById('ip').innerHTML = '';
  document.getElementById('ib').style.display = 'none';
  document.getElementById('cf').value = '';
  document.getElementById('io').classList.add('on');
}
function closeI() { document.getElementById('io').classList.remove('on'); }
function dzOv(e)  { e.preventDefault(); document.getElementById('dz').classList.add('drag'); }
function dzLv()   { document.getElementById('dz').classList.remove('drag'); }
function dzDr(e)  { e.preventDefault(); dzLv(); rdFile(e.dataTransfer.files[0]); }
function rdCSV(e) { rdFile(e.target.files[0]); }
function rdFile(f) {
  if (!f) return;
  const r = new FileReader();
  r.onload = function(e) { parseCSV(e.target.result); };
  r.readAsText(f, 'UTF-8');
}
function parseCSV(txt) {
  const lines = txt.replace(/\\r/g, '').split('\\n').filter(function(l) { return l.trim(); });
  if (lines.length < 2) { toast('CSV leer.'); return; }
  const heads = spl(lines[0]).map(function(h) { return h.trim().toLowerCase(); });
  const ci = function(n) { return heads.findIndex(function(h) { return h.includes(n); }); };
  const iF  = ci('firma');
  const iK  = ci('ansprechpartner') >= 0 ? ci('ansprechpartner') : ci('kontakt');
  const iT  = ci('telefon') >= 0 ? ci('telefon') : ci('tel');
  const iS  = ci('status');
  const iFu = ci('follow');
  if (iF < 0) { toast('Keine Firma-Spalte gefunden.'); return; }
  const sm2 = {
    interessiert:'interessiert', termin:'termin',
    followup:'followup', 'follow-up':'followup',
    'nicht erreicht':'nicht_erreicht', nicht_erreicht:'nicht_erreicht',
    'no show':'nicht_erreicht', gatekeeper:'gatekeeper',
    'kein interesse':'kein_interesse',
  };
  ibuf = lines.slice(1).map(function(l) {
    const c = spl(l);
    const g = function(i) { return i >= 0 ? (c[i] || '').trim() : ''; };
    const rs = g(iS).toLowerCase();
    return { id: gid(), created: Date.now(), firma: g(iF), kontakt: g(iK),
             telefon: g(iT), status: sm2[rs] || 'neu', followup: g(iFu),
             roi: 1, gewerk: 'Fliesenleger' };
  }).filter(function(c) { return c.firma; });
  document.getElementById('ip').innerHTML =
    '<div style="font-family:sans-serif;font-size:13px;color:#789464;font-weight:600">' +
    '&#10003; ' + ibuf.length + ' Kontakte erkannt</div>';
  document.getElementById('ib').style.display = 'inline-flex';
}
function spl(l) {
  const r = []; let c = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const ch = l[i];
    if (ch === '"') { q = !q; continue; }
    if ((ch === ',' || ch === ';') && !q) { r.push(c); c = ''; continue; }
    c += ch;
  }
  r.push(c); return r;
}
function doImport() {
  if (!ibuf.length) return;
  contacts = contacts.concat(ibuf);
  persist(); closeI(); render();
  toast(ibuf.length + ' Kontakte importiert.');
  ibuf = [];
}

// ── Export ────────────────────────────────────────────────────────────────────
function exportCSV() {
  const h = ['Firma','Kontakt','Titel','Telefon','Email','Website','ROI','Status','Follow-up','T1','Reviews','Leistung','Besonderheit'];
  const rows = contacts.map(function(c) {
    return [c.firma,c.kontakt,c.title,c.telefon,c.email,c.website,c.roi,c.status,c.followup,c.t1_status,c.reviews,c.hauptleistung,c.besonderheit]
      .map(function(v) { return '"' + String(v || '').replace(/"/g, '""') + '"'; });
  });
  const csv = [h.join(',')].concat(rows.map(function(r) { return r.join(','); })).join('\\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\\ufeff' + csv], {type: 'text/csv;charset=utf-8'}));
  a.download = 'RAIS_CRM_' + td() + '.csv';
  a.click();
  toast('Export gestartet.');
}

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(m) {
  const el = document.getElementById('toast');
  el.textContent = m;
  el.style.display = 'block';
  clearTimeout(el._t);
  el._t = setTimeout(function() { el.style.display = 'none'; }, 2600);
}

// ── Keys ──────────────────────────────────────────────────────────────────────
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { closeP(); closeE(); closeI(); }
  if (e.key === 'n' && !e.ctrlKey && !e.metaKey && document.activeElement.tagName === 'BODY') openAdd();
});

load();
render();
"""

# ── HTML ──────────────────────────────────────────────────────────────────────
HTML = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RAIS CRM — Akquise</title>
<link rel="icon" type="image/svg+xml" href="{favicon}">
<style>{CSS}</style>
</head>
<body>
<header>
  <a class="logo" href="#">
    <svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">{svg_inner}</svg>
    <div class="logo-text">RAIS <em>CRM</em></div>
  </a>
  <div class="hact">
    <button class="btn bs" onclick="openImport()">CSV importieren</button>
    <button class="btn bs" onclick="exportCSV()">Exportieren</button>
    <button class="btn bp" onclick="openAdd()">+ Kontakt</button>
  </div>
</header>

<main>
  <div id="banner" class="banner">
    <span>&#128222;</span>
    <span><strong id="bannerC">0</strong> Follow-up(s) heute oder überfällig</span>
    <button class="btn bs bsm" onclick="filterDue()">Nur diese</button>
  </div>

  <div class="stats">
    <div class="stat on" id="s-all" onclick="setF('all')"><span class="sn" id="c-all">0</span><span class="sl">Gesamt</span></div>
    <div class="stat" id="s-neu" onclick="setF('neu')"><span class="sn" id="c-neu">0</span><span class="sl">Neu</span></div>
    <div class="stat" id="s-ni"  onclick="setF('nicht_erreicht')"><span class="sn" id="c-ni">0</span><span class="sl">Nicht erreicht</span></div>
    <div class="stat" id="s-fu"  onclick="setF('followup')"><span class="sn" id="c-fu">0</span><span class="sl">Follow-up</span></div>
    <div class="stat" id="s-in"  onclick="setF('interessiert')"><span class="sn" id="c-in">0</span><span class="sl">Interessiert</span></div>
    <div class="stat" id="s-te"  onclick="setF('termin')"><span class="sn" id="c-te">0</span><span class="sl">Termin</span></div>
    <div class="stat" id="s-gk"  onclick="setF('gatekeeper')"><span class="sn" id="c-gk">0</span><span class="sl">Gatekeeper</span></div>
    <div class="stat" id="s-ki"  onclick="setF('kein_interesse')"><span class="sn" id="c-ki">0</span><span class="sl">Kein Interesse</span></div>
  </div>

  <div class="tb">
    <input class="srch" id="srch" type="text" placeholder="Firma, Name, Notiz …" oninput="render()">
    <select class="fs" id="roiF" onchange="render()">
      <option value="">ROI: Alle</option>
      <option value="3">ROI 3 — Hoch</option>
      <option value="2">ROI 2 — Mittel</option>
      <option value="1">ROI 1 — Niedrig</option>
    </select>
    <select class="fs" id="sortS" onchange="render()">
      <option value="fu">Follow-up &#8593;</option>
      <option value="roi">ROI &#8595;</option>
      <option value="name">Firma A–Z</option>
      <option value="rev">Reviews &#8595;</option>
      <option value="new">Zuletzt hinzugefügt</option>
    </select>
  </div>

  <div class="tw">
    <table>
      <thead><tr>
        <th>Firma</th><th>Ansprechpartner</th><th>Telefon</th>
        <th>ROI</th><th>Status</th><th>Follow-up</th>
        <th>T1 / Notiz</th><th>Reviews</th><th style="width:64px"></th>
      </tr></thead>
      <tbody id="tbody"></tbody>
    </table>
    <div id="empty" class="empty" style="display:none">
      <div style="font-size:32px;margin-bottom:10px">&#128203;</div>
      <h3>Keine Einträge</h3>
      <p>Filter anpassen oder + Kontakt klicken.</p>
    </div>
    <div class="tf"><span id="rc"></span><div class="pb" id="pb"></div></div>
  </div>
</main>

<!-- Side panel -->
<div class="po" id="po">
  <div class="pbg" onclick="closeP()"></div>
  <div class="panel">
    <div class="ph">
      <div><div class="ph-firma" id="pFirma"></div><div class="ph-sub" id="pSub"></div></div>
      <button class="btn bg" onclick="closeP()">&#10005;</button>
    </div>
    <div class="pb2" id="pBody"></div>
    <div class="pf"  id="pFoot"></div>
  </div>
</div>

<!-- Edit modal -->
<div class="ovl" id="eo">
  <div class="modal">
    <div class="mh"><h2 id="mt">Kontakt bearbeiten</h2><button class="btn bg" onclick="closeE()">&#10005;</button></div>
    <div class="mb">
      <input type="hidden" id="eid">
      <div class="fr2"><div><label>Firma *</label><input type="text" id="ef"></div><div><label>Ansprechpartner</label><input type="text" id="ek"></div></div>
      <div class="fr2"><div><label>Titel</label><input type="text" id="etit"></div><div><label>Telefon</label><input type="tel" id="et"></div></div>
      <div class="fr2"><div><label>E-Mail</label><input type="email" id="em"></div><div><label>Website</label><input type="text" id="ew"></div></div>
      <div class="fr2">
        <div><label>Status</label><select class="fs2" id="es">
          <option value="neu">Neu</option>
          <option value="nicht_erreicht">Nicht erreicht</option>
          <option value="gatekeeper">Gatekeeper</option>
          <option value="followup">Follow-up</option>
          <option value="interessiert">Interessiert</option>
          <option value="termin">Termin vereinbart</option>
          <option value="in_bearbeitung">In Bearbeitung</option>
          <option value="kein_interesse">Kein Interesse</option>
        </select></div>
        <div><label>Follow-up Datum</label><input type="date" id="efu"></div>
      </div>
      <div class="fr2">
        <div><label>ROI</label><select class="fs2" id="er"><option value="1">1 — Niedrig</option><option value="2">2 — Mittel</option><option value="3">3 — Hoch</option></select></div>
        <div><label>Reviews</label><input type="text" id="erev"></div>
      </div>
      <div class="fr"><label>T1 Gesprächsnotiz</label><textarea id="et1"></textarea></div>
      <div class="fr"><label>Einwand / Besonderheit</label><textarea id="en"></textarea></div>
    </div>
    <div class="mf"><button class="btn bs" onclick="closeE()">Abbrechen</button><button class="btn bp" onclick="save()">Speichern</button></div>
  </div>
</div>

<!-- Import modal -->
<div class="ovl" id="io">
  <div class="modal">
    <div class="mh"><h2>CSV importieren</h2><button class="btn bg" onclick="closeI()">&#10005;</button></div>
    <div class="mb">
      <div class="dz" id="dz" onclick="document.getElementById('cf').click()" ondragover="dzOv(event)" ondragleave="dzLv()" ondrop="dzDr(event)">
        <div style="font-size:26px;margin-bottom:8px">&#128194;</div>
        <strong>CSV hier ablegen</strong> oder klicken
        <input type="file" id="cf" accept=".csv" style="display:none" onchange="rdCSV(event)">
      </div>
      <div class="ih">Spalten: <code>Firma</code> <code>Ansprechpartner</code> <code>Telefon</code> <code>Status</code> <code>Follow-up</code> <code>Notiz</code><br>Excel: Datei &#8594; Speichern als CSV UTF-8</div>
      <div id="ip" style="margin-top:10px"></div>
    </div>
    <div class="mf"><button class="btn bs" onclick="closeI()">Abbrechen</button><button class="btn bp" id="ib" style="display:none" onclick="doImport()">Importieren</button></div>
  </div>
</div>

<div id="toast" class="toast"></div>

<script>
{JS}
</script>
</body>
</html>"""

# Inject data (JS is already a plain string — no escaping issues)
html_out = HTML

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html_out)

print(f"Done — {len(html_out.encode('utf-8'))//1024} KB")
