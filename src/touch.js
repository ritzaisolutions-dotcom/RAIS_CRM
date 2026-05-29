import { S, TSCLS } from './state.js';
import { markDirty, persist, pushDirty } from './sync.js';
import { esc, toast } from './ui.js';
import { openP } from './prospecting.js';

export function toggleAcc(el) {
  const tah = el.closest ? el : el;
  const idx = tah.id.replace('tah-','');
  const tab = document.getElementById('tab-' + idx);
  if (!tab) return;
  const open = tab.classList.toggle('on');
  tah.classList.toggle('open', open);
}

export function saveTF(id, idx, field, val) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c) return;
  if (!c.touches) c.touches = [];
  while (c.touches.length <= idx) c.touches.push({status:'',datum:'',notiz:''});
  c.touches[idx][field] = val;
  markDirty(c);
  persist(); pushDirty();
  const tah = document.getElementById('tah-' + idx);
  if (tah) {
    const t = c.touches[idx];
    const sc = TSCLS[t.status] || 'ki';
    const bdg = t.status ? '<span class="badge b-' + sc + '" style="font-size:10px;padding:1px 6px">' + esc(t.status) + '</span>' : '<span style="font-family:sans-serif;font-size:11px;color:#7B746B;font-style:italic">—</span>';
    const wasOpen = tah.classList.contains('open');
    tah.innerHTML =
      '<span style="font-weight:700;font-size:11px;font-family:sans-serif;min-width:22px;color:var(--st)">T' + (idx+1) + '</span>' +
      bdg +
      '<span style="font-family:monospace;font-size:11px;color:#7B746B;margin-left:auto;margin-right:6px">' + esc(t.datum||'') + '</span>' +
      '<span class="ta-arrow">&#9660;</span>';
    if (wasOpen) tah.classList.add('open');
  }
  toast('Touch ' + (idx + 1) + ' gespeichert.');
}

export function addTouch(id) {
  const c = S.contacts.find(function(x) { return x.id === id; });
  if (!c || (c.touches && c.touches.length >= 10)) return;
  if (!c.touches) c.touches = [];
  c.touches.push({status:'',datum:'',notiz:''});
  markDirty(c);
  persist(); pushDirty();
  openP(id);
  setTimeout(function() {
    const tah = document.getElementById('tah-' + (c.touches.length - 1));
    if (tah) toggleAcc(tah);
  }, 30);
}
