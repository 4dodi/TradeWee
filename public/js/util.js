/* ============ Utilitaires partagés ============ */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

/* URL externe sûre : uniquement http(s), sinon '#' (bloque javascript:, data:…) */
function safeUrl(u) {
  try {
    const url = new URL(String(u || ''), location.href);
    return (url.protocol === 'https:' || url.protocol === 'http:') ? url.href : '#';
  } catch { return '#'; }
}

/* Mini rendu markdown (gras, titres, listes, code) — l'entrée est échappée d'abord */
function mdToHtml(raw) {
  const lines = esc(raw).split(/\r?\n/);
  let html = '', inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { html += '</ul>'; inUl = false; } if (inOl) { html += '</ol>'; inOl = false; } };
  const inline = (t) => t
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
  for (let line of lines) {
    const t = line.trim();
    if (!t) { closeLists(); continue; }
    let m;
    if ((m = t.match(/^#{1,4}\s+(.*)$/))) { closeLists(); html += `<h4>${inline(m[1])}</h4>`; }
    else if ((m = t.match(/^[-•*]\s+(.*)$/))) { if (inOl) { html += '</ol>'; inOl = false; } if (!inUl) { html += '<ul>'; inUl = true; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) { if (inUl) { html += '</ul>'; inUl = false; } if (!inOl) { html += '<ol>'; inOl = true; } html += `<li>${inline(m[1])}</li>`; }
    else { closeLists(); html += `<p>${inline(t)}</p>`; }
  }
  closeLists();
  return html;
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { 'Content-Type': 'application/json', 'X-Lang': LANG },
    ...opts
  });
  let j = null;
  try { j = await r.json(); } catch { /* réponse non JSON */ }
  if (!r.ok) throw new Error((j && j.error) || t('Erreur {n}', { n: r.status }));
  return j;
}

function fmtNum(v) {
  if (v === null || v === undefined || v === '' || Number.isNaN(Number(v))) return '—';
  const n = Number(v);
  const dec = Math.abs(n) >= 1000 ? 2 : Math.abs(n) >= 10 ? 3 : Math.abs(n) >= 1 ? 4 : 5;
  return n.toLocaleString(LOCALE, { minimumFractionDigits: 0, maximumFractionDigits: dec });
}

function timeAgo(iso) {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return t('à l’instant');
  if (s < 3600) return t('il y a {n} min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('il y a {n} h', { n: Math.floor(s / 3600) });
  return t('il y a {n} j', { n: Math.floor(s / 86400) });
}

const TYPE_LABELS = { forex: t('Forex'), crypto: t('Crypto'), index: t('Indice'), action: t('Action'), commodity: t('Matière 1ère') };
/* Libellés affichés des valeurs internes (stockées en français) */
const BIAS_LABELS = { ACHAT: t('ACHAT'), VENTE: t('VENTE'), NEUTRE: t('NEUTRE') };
const biasLabel = (b) => BIAS_LABELS[b] || b;
const CCY_FLAGS = { USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧', JPY: '🇯🇵', CHF: '🇨🇭', AUD: '🇦🇺', CAD: '🇨🇦', CNY: '🇨🇳', NZD: '🇳🇿', ALL: '🌍' };

/* État global partagé */
window.APP = {
  settings: null,
  assets: [],
  analyses: [],
  currentAnalysis: null,
  pendingImages: [] // { name, dataUrl }
};
