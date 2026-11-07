/* U2 · The Greatest Show On Earth World Tour
 * - Pinta las fechas guardadas (base incluida + caché en localStorage).
 * - En cada carga consulta https://www.u2.com/pages/tours, detecta fechas nuevas y las añade.
 *
 * Nota: el navegador no puede leer u2.com directamente (CORS), así que se usa un proxy CORS.
 * Si tienes uno propio, ponlo primero en PROXIES. {url} se sustituye por la URL codificada.
 */

const SOURCE_URL = 'https://www.u2.com/pages/tours';
const PROXIES = [
  'tours.json',                        // generado por la GitHub Action (funciona en GitHub Pages)
  'http://localhost:3000/api/tours',   // servidor propio (node server.js), para uso local
  'https://api.allorigins.win/raw?url={url}',
  'https://corsproxy.io/?url={url}',
];
const START_YEAR = 2027;          // año de la primera fecha de la lista
const NEW_BADGE_DAYS = 7;         // cuánto tiempo se muestra la etiqueta NUEVO
const STORE_KEY = 'u2tour.v1';

// ---------- Datos base (u2.com, 7 nov 2026) ----------
const BASE = [
  ['2027-02-23', 'Mexico City', 'Estadio GNP Seguros', 'MX', true],
  ['2027-02-26', 'Mexico City', 'Estadio GNP Seguros', 'MX', true],
  ['2027-02-28', 'Mexico City', 'Estadio GNP Seguros', 'MX', true],
  ['2027-03-02', 'Mexico City', 'Estadio GNP Seguros', 'MX', false],
  ['2027-03-10', 'São Paulo', 'Estádio MorumBIS', 'BR', true],
  ['2027-03-12', 'São Paulo', 'Estádio MorumBIS', 'BR', true],
  ['2027-03-14', 'São Paulo', 'Estádio MorumBIS', 'BR', true],
  ['2027-03-16', 'São Paulo', 'Estádio MorumBIS', 'BR', false],
  ['2027-03-23', 'Buenos Aires', 'Estadio River Plate', 'AR', true],
  ['2027-03-25', 'Buenos Aires', 'Estadio River Plate', 'AR', true],
  ['2027-03-27', 'Buenos Aires', 'Estadio River Plate', 'AR', true],
  ['2027-04-26', 'Stockholm', 'Strawberry Arena', 'SE', false],
  ['2027-04-28', 'Stockholm', 'Strawberry Arena', 'SE', false],
  ['2027-04-30', 'Stockholm', 'Strawberry Arena', 'SE', false],
  ['2027-05-05', 'Paris', 'Stade de France', 'FR', false],
  ['2027-05-08', 'Paris', 'Stade de France', 'FR', false],
  ['2027-05-09', 'Paris', 'Stade de France', 'FR', false],
  ['2027-05-13', 'Barcelona', 'Estadi Olímpic Lluís Companys', 'ES', false],
  ['2027-05-15', 'Barcelona', 'Estadi Olímpic Lluís Companys', 'ES', false],
  ['2027-05-22', 'Seville', 'Estadio La Cartuja', 'ES', false],
  ['2027-05-27', 'Lisbon', 'Estadio da Luz', 'PT', false],
  ['2027-05-28', 'Lisbon', 'Estadio da Luz', 'PT', false],
  ['2027-06-05', 'Amsterdam', 'Johan Cruijff ArenA', 'NL', false],
  ['2027-06-06', 'Amsterdam', 'Johan Cruijff ArenA', 'NL', false],
  ['2027-06-09', 'Amsterdam', 'Johan Cruijff ArenA', 'NL', false],
  ['2027-06-11', 'Amsterdam', 'Johan Cruijff ArenA', 'NL', false],
  ['2027-06-18', 'London', 'Tottenham Hotspur Stadium', 'GB', false],
  ['2027-06-19', 'London', 'Tottenham Hotspur Stadium', 'GB', false],
  ['2027-06-22', 'London', 'Tottenham Hotspur Stadium', 'GB', false],
  ['2027-06-25', 'London', 'Tottenham Hotspur Stadium', 'GB', false],
  ['2027-06-30', 'Berlin', 'Olympiastadion', 'DE', false],
  ['2027-07-01', 'Berlin', 'Olympiastadion', 'DE', false],
  ['2027-07-05', 'Milan', 'Stadio San Siro', 'IT', false],
  ['2027-07-06', 'Milan', 'Stadio San Siro', 'IT', false],
  ['2027-07-09', 'Milan', 'Stadio San Siro', 'IT', false],
].map(([date, city, venue, cc, soldOut]) => ({ date, city, venue, cc, soldOut }));

// ---------- Utilidades ----------
const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const MONTH_RE = '(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)';
const CITY_ES = {
  'Mexico City': 'Ciudad de México', 'Stockholm': 'Estocolmo', 'Paris': 'París', 'Seville': 'Sevilla',
  'Lisbon': 'Lisboa', 'Amsterdam': 'Ámsterdam', 'London': 'Londres', 'Milan': 'Milán',
};
const LEGS = [
  { id: 'latam', name: 'Latinoamérica', cc: ['MX', 'BR', 'AR', 'CL', 'CO', 'PE', 'UY'] },
  { id: 'na', name: 'Norteamérica', cc: ['US', 'CA'] },
  { id: 'eu', name: 'Europa y Reino Unido', cc: null },   // el resto
];

const slug = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
const showId = s => `${s.date}|${slug(s.city)}`;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function legOf(cc) {
  return LEGS.find(l => l.cc && l.cc.includes(cc)) || LEGS[LEGS.length - 1];
}

// ---------- Parser de u2.com/pages/tours ----------
function htmlToLines(html) {
  const text = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n));
  return text.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function parseTourHtml(html, startYear = START_YEAR) {
  const lines = htmlToLines(html);
  const oneLine = new RegExp(`^(\\d{1,2}) ${MONTH_RE}$`, 'i');
  const monthOnly = new RegExp(`^${MONTH_RE}$`, 'i');

  // Devuelve {day, mon, next} si en la posición i empieza una fecha.
  const dateAt = i => {
    let m = oneLine.exec(lines[i] || '');
    if (m) return { day: +m[1], mon: MONTHS[m[2].toUpperCase()], next: i + 1 };
    if (/^\d{1,2}$/.test(lines[i] || '') && monthOnly.test(lines[i + 1] || '')) {
      return { day: +lines[i], mon: MONTHS[lines[i + 1].toUpperCase()], next: i + 2 };
    }
    return null;
  };

  const out = [];
  let year = startYear, prevMon = 0;
  for (let i = 0; i < lines.length; i++) {
    const d = dateAt(i);
    if (!d) continue;
    const city = lines[d.next];
    const vm = /^(.+),\s*([A-Z]{2})$/.exec(lines[d.next + 1] || '');
    if (!city || !vm) continue;

    let soldOut = false;
    for (let k = d.next + 2; k < Math.min(lines.length, d.next + 10); k++) {
      if (dateAt(k)) break;
      if (/sold\s*out|agotado/i.test(lines[k])) { soldOut = true; break; }
    }

    if (d.mon < prevMon) year++;
    prevMon = d.mon;
    out.push({
      date: `${year}-${String(d.mon).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`,
      city, venue: vm[1].trim(), cc: vm[2], soldOut,
    });
  }
  return out;
}

// ---------- Estado / caché ----------
function loadState() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (raw && raw.shows) return raw;
  } catch (_) { /* sin caché */ }
  const shows = {};
  BASE.forEach(s => { shows[showId(s)] = { ...s, firstSeen: null }; });
  return { shows, lastCheck: null };
}
function saveState(state) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (_) { /* ignorar */ }
}

// Fusiona lo leído en u2.com con el estado. Devuelve las fechas nuevas.
function merge(state, remote) {
  const added = [];
  const now = Date.now();
  remote.forEach(r => {
    const id = showId(r);
    const cur = state.shows[id];
    if (!cur) {
      state.shows[id] = { ...r, firstSeen: now };
      added.push(state.shows[id]);
    } else {
      cur.soldOut = r.soldOut;
      cur.venue = r.venue || cur.venue;
    }
  });
  state.lastCheck = now;
  return added;
}

// ---------- Descarga ----------
async function fetchWithTimeout(url, ms = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.text();
  } finally { clearTimeout(t); }
}

async function fetchRemoteShows() {
  for (const p of PROXIES) {
    try {
      const body = await fetchWithTimeout(p.replace('{url}', encodeURIComponent(SOURCE_URL)));
      // tours.json lo genera la GitHub Action; el resto devuelven el HTML de u2.com
      const shows = p.endsWith('.json') ? (JSON.parse(body).shows || []) : parseTourHtml(body);
      if (shows.length >= 5) return shows;   // lectura razonable
      console.warn('[u2] Respuesta sin fechas reconocibles desde', p);
    } catch (e) { console.warn('[u2] Falló', p, e.message); }
  }
  throw new Error('No se pudo leer u2.com');
}

// ---------- Render ----------
function googleTickets(s) {
  const f = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(s.date + 'T12:00:00'));
  const q = `entradas U2 ${CITY_ES[s.city] || s.city} ${f} ${s.venue}`;
  return 'https://www.google.com/search?q=' + encodeURIComponent(q);
}
function googleMaps(s) {
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(`${s.venue} ${s.city}`);
}

function render(state) {
  const regionNames = new Intl.DisplayNames(['es'], { type: 'region' });
  const dMonth = new Intl.DateTimeFormat('es-ES', { month: 'short' });
  const dDow = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });
  const now = Date.now();

  const shows = Object.values(state.shows).sort((a, b) => a.date.localeCompare(b.date));
  document.getElementById('count').textContent =
    `${shows.length} conciertos · ${new Set(shows.map(s => s.city)).size} ciudades`;

  const groups = LEGS.map(l => ({ leg: l, items: shows.filter(s => legOf(s.cc).id === l.id) })).filter(g => g.items.length);

  document.getElementById('shows').innerHTML = groups.map(({ leg, items }) => `
    <section class="leg">
      <h2>${esc(leg.name)} <span>${items.length} shows</span></h2>
      ${items.map(s => {
        const dt = new Date(s.date + 'T12:00:00');
        const isNew = s.firstSeen && now - s.firstSeen < NEW_BADGE_DAYS * 864e5;
        return `
        <article class="show">
          <div class="date">
            <span class="d">${dt.getDate()}</span>
            <span class="m">${esc(dMonth.format(dt).replace('.', ''))}</span>
            <span class="y">${dt.getFullYear()}</span>
          </div>
          <div class="place">
            <div class="city">${esc(CITY_ES[s.city] || s.city)} <small style="color:var(--muted);font-weight:400;letter-spacing:.1em">· ${esc(regionNames.of(s.cc) || s.cc)}</small></div>
            <div class="venue"><a href="${googleMaps(s)}" target="_blank" rel="noopener" title="Ver en Google Maps">${esc(s.venue)}</a></div>
            <div class="dow">${esc(dDow.format(dt))}</div>
          </div>
          <div class="actions">
            ${isNew ? '<span class="tag new">Nuevo</span>' : ''}
            ${s.soldOut ? '<span class="tag sold">Agotado</span>' : ''}
            <a class="btn ghost" href="${googleMaps(s)}" target="_blank" rel="noopener">Recinto</a>
            <a class="btn" href="${googleTickets(s)}" target="_blank" rel="noopener">Entradas</a>
          </div>
        </article>`;
      }).join('')}
    </section>`).join('');
}

function showNewModal(added) {
  const modal = document.getElementById('modal');
  const fmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const n = added.length;
  document.getElementById('modal-title').textContent = n > 1 ? '¡Fechas nuevas!' : '¡Fecha nueva!';
  document.getElementById('modal-sub').textContent =
    `U2 ha añadido ${n} concierto${n > 1 ? 's' : ''} desde tu última visita.`;
  document.getElementById('modal-list').innerHTML = added
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(s => `<li><b>${esc(CITY_ES[s.city] || s.city)}</b><span>${esc(fmt.format(new Date(s.date + 'T12:00:00')))}<br>${esc(s.venue)}</span></li>`)
    .join('');
  modal.classList.add('open');
  document.getElementById('modal-close').focus();
}
function closeModal() { document.getElementById('modal').classList.remove('open'); }

function setStatus(kind, text) {
  const el = document.getElementById('status');
  el.className = 'status ' + kind;
  document.getElementById('status-text').textContent = text;
}

// ---------- Arranque ----------
async function refresh(state) {
  setStatus('', 'Comprobando u2.com…');
  try {
    const remote = await fetchRemoteShows();
    const added = merge(state, remote);
    saveState(state);
    render(state);
    const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    if (added.length) {
      setStatus('new', `${added.length} fecha${added.length > 1 ? 's' : ''} nueva${added.length > 1 ? 's' : ''} añadida${added.length > 1 ? 's' : ''} · ${hora}`);
      showNewModal(added);
    } else {
      setStatus('ok', `Sin fechas nuevas · comprobado a las ${hora}`);
    }
  } catch (_) {
    setStatus('err', 'No se pudo consultar u2.com · mostrando las fechas guardadas');
  }
}

if (typeof document !== 'undefined') {
  const state = loadState();
  render(state);
  document.getElementById('refresh').addEventListener('click', () => refresh(state));
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
  refresh(state);
}

if (typeof module !== 'undefined') module.exports = { parseTourHtml, BASE, showId };
