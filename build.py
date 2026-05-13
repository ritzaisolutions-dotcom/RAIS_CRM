import csv, json, re, urllib.parse

# ── Parse CSV ─────────────────────────────────────────────────────────────────
rows = []
with open('fliesenleger_kob_bonn_wiesb - leads-details.csv', encoding='utf-8-sig') as f:
    reader = csv.reader(f)
    next(reader)
    for row in reader:
        if len(row) < 3: continue
        firma = row[2].strip() if len(row) > 2 else ''
        if not firma: continue
        def g(i): return row[i].strip() if len(row) > i else ''
        roi_raw = g(7); t1_status = g(8)
        def conv_date(s):
            m = re.search(r'(\d{1,2})\.(\d{1,2})\.(\d{4})', s)
            if m: return f"{m.group(3)}-{int(m.group(2)):02d}-{int(m.group(1)):02d}"
            return ''
        t1_lower = t1_status.lower()
        status = 'neu'
        if 'termin' in t1_lower: status = 'termin'
        elif 'warm' in t1_lower or 'interessiert' in t1_lower: status = 'interessiert'
        elif 'urlaub' in t1_lower or 'call back' in t1_lower or 'follow up' in t1_lower: status = 'followup'
        elif 'gatekeeper' in t1_lower: status = 'gatekeeper'
        elif 'no show' in t1_lower or t1_lower == 'no show': status = 'nicht_erreicht'
        elif t1_status.strip(): status = 'in_bearbeitung'
        roi_num = 1
        m = re.search(r'\d', roi_raw)
        if m: roi_num = int(m.group())
        t2d = conv_date(g(12)) or conv_date(g(15))
        besonderheit = g(23); besonderheit = '' if besonderheit in ('NA', '') else besonderheit
        notiz_parts = []
        if t1_status: notiz_parts.append(f"T1: {t1_status}")
        if g(10): notiz_parts.append(f"Einwand: {g(10)}")
        if besonderheit: notiz_parts.append(besonderheit)
        rows.append({
            'id': g(0) or str(len(rows)+1), 'created': 1747000000000,
            'firma': firma, 'kontakt': g(3), 'title': g(28),
            'telefon': g(4), 'email': g(5) if g(5) not in ('NA','') else '',
            'website': g(6), 'roi': roi_num, 'status': status, 'followup': t2d,
            't1_status': t1_status, 't1_datum': conv_date(g(9)), 't1_einwand': g(10),
            'reviews': g(18), 'webseite_alter': g(19),
            'webseite_vorhanden': g(20), 'hat_kalkulator': g(21) == 'TRUE',
            'hauptleistung': g(22), 'besonderheit': besonderheit,
            'facebook': g(27) if g(27) not in ('NA','') else '',
            'notiz': ' | '.join(notiz_parts), 'gewerk': 'Fliesenleger',
        })

DATA_JSON = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))

# ── Load SVG ──────────────────────────────────────────────────────────────────
with open('rais-pictogram-orange.svg', encoding='utf-8') as f:
    svg_raw = f.read().strip()
svg_raw = re.sub(r'<filter[^>]*>.*?</filter>', '', svg_raw, flags=re.DOTALL)
svg_raw = re.sub(r'filter="url\([^)]+\)"', '', svg_raw)
svg_inner = re.sub(r'<svg[^>]*>', '', svg_raw).replace('</svg>', '').strip()

# Favicon: inline SVG as data URI
favicon_svg = f'<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">{svg_inner}</svg>'
favicon_uri = 'data:image/svg+xml,' + urllib.parse.quote(favicon_svg)

# ── HTML ──────────────────────────────────────────────────────────────────────
HTML = f"""<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>RAIS CRM — Akquise Fliesenleger</title>
<link rel="icon" type="image/svg+xml" href="{favicon_uri}">
<style>
/* ── Reset & tokens ─────────────────────────────── */
*{{box-sizing:border-box;margin:0;padding:0}}
:root{{
  --or:#EC6A37;--orh:#F37A48;
  --ch:#2F2A24;--st:#7B746B;--bd:#D9D1C7;
  --sg:#789464;--pn:#3C5A2A;
  --rd:#C0392B;--yw:#B07000;--bl:#2C5F8A;
  /* glass tokens */
  --glass:rgba(255,251,245,0.55);
  --glass-s:rgba(255,251,245,0.72);
  --glass-d:rgba(35,28,20,0.72);
  --glass-bd:rgba(255,255,255,0.22);
  --glass-bd2:rgba(255,255,255,0.10);
  --blur:blur(18px);
  --blur-s:blur(28px);
  --shadow:0 8px 32px rgba(0,0,0,.18);
  --shadow-sm:0 2px 12px rgba(0,0,0,.10);
  --radius:12px;--radius-sm:8px;
  --tr:all .22s cubic-bezier(.4,0,.2,1);
}}

/* ── Animated background ────────────────────────── */
body{{
  font-family:Georgia,serif;
  color:var(--ch);
  min-height:100vh;
  font-size:15px;
  line-height:1.5;
  background:#1a1410;
  overflow-x:hidden;
}}

.bg-canvas{{
  position:fixed;inset:0;z-index:0;
  background:
    radial-gradient(ellipse 80% 60% at 15% 20%, rgba(236,106,55,.18) 0%, transparent 60%),
    radial-gradient(ellipse 60% 80% at 85% 75%, rgba(120,148,100,.14) 0%, transparent 55%),
    radial-gradient(ellipse 100% 100% at 50% 50%, rgba(47,42,36,1) 0%, #110d08 100%);
  animation:bgpulse 12s ease-in-out infinite alternate;
}}
@keyframes bgpulse{{
  0%  {{background-position:0% 0%,100% 100%,50% 50%}}
  100%{{background-position:8% 4%,92% 96%,50% 50%}}
}}

.bg-orbs{{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}}
.orb{{
  position:absolute;border-radius:50%;filter:blur(80px);opacity:.18;
  animation:orbf 18s ease-in-out infinite alternate;
}}
.orb1{{width:520px;height:520px;background:var(--or);top:-120px;left:-80px;animation-delay:0s}}
.orb2{{width:400px;height:400px;background:#789464;bottom:-100px;right:-60px;animation-delay:-6s}}
.orb3{{width:300px;height:300px;background:#F37A48;top:40%;left:60%;animation-delay:-3s;opacity:.10}}
@keyframes orbf{{0%{{transform:translate(0,0) scale(1)}}100%{{transform:translate(40px,30px) scale(1.08)}}}}

/* ── App shell ─────────────────────────────────── */
.app{{position:relative;z-index:1;display:flex;flex-direction:column;min-height:100vh}}

/* ── Header ─────────────────────────────────────── */
header{{
  background:var(--glass-d);
  backdrop-filter:var(--blur-s);
  -webkit-backdrop-filter:var(--blur-s);
  border-bottom:1px solid var(--glass-bd2);
  padding:0 28px;
  display:flex;align-items:center;justify-content:space-between;
  height:58px;
  position:sticky;top:0;z-index:200;
  box-shadow:0 1px 0 rgba(236,106,55,.25), var(--shadow-sm);
}}
.logo{{display:flex;align-items:center;gap:11px;text-decoration:none}}
.logo-icon{{width:32px;height:32px;flex-shrink:0;filter:drop-shadow(0 0 8px rgba(236,106,55,.5))}}
.logo-text{{font-size:17px;font-weight:bold;letter-spacing:.3px;color:#fff}}
.logo-text em{{color:var(--or);font-style:normal}}
.hactions{{display:flex;gap:8px;align-items:center}}

/* ── Buttons ─────────────────────────────────────── */
.btn{{
  display:inline-flex;align-items:center;gap:5px;
  padding:7px 15px;border-radius:var(--radius-sm);
  font-size:13px;font-family:sans-serif;font-weight:600;
  cursor:pointer;border:none;
  transition:var(--tr);white-space:nowrap;
  position:relative;overflow:hidden;
}}
.btn::after{{
  content:'';position:absolute;inset:0;
  background:linear-gradient(135deg,rgba(255,255,255,.08),transparent);
  opacity:0;transition:opacity .2s;
}}
.btn:hover::after{{opacity:1}}

.bp{{background:var(--or);color:#fff;box-shadow:0 2px 12px rgba(236,106,55,.4)}}
.bp:hover{{background:var(--orh);box-shadow:0 4px 20px rgba(236,106,55,.55);transform:translateY(-1px)}}
.bp:active{{transform:translateY(0)}}

.bs{{
  background:rgba(255,251,245,.08);color:rgba(255,255,255,.85);
  border:1px solid rgba(255,255,255,.14);
  backdrop-filter:blur(8px);
}}
.bs:hover{{background:rgba(255,251,245,.15);border-color:rgba(236,106,55,.5);color:#fff;transform:translateY(-1px)}}

.bs-dark{{
  background:rgba(255,251,245,.65);color:var(--ch);
  border:1px solid rgba(209,193,177,.5);
  backdrop-filter:blur(8px);
}}
.bs-dark:hover{{background:rgba(255,251,245,.85);border-color:var(--or);color:var(--or);transform:translateY(-1px)}}

.bg2{{background:transparent;color:rgba(255,255,255,.5);border:none;padding:4px 8px}}
.bg2:hover{{color:var(--or)}}
.bsm{{padding:4px 10px;font-size:12px}}

/* ── Main ────────────────────────────────────────── */
main{{padding:22px 28px;max-width:1480px;width:100%;margin:0 auto}}

/* ── Banner ─────────────────────────────────────── */
.banner{{
  background:rgba(236,106,55,.12);
  border:1px solid rgba(236,106,55,.3);
  border-radius:var(--radius-sm);
  padding:11px 16px;margin-bottom:18px;
  display:none;align-items:center;gap:10px;
  font-family:sans-serif;font-size:13px;color:#fff;
  backdrop-filter:blur(8px);
  animation:bannerPop .3s ease;
}}
.banner.on{{display:flex}}
.banner strong{{color:var(--or)}}
@keyframes bannerPop{{from{{opacity:0;transform:translateY(-6px)}}to{{opacity:1;transform:translateY(0)}}}}

/* ── Stats grid ─────────────────────────────────── */
.stats{{display:grid;grid-template-columns:repeat(8,1fr);gap:10px;margin-bottom:18px}}
.stat{{
  background:var(--glass);
  backdrop-filter:var(--blur);
  -webkit-backdrop-filter:var(--blur);
  border:1px solid var(--glass-bd);
  border-radius:var(--radius);
  padding:13px 14px;cursor:pointer;
  transition:var(--tr);
  box-shadow:var(--shadow-sm);
  animation:fadeUp .35s ease both;
}}
.stat:nth-child(1){{animation-delay:.02s}}
.stat:nth-child(2){{animation-delay:.05s}}
.stat:nth-child(3){{animation-delay:.08s}}
.stat:nth-child(4){{animation-delay:.11s}}
.stat:nth-child(5){{animation-delay:.14s}}
.stat:nth-child(6){{animation-delay:.17s}}
.stat:nth-child(7){{animation-delay:.20s}}
.stat:nth-child(8){{animation-delay:.23s}}
.stat:hover{{
  transform:translateY(-3px);
  box-shadow:0 12px 32px rgba(0,0,0,.2),0 0 0 1px rgba(236,106,55,.3);
  border-color:rgba(236,106,55,.4);
  background:rgba(255,251,245,.72);
}}
.stat.on{{
  background:rgba(236,106,55,.15);
  border-color:rgba(236,106,55,.6);
  box-shadow:0 0 0 1px rgba(236,106,55,.4), var(--shadow-sm);
}}
.stat.on .sn{{color:var(--or)}}
.sn{{font-size:22px;font-weight:bold;display:block;line-height:1;margin-bottom:3px;color:var(--ch);transition:color .2s}}
.sl{{font-size:10px;color:var(--st);text-transform:uppercase;letter-spacing:.5px;font-family:sans-serif}}

@keyframes fadeUp{{from{{opacity:0;transform:translateY(10px)}}to{{opacity:1;transform:translateY(0)}}}}

/* ── Toolbar ─────────────────────────────────────── */
.tb{{display:flex;gap:8px;margin-bottom:14px;align-items:center;flex-wrap:wrap}}
.srch{{
  flex:1;min-width:180px;
  padding:9px 14px;
  border:1px solid rgba(255,255,255,.14);
  border-radius:var(--radius-sm);
  background:rgba(255,251,245,.12);
  color:#fff;
  font-size:14px;font-family:sans-serif;
  outline:none;
  backdrop-filter:blur(8px);
  transition:var(--tr);
}}
.srch::placeholder{{color:rgba(255,255,255,.35)}}
.srch:focus{{border-color:rgba(236,106,55,.6);background:rgba(255,251,245,.18);box-shadow:0 0 0 3px rgba(236,106,55,.12)}}
select.fs{{
  padding:9px 12px;
  border:1px solid rgba(255,255,255,.14);
  border-radius:var(--radius-sm);
  background:rgba(255,251,245,.12);
  color:#fff;font-size:13px;font-family:sans-serif;
  cursor:pointer;outline:none;
  backdrop-filter:blur(8px);
  transition:var(--tr);
}}
select.fs option{{background:#2F2A24;color:#fff}}
select.fs:focus{{border-color:rgba(236,106,55,.5)}}

/* ── Table wrapper ──────────────────────────────── */
.tw{{
  background:var(--glass);
  backdrop-filter:var(--blur);
  -webkit-backdrop-filter:var(--blur);
  border:1px solid var(--glass-bd);
  border-radius:var(--radius);
  overflow:hidden;
  box-shadow:var(--shadow);
  animation:fadeUp .4s .25s ease both;
}}
table{{width:100%;border-collapse:collapse;font-family:sans-serif;font-size:13px}}
thead{{background:rgba(47,42,36,.85);backdrop-filter:blur(8px)}}
thead th{{
  color:rgba(255,255,255,.85);padding:11px 12px;
  text-align:left;font-size:10.5px;font-weight:700;
  letter-spacing:.6px;text-transform:uppercase;white-space:nowrap;
  border-bottom:1px solid rgba(236,106,55,.2);
}}
tbody tr{{
  border-bottom:1px solid rgba(209,193,177,.25);
  cursor:pointer;
  transition:background .15s,transform .12s;
}}
tbody tr:last-child{{border-bottom:none}}
tbody tr:hover{{background:rgba(236,106,55,.07);}}
tbody tr.ov{{background:rgba(192,57,43,.06)}}
tbody tr.ov:hover{{background:rgba(192,57,43,.10)}}
td{{padding:10px 12px;vertical-align:middle}}
.fc{{font-weight:600;color:var(--ch)}}
.nc{{max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--st);font-size:12px}}

/* ── Table row animation ───────────────────────── */
@keyframes rowIn{{from{{opacity:0;transform:translateX(-6px)}}to{{opacity:1;transform:translateX(0)}}}}
tbody tr{{animation:rowIn .2s ease both}}

/* ── Badges ─────────────────────────────────────── */
.badge{{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;letter-spacing:.3px;font-family:sans-serif;text-transform:uppercase}}
.b-neu{{background:rgba(44,95,138,.15);color:#5B9ED6;border:1px solid rgba(44,95,138,.25)}}
.b-ni{{background:rgba(192,57,43,.12);color:#E07060;border:1px solid rgba(192,57,43,.2)}}
.b-fu{{background:rgba(236,106,55,.14);color:var(--or);border:1px solid rgba(236,106,55,.25)}}
.b-in{{background:rgba(60,90,42,.15);color:#7CB87A;border:1px solid rgba(60,90,42,.25)}}
.b-te{{background:rgba(60,90,42,.2);color:#5FA85D;border:1px solid rgba(120,148,100,.4)}}
.b-gk{{background:rgba(176,112,0,.12);color:#D4921A;border:1px solid rgba(176,112,0,.2)}}
.b-ib{{background:rgba(107,70,168,.12);color:#9E7FCC;border:1px solid rgba(107,70,168,.2)}}
.b-ki{{background:rgba(123,116,107,.1);color:var(--st);border:1px solid rgba(123,116,107,.18)}}

/* ── ROI ─────────────────────────────────────────── */
.roi{{display:inline-flex;width:24px;height:24px;border-radius:50%;font-size:11px;font-weight:700;align-items:center;justify-content:center;font-family:sans-serif}}
.r1{{background:rgba(44,95,138,.18);color:#5B9ED6;border:1px solid rgba(44,95,138,.25)}}
.r2{{background:rgba(176,112,0,.15);color:#D4921A;border:1px solid rgba(176,112,0,.25)}}
.r3{{background:rgba(60,90,42,.18);color:#7CB87A;border:1px solid rgba(60,90,42,.3)}}

/* ── Follow-up date ──────────────────────────────── */
.fd{{font-size:12px;font-family:sans-serif}}
.fdov{{color:#E07060;font-weight:600}}
.fdtd{{color:var(--or);font-weight:600;animation:pulse 2s infinite}}
@keyframes pulse{{0%,100%{{opacity:1}}50%{{opacity:.6}}}}
.fdup{{color:var(--st)}}

/* ── Row actions ─────────────────────────────────── */
.ra{{display:flex;gap:3px;opacity:0;transition:opacity .15s}}
tr:hover .ra{{opacity:1}}

/* ── Empty state ─────────────────────────────────── */
.empty{{text-align:center;padding:54px 20px;color:rgba(255,255,255,.4);font-family:sans-serif}}
.empty h3{{font-size:16px;color:rgba(255,255,255,.7);margin-bottom:6px;font-family:Georgia,serif}}

/* ── Table footer ────────────────────────────────── */
.tf{{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 14px;
  border-top:1px solid rgba(209,193,177,.18);
  font-family:sans-serif;font-size:12px;color:rgba(255,255,255,.4);
  background:rgba(47,42,36,.3);
}}
.pb{{display:flex;gap:4px}}
.pbb{{
  padding:3px 9px;border-radius:5px;font-size:12px;cursor:pointer;
  font-family:sans-serif;
  background:rgba(255,251,245,.08);color:rgba(255,255,255,.6);
  border:1px solid rgba(255,255,255,.1);
  transition:var(--tr);
}}
.pbb:hover{{border-color:rgba(236,106,55,.5);color:var(--or)}}
.pbb.on{{background:var(--or);color:#fff;border-color:var(--or);box-shadow:0 2px 8px rgba(236,106,55,.4)}}

/* ── Side panel ──────────────────────────────────── */
.po{{position:fixed;inset:0;z-index:300;display:none}}
.po.on{{display:block}}
.pbg{{position:absolute;inset:0;background:rgba(0,0,0,.5);backdrop-filter:blur(2px);animation:fadein .25s ease}}
@keyframes fadein{{from{{opacity:0}}to{{opacity:1}}}}
.panel{{
  position:absolute;right:0;top:0;bottom:0;width:440px;
  background:rgba(251,248,243,.92);
  backdrop-filter:var(--blur-s);
  -webkit-backdrop-filter:var(--blur-s);
  border-left:1px solid rgba(255,255,255,.25);
  box-shadow:-8px 0 48px rgba(0,0,0,.3);
  overflow-y:auto;display:flex;flex-direction:column;
  animation:slideIn .28s cubic-bezier(.4,0,.2,1);
}}
@keyframes slideIn{{from{{transform:translateX(100%)}}to{{transform:translateX(0)}}}}
.ph{{
  padding:18px 20px 14px;
  border-bottom:1px solid rgba(209,193,177,.3);
  display:flex;align-items:flex-start;justify-content:space-between;
  background:rgba(47,42,36,.88);
  backdrop-filter:blur(12px);
  color:#fff;
}}
.ph-firma{{font-size:16px;font-weight:bold;line-height:1.3}}
.ph-sub{{font-size:12px;color:#B0A898;margin-top:3px;font-family:sans-serif}}
.pb2{{padding:18px 20px;flex:1}}
.pf{{
  padding:13px 20px;
  border-top:1px solid rgba(209,193,177,.3);
  display:flex;gap:7px;flex-wrap:wrap;
  background:rgba(245,242,236,.6);
  backdrop-filter:blur(8px);
}}
.ir{{display:flex;gap:8px;margin-bottom:9px;align-items:flex-start;font-family:sans-serif;font-size:13px}}
.il{{color:var(--st);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.4px;min-width:86px;padding-top:1px;flex-shrink:0}}
.iv{{color:var(--ch);flex:1;word-break:break-word}}
.iv a{{color:var(--bl);text-decoration:none}}.iv a:hover{{color:var(--or)}}
.sh{{font-size:10px;font-weight:700;color:var(--st);text-transform:uppercase;letter-spacing:.8px;font-family:sans-serif;margin:14px 0 8px;padding-bottom:4px;border-bottom:1px solid rgba(209,193,177,.4)}}
.tblk{{background:rgba(245,242,236,.7);border:1px solid rgba(209,193,177,.4);border-radius:var(--radius-sm);padding:10px 13px;margin-bottom:8px;font-family:sans-serif;font-size:13px}}
.tbl-l{{font-size:10px;font-weight:700;color:var(--st);text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}}
.pills{{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px}}
.pill{{padding:3px 9px;border-radius:20px;font-size:11px;font-family:sans-serif;font-weight:600}}
.py{{background:rgba(60,90,42,.12);color:var(--pn);border:1px solid rgba(60,90,42,.2)}}
.pn2{{background:rgba(192,57,43,.08);color:var(--rd);border:1px solid rgba(192,57,43,.15)}}

/* ── Modal ───────────────────────────────────────── */
.ovl{{
  position:fixed;inset:0;
  background:rgba(0,0,0,.6);
  backdrop-filter:blur(4px);
  z-index:400;display:none;
  align-items:center;justify-content:center;padding:20px;
}}
.ovl.on{{display:flex}}
.modal{{
  background:rgba(251,248,243,.94);
  backdrop-filter:var(--blur-s);
  -webkit-backdrop-filter:var(--blur-s);
  border:1px solid rgba(255,255,255,.3);
  border-radius:var(--radius);
  width:100%;max-width:540px;max-height:90vh;overflow-y:auto;
  box-shadow:0 24px 64px rgba(0,0,0,.35);
  animation:modalIn .25s cubic-bezier(.4,0,.2,1);
}}
@keyframes modalIn{{from{{opacity:0;transform:scale(.96) translateY(8px)}}to{{opacity:1;transform:scale(1) translateY(0)}}}}
.mh{{padding:18px 22px 0;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(209,193,177,.35);padding-bottom:12px;margin-bottom:16px}}
.mh h2{{font-size:16px;font-weight:bold;color:var(--ch)}}
.mb{{padding:0 22px 16px}}
.mf{{padding:12px 22px;border-top:1px solid rgba(209,193,177,.35);display:flex;gap:8px;justify-content:flex-end}}
.fr{{margin-bottom:13px}}
.fr2{{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:13px}}
label{{display:block;font-size:11px;font-weight:600;color:var(--st);margin-bottom:4px;font-family:sans-serif;text-transform:uppercase;letter-spacing:.4px}}
input[type=text],input[type=tel],input[type=date],input[type=email],select.fs2,textarea{{
  width:100%;padding:8px 12px;
  border:1px solid rgba(209,193,177,.5);
  border-radius:var(--radius-sm);
  background:rgba(255,255,255,.8);
  font-size:13px;color:var(--ch);font-family:sans-serif;
  outline:none;transition:var(--tr);
}}
input:focus,select.fs2:focus,textarea:focus{{border-color:var(--or);background:#fff;box-shadow:0 0 0 3px rgba(236,106,55,.1)}}
textarea{{resize:vertical;min-height:68px}}

/* ── Import drop zone ────────────────────────────── */
.dz{{
  border:2px dashed rgba(209,193,177,.5);border-radius:var(--radius-sm);
  padding:28px;text-align:center;cursor:pointer;
  font-family:sans-serif;color:var(--st);
  transition:var(--tr);
}}
.dz:hover,.dz.drag{{border-color:var(--or);background:rgba(236,106,55,.05)}}
.ih{{font-size:12px;color:var(--st);margin-top:10px;font-family:sans-serif;line-height:1.6;background:rgba(245,242,236,.8);padding:9px 13px;border-radius:var(--radius-sm);border:1px solid rgba(209,193,177,.4)}}
.ih code{{background:rgba(209,193,177,.4);padding:1px 5px;border-radius:3px;font-size:11px}}

/* ── Toast ───────────────────────────────────────── */
.toast{{
  position:fixed;bottom:24px;right:24px;
  background:rgba(47,42,36,.9);
  backdrop-filter:var(--blur);
  color:#fff;padding:10px 18px;
  border-radius:var(--radius-sm);
  font-family:sans-serif;font-size:13px;
  z-index:9999;display:none;
  box-shadow:var(--shadow);
  border:1px solid rgba(255,255,255,.1);
  border-left:3px solid var(--or);
}}
.toast.on{{display:block;animation:toastIn .25s cubic-bezier(.4,0,.2,1)}}
@keyframes toastIn{{from{{opacity:0;transform:translateY(10px) scale(.97)}}to{{opacity:1;transform:translateY(0) scale(1)}}}}

@media(max-width:1100px){{.stats{{grid-template-columns:repeat(4,1fr)}}}}
@media(max-width:700px){{main{{padding:12px 14px}};header{{padding:0 16px}}}}
</style>
</head>
<body>
<div class="bg-canvas"></div>
<div class="bg-orbs">
  <div class="orb orb1"></div>
  <div class="orb orb2"></div>
  <div class="orb orb3"></div>
</div>
<div class="app">
<header>
  <a class="logo" href="#">
    <svg class="logo-icon" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">{svg_inner}</svg>
    <div class="logo-text">RAIS <em>CRM</em></div>
  </a>
  <div class="hactions">
    <button class="btn bs" onclick="openImport()">CSV importieren</button>
    <button class="btn bs" onclick="exportCSV()">Exportieren</button>
    <button class="btn bp" onclick="openAdd()">+ Kontakt</button>
  </div>
</header>
<main>
  <div id="banner" class="banner">
    <span>📞</span>
    <span><strong id="bannerC">0</strong> Follow-up(s) heute oder überfällig</span>
    <button class="btn bs bsm" onclick="filterDue()">Nur diese</button>
  </div>
  <div class="stats">
    <div class="stat on" id="s-all" onclick="setF('all')"><span class="sn" id="c-all">0</span><span class="sl">Gesamt</span></div>
    <div class="stat" id="s-neu" onclick="setF('neu')"><span class="sn" id="c-neu">0</span><span class="sl">Neu</span></div>
    <div class="stat" id="s-ni" onclick="setF('nicht_erreicht')"><span class="sn" id="c-ni">0</span><span class="sl">Nicht erreicht</span></div>
    <div class="stat" id="s-fu" onclick="setF('followup')"><span class="sn" id="c-fu">0</span><span class="sl">Follow-up</span></div>
    <div class="stat" id="s-in" onclick="setF('interessiert')"><span class="sn" id="c-in">0</span><span class="sl">Interessiert</span></div>
    <div class="stat" id="s-te" onclick="setF('termin')"><span class="sn" id="c-te">0</span><span class="sl">Termin</span></div>
    <div class="stat" id="s-gk" onclick="setF('gatekeeper')"><span class="sn" id="c-gk">0</span><span class="sl">Gatekeeper</span></div>
    <div class="stat" id="s-ki" onclick="setF('kein_interesse')"><span class="sn" id="c-ki">0</span><span class="sl">Kein Interesse</span></div>
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
      <option value="fu">Follow-up ↑</option>
      <option value="roi">ROI ↓</option>
      <option value="name">Firma A–Z</option>
      <option value="rev">Reviews ↓</option>
      <option value="new">Zuletzt hinzugefügt</option>
    </select>
  </div>
  <div class="tw">
    <table>
      <thead><tr>
        <th>Firma</th><th>Ansprechpartner</th><th>Telefon</th>
        <th>ROI</th><th>Status</th><th>Follow-up</th>
        <th>T1 / Notiz</th><th>Reviews</th><th style="width:64px"></th>
      </tr></thead>
      <tbody id="tbody"></tbody>
    </table>
    <div id="empty" class="empty" style="display:none">
      <div style="font-size:32px;margin-bottom:10px;opacity:.5">&#128203;</div>
      <h3>Keine Einträge</h3>
      <p>Filter anpassen oder + Kontakt klicken.</p>
    </div>
    <div class="tf"><span id="rc">0</span><div class="pb" id="pb"></div></div>
  </div>
</main>
</div>

<!-- Side panel -->
<div class="po" id="po">
  <div class="pbg" onclick="closeP()"></div>
  <div class="panel">
    <div class="ph">
      <div><div class="ph-firma" id="pFirma"></div><div class="ph-sub" id="pSub"></div></div>
      <button class="btn bg2" onclick="closeP()">✕</button>
    </div>
    <div class="pb2" id="pBody"></div>
    <div class="pf" id="pFoot"></div>
  </div>
</div>

<!-- Edit modal -->
<div class="ovl" id="eo">
  <div class="modal">
    <div class="mh"><h2 id="mt">Kontakt bearbeiten</h2><button class="btn bg2" style="color:var(--st)" onclick="closeE()">✕</button></div>
    <div class="mb">
      <input type="hidden" id="eid">
      <div class="fr2"><div><label>Firma *</label><input type="text" id="ef"></div><div><label>Ansprechpartner</label><input type="text" id="ek"></div></div>
      <div class="fr2"><div><label>Titel</label><input type="text" id="etit"></div><div><label>Telefon</label><input type="tel" id="et"></div></div>
      <div class="fr2"><div><label>E-Mail</label><input type="email" id="em"></div><div><label>Website</label><input type="text" id="ew"></div></div>
      <div class="fr2">
        <div><label>Status</label><select class="fs2" id="es">
          <option value="neu">Neu</option><option value="nicht_erreicht">Nicht erreicht</option>
          <option value="gatekeeper">Gatekeeper</option><option value="followup">Follow-up</option>
          <option value="interessiert">Interessiert</option><option value="termin">Termin vereinbart</option>
          <option value="in_bearbeitung">In Bearbeitung</option><option value="kein_interesse">Kein Interesse</option>
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
    <div class="mf"><button class="btn bs-dark" onclick="closeE()">Abbrechen</button><button class="btn bp" onclick="save()">Speichern</button></div>
  </div>
</div>

<!-- Import modal -->
<div class="ovl" id="io">
  <div class="modal">
    <div class="mh"><h2>CSV importieren</h2><button class="btn bg2" style="color:var(--st)" onclick="closeI()">✕</button></div>
    <div class="mb">
      <div class="dz" id="dz" onclick="document.getElementById('cf').click()" ondragover="dzOv(event)" ondragleave="dzLv()" ondrop="dzDr(event)">
        <div style="font-size:26px;margin-bottom:8px">&#128194;</div>
        <strong>CSV hier ablegen</strong> oder klicken
        <input type="file" id="cf" accept=".csv" style="display:none" onchange="rdCSV(event)">
      </div>
      <div class="ih">Spalten: <code>Firma</code> <code>Ansprechpartner</code> <code>Telefon</code> <code>Status</code> <code>Follow-up</code> <code>Notiz</code><br>Excel: Datei → Speichern als CSV UTF-8</div>
      <div id="ip" style="margin-top:10px"></div>
    </div>
    <div class="mf"><button class="btn bs-dark" onclick="closeI()">Abbrechen</button><button class="btn bp" id="ib" style="display:none" onclick="doImport()">Importieren</button></div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const EMBED=DATA_PLACEHOLDER;
const KEY='rais_crm_v2';
let contacts=[],flt='all',pg=1,PG=30,ibuf=[],dueMode=false,eid=null;

function load(){{try{{const s=JSON.parse(localStorage.getItem(KEY));contacts=s&&s.length?s:EMBED.map(c=>{{return{{...c}}}})}}catch{{contacts=EMBED.map(c=>{{return{{...c}}}})}}}}
function persist(){{localStorage.setItem(KEY,JSON.stringify(contacts));}}
function gid(){{return Date.now().toString(36)+Math.random().toString(36).slice(2,5);}}
function td(){{return new Date().toISOString().slice(0,10);}}

const SM={{neu:['b-neu','Neu'],nicht_erreicht:['b-ni','Nicht erreicht'],followup:['b-fu','Follow-up'],interessiert:['b-in','Interessiert'],termin:['b-te','Termin'],gatekeeper:['b-gk','Gatekeeper'],in_bearbeitung:['b-ib','In Bearb.'],kein_interesse:['b-ki','Kein Interesse']}};

function sbadge(s){{const[c,l]=SM[s]||['b-neu',s||'Neu'];return`<span class="badge ${{c}}">${{l}}</span>`;}}
function roib(n){{const c=n>=3?'r3':n>=2?'r2':'r1';return`<span class="roi ${{c}}">${{n||1}}</span>`;}}
function fdc(d){{if(!d)return'<span style="color:rgba(255,255,255,.2);font-family:sans-serif;font-size:12px">—</span>';const t=td();let c='fdup',x=d;if(d<t){{c='fdov';x='⚠ '+d;}}if(d===t){{c='fdtd';x='📞 Heute';}}return`<span class="fd ${{c}}">${{x}}</span>`;}}
function esc(s){{return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}}

function getList(){{
  const q=document.getElementById('srch').value.toLowerCase();
  const roi=document.getElementById('roiF').value;
  const srt=document.getElementById('sortS').value;
  let list=contacts.filter(c=>{{
    if(flt!=='all'&&c.status!==flt)return false;
    if(roi&&String(c.roi||1)!==roi)return false;
    if(dueMode){{const t=td();return c.followup&&c.followup<=t;}}
    if(q){{const h=[c.firma,c.kontakt,c.hauptleistung,c.t1_status,c.besonderheit,c.notiz].join(' ').toLowerCase();if(!h.includes(q))return false;}}
    return true;
  }});
  list=list.slice().sort((a,b)=>{{
    if(srt==='name')return(a.firma||'').localeCompare(b.firma||'');
    if(srt==='roi')return(b.roi||0)-(a.roi||0);
    if(srt==='rev')return(parseInt(b.reviews)||0)-(parseInt(a.reviews)||0);
    if(srt==='new')return(b.created||0)-(a.created||0);
    const da=a.followup||'9999',db=b.followup||'9999';return da.localeCompare(db);
  }});
  return list;
}}

function setF(f){{flt=f;pg=1;dueMode=false;document.querySelectorAll('.stat').forEach(el=>el.classList.remove('on'));const id={{all:'s-all',neu:'s-neu',nicht_erreicht:'s-ni',followup:'s-fu',interessiert:'s-in',termin:'s-te',gatekeeper:'s-gk',kein_interesse:'s-ki'}}[f];if(id)document.getElementById(id).classList.add('on');render();}}
function filterDue(){{dueMode=true;pg=1;render();}}

function render(){{
  const t=td();
  const cnt={{all:contacts.length}};for(const k of Object.keys(SM))cnt[k]=contacts.filter(c=>c.status===k).length;
  document.getElementById('c-all').textContent=cnt.all;
  document.getElementById('c-neu').textContent=cnt.neu||0;
  document.getElementById('c-ni').textContent=cnt.nicht_erreicht||0;
  document.getElementById('c-fu').textContent=cnt.followup||0;
  document.getElementById('c-in').textContent=cnt.interessiert||0;
  document.getElementById('c-te').textContent=cnt.termin||0;
  document.getElementById('c-gk').textContent=cnt.gatekeeper||0;
  document.getElementById('c-ki').textContent=cnt.kein_interesse||0;
  const due=contacts.filter(c=>c.followup&&c.followup<=t).length;
  document.getElementById('banner').classList.toggle('on',due>0);
  document.getElementById('bannerC').textContent=due;
  const list=getList();const tot=list.length;
  const pages=Math.max(1,Math.ceil(tot/PG));if(pg>pages)pg=pages;
  const sl=list.slice((pg-1)*PG,pg*PG);
  const tbody=document.getElementById('tbody');
  const empty=document.getElementById('empty');
  if(!sl.length){{tbody.innerHTML='';empty.style.display='block';}}
  else{{
    empty.style.display='none';
    tbody.innerHTML=sl.map((c,i)=>{{
      const ovr=c.followup&&c.followup<t?' ov':'';
      const note=(c.t1_status||c.besonderheit||c.notiz||'').slice(0,55);
      return`<tr class="${{ovr}}" style="animation-delay:${{i*0.025}}s" onclick="openP('${{c.id}}')">
        <td class="fc">${{esc(c.firma)}}</td>
        <td style="color:rgba(47,42,36,.8)">${{esc(c.kontakt||'—')}}</td>
        <td><a href="tel:${{esc(c.telefon)}}" onclick="event.stopPropagation()" style="color:#5B9ED6;text-decoration:none;font-family:monospace;font-size:12.5px">${{esc(c.telefon||'—')}}</a></td>
        <td>${{roib(c.roi)}}</td>
        <td>${{sbadge(c.status)}}</td>
        <td>${{fdc(c.followup)}}</td>
        <td class="nc" title="${{esc(c.t1_status||'')+' '+esc(c.besonderheit||'')}}">${{esc(note)}}${{note.length===55?'…':''}}</td>
        <td style="font-family:sans-serif;font-size:12px;color:var(--st)">${{c.reviews||'—'}}</td>
        <td onclick="event.stopPropagation()"><div class="ra">
          <button class="btn bg2 bsm" onclick="openE('${{c.id}}')">✏️</button>
          <button class="btn bg2 bsm" onclick="del('${{c.id}}')">🗑</button>
        </div></td>
      </tr>`;
    }}).join('');
  }}
  document.getElementById('rc').textContent=tot===contacts.length?`${{tot}} Einträge`:`${{tot}} von ${{contacts.length}}`;
  const pb=document.getElementById('pb');
  pb.innerHTML=pages<=1?'':Array.from({{length:pages}},(_,i)=>i+1).map(p=>`<button class="pbb${{p===pg?' on':''}}" onclick="goPg(${{p}})">${{p}}</button>`).join('');
}}
function goPg(p){{pg=p;render();}}

function openP(id){{
  const c=contacts.find(x=>x.id===id);if(!c)return;
  document.getElementById('pFirma').textContent=c.firma;
  document.getElementById('pSub').textContent=[c.title,c.kontakt].filter(Boolean).join(' · ');
  const wsOk=c.webseite_vorhanden==='TRUE'||c.webseite_vorhanden===true;
  const kalk=c.hat_kalkulator==='TRUE'||c.hat_kalkulator===true;
  document.getElementById('pBody').innerHTML=`
    <div class="sh">Kontakt</div>
    ${{ir('Telefon',c.telefon?`<a href="tel:${{esc(c.telefon)}}">${{esc(c.telefon)}}</a>`:'—')}}
    ${{ir('E-Mail',c.email?`<a href="mailto:${{esc(c.email)}}">${{esc(c.email)}}</a>`:'—')}}
    ${{ir('Website',c.website?`<a href="${{esc(c.website)}}" target="_blank" rel="noopener">${{esc(c.website.replace(/^https?:\\/\\//,''))}}</a>`:'—')}}
    ${{c.facebook?ir('Facebook',`<a href="${{esc(c.facebook)}}" target="_blank" rel="noopener">Profil öffnen</a>`):''}}
    <div class="sh">Status</div>
    ${{ir('Status',sbadge(c.status))}}
    ${{ir('ROI',roib(c.roi))}}
    ${{ir('Follow-up',fdc(c.followup))}}
    <div class="sh">Touch History</div>
    <div class="tblk"><div class="tbl-l">Touch 1</div>
      ${{c.t1_status?`<div style="color:var(--ch)">${{esc(c.t1_status)}}</div>`:'<div style="color:var(--st)">Noch nicht kontaktiert</div>'}}
      ${{c.t1_datum?`<div style="font-size:12px;color:var(--st);margin-top:2px">${{c.t1_datum}}</div>`:''}}
      ${{c.t1_einwand?`<div style="font-size:12px;color:var(--ch);margin-top:2px">Einwand: ${{esc(c.t1_einwand)}}</div>`:''}}
    </div>
    ${{c.besonderheit?`<div class="sh">Website-Analyse</div><div style="font-family:sans-serif;font-size:13px;color:var(--ch);background:rgba(245,242,236,.7);border:1px solid rgba(209,193,177,.4);border-radius:8px;padding:10px 13px;line-height:1.6;margin-bottom:8px">${{esc(c.besonderheit)}}</div>`:''}}
    <div class="sh">Website-Info</div>
    ${{ir('Alter',c.webseite_alter||'—')}}
    ${{ir('Leistung',c.hauptleistung||'—')}}
    ${{ir('Reviews',c.reviews||'—')}}
    <div class="ir"><span class="il">Website</span><div class="iv"><div class="pills">
      <span class="pill ${{wsOk?'py':'pn2'}}">${{wsOk?'✓ vorhanden':'✗ keine Website'}}</span>
      <span class="pill ${{kalk?'py':'pn2'}}">${{kalk?'✓ Kalkulator':'✗ kein Kalkulator'}}</span>
    </div></div></div>
  `;
  document.getElementById('pFoot').innerHTML=`
    <button class="btn bp bsm" onclick="openE('${{id}}');closeP()">Bearbeiten</button>
    <button class="btn bs-dark bsm" onclick="qs('${{id}}','nicht_erreicht')">📵 No Show</button>
    <button class="btn bs-dark bsm" onclick="qs('${{id}}','interessiert')">✓ Interessiert</button>
    <button class="btn bs-dark bsm" onclick="qs('${{id}}','termin')">📅 Termin</button>
    <button class="btn bs-dark bsm" onclick="qs('${{id}}','kein_interesse')">✗ Kein Interesse</button>
  `;
  document.getElementById('po').classList.add('on');
}}
function ir(l,v){{return`<div class="ir"><span class="il">${{l}}</span><div class="iv">${{v}}</div></div>`;}}
function closeP(){{document.getElementById('po').classList.remove('on');}}
function qs(id,s){{const c=contacts.find(x=>x.id===id);if(!c)return;c.status=s;persist();render();closeP();toast('Status: '+(SM[s]?.[1]||s));}}

function openAdd(){{eid=null;document.getElementById('mt').textContent='Kontakt hinzufügen';clrF();const tm=new Date();tm.setDate(tm.getDate()+1);document.getElementById('efu').value=tm.toISOString().slice(0,10);document.getElementById('eo').classList.add('on');}}
function openE(id){{const c=contacts.find(x=>x.id===id);if(!c)return;eid=id;document.getElementById('mt').textContent='Kontakt bearbeiten';document.getElementById('ef').value=c.firma||'';document.getElementById('ek').value=c.kontakt||'';document.getElementById('etit').value=c.title||'';document.getElementById('et').value=c.telefon||'';document.getElementById('em').value=c.email||'';document.getElementById('ew').value=c.website||'';document.getElementById('es').value=c.status||'neu';document.getElementById('efu').value=c.followup||'';document.getElementById('er').value=String(c.roi||1);document.getElementById('erev').value=c.reviews||'';document.getElementById('et1').value=c.t1_status||'';document.getElementById('en').value=c.besonderheit||c.notiz||'';document.getElementById('eo').classList.add('on');}}
function closeE(){{document.getElementById('eo').classList.remove('on');clrF();}}
function clrF(){{['ef','ek','etit','et','em','ew','efu','erev','et1','en'].forEach(i=>{{const el=document.getElementById(i);if(el)el.value=''}});document.getElementById('es').value='neu';document.getElementById('er').value='1';}}
function save(){{
  const f=document.getElementById('ef').value.trim();if(!f){{toast('Firma fehlt.');return;}}
  const d={{firma:f,kontakt:document.getElementById('ek').value.trim(),title:document.getElementById('etit').value.trim(),telefon:document.getElementById('et').value.trim(),email:document.getElementById('em').value.trim(),website:document.getElementById('ew').value.trim(),status:document.getElementById('es').value,followup:document.getElementById('efu').value,roi:parseInt(document.getElementById('er').value)||1,reviews:document.getElementById('erev').value.trim(),t1_status:document.getElementById('et1').value.trim(),besonderheit:document.getElementById('en').value.trim(),notiz:document.getElementById('en').value.trim(),gewerk:'Fliesenleger'}};
  if(eid){{const i=contacts.findIndex(c=>c.id===eid);if(i>=0)contacts[i]={{...contacts[i],...d}};}}
  else contacts.push({{id:gid(),created:Date.now(),...d}});
  persist();closeE();render();toast(eid?'Gespeichert.':'Kontakt hinzugefügt.');
}}
function del(id){{if(!confirm('Löschen?'))return;contacts=contacts.filter(c=>c.id!==id);persist();render();toast('Gelöscht.');}}

function openImport(){{ibuf=[];document.getElementById('ip').innerHTML='';document.getElementById('ib').style.display='none';document.getElementById('cf').value='';document.getElementById('io').classList.add('on');}}
function closeI(){{document.getElementById('io').classList.remove('on');}}
function dzOv(e){{e.preventDefault();document.getElementById('dz').classList.add('drag');}}
function dzLv(){{document.getElementById('dz').classList.remove('drag');}}
function dzDr(e){{e.preventDefault();dzLv();rdFile(e.dataTransfer.files[0]);}}
function rdCSV(e){{rdFile(e.target.files[0]);}}
function rdFile(f){{if(!f)return;const r=new FileReader();r.onload=e=>parseCSV(e.target.result);r.readAsText(f,'UTF-8');}}
function parseCSV(txt){{
  const lines=txt.replace(/\\r/g,'').split('\\n').filter(l=>l.trim());
  if(lines.length<2){{toast('Leer.');return;}}
  const heads=spl(lines[0]).map(h=>h.trim().toLowerCase());
  const ci=n=>heads.findIndex(h=>h.includes(n));
  const iF=ci('firma'),iK=ci('ansprechpartner')>=0?ci('ansprechpartner'):ci('kontakt'),iT=ci('telefon')>=0?ci('telefon'):ci('tel'),iS=ci('status'),iFu=ci('follow');
  if(iF<0){{toast('Keine Firma-Spalte.');return;}}
  const sm2={{interessiert:'interessiert',termin:'termin',followup:'followup','follow-up':'followup','nicht erreicht':'nicht_erreicht',nicht_erreicht:'nicht_erreicht','no show':'nicht_erreicht',gatekeeper:'gatekeeper','kein interesse':'kein_interesse'}};
  ibuf=lines.slice(1).map(l=>{{const c=spl(l);const g=i=>i>=0?(c[i]||'').trim():'';const rs=g(iS).toLowerCase();return{{id:gid(),created:Date.now(),firma:g(iF),kontakt:g(iK),telefon:g(iT),status:sm2[rs]||'neu',followup:g(iFu),roi:1,gewerk:'Fliesenleger'}}}}).filter(c=>c.firma);
  document.getElementById('ip').innerHTML=`<div style="font-family:sans-serif;font-size:13px;color:var(--sg);font-weight:600">✓ ${{ibuf.length}} Kontakte erkannt</div>`;
  document.getElementById('ib').style.display='inline-flex';
}}
function spl(l){{const r=[];let c='',q=false;for(let i=0;i<l.length;i++){{const ch=l[i];if(ch==='"'){{q=!q;continue;}}if((ch===','||ch===';')&&!q){{r.push(c);c='';continue;}}c+=ch;}}r.push(c);return r;}}
function doImport(){{if(!ibuf.length)return;contacts=[...contacts,...ibuf];persist();closeI();render();toast(`${{ibuf.length}} importiert.`);ibuf=[];}}

function exportCSV(){{
  const h=['Firma','Kontakt','Titel','Telefon','Email','Website','ROI','Status','Follow-up','T1','Reviews','Leistung','Besonderheit'];
  const rows=contacts.map(c=>[c.firma,c.kontakt,c.title,c.telefon,c.email,c.website,c.roi,c.status,c.followup,c.t1_status,c.reviews,c.hauptleistung,c.besonderheit].map(v=>`"${{(v||'').toString().replace(/"/g,'""')}}"`));
  const csv=[h.join(','),...rows.map(r=>r.join(','))].join('\\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\\ufeff'+csv],{{type:'text/csv;charset=utf-8'}}));a.download=`RAIS_CRM_${{td()}}.csv`;a.click();toast('Export.');
}}

function toast(m){{const el=document.getElementById('toast');el.textContent=m;el.classList.add('on');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('on'),2600);}}

document.addEventListener('keydown',e=>{{if(e.key==='Escape'){{closeP();closeE();closeI();}}if(e.key==='n'&&!e.ctrlKey&&!e.metaKey&&document.activeElement.tagName==='BODY')openAdd();}});

load();render();
</script>
</body>
</html>"""

html_out = HTML.replace('DATA_PLACEHOLDER', DATA_JSON)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html_out)

size_kb = len(html_out.encode('utf-8')) // 1024
print(f"Done — {size_kb} KB")
