// Descarga u2.com/pages/tours, extrae las fechas y actualiza tours.json solo si hay cambios.
//   node scripts/update-tours.js
// Para probar sin red: SOURCE_FILE=ruta/a/pagina.html node scripts/update-tours.js
//
// Variables opcionales (las usa el workflow):
//   NEW_DATES_FILE  ruta (dentro del workspace) donde escribir la lista de fechas nuevas
//   GITHUB_OUTPUT   si existe, se escribe added=N cuando hay fechas nuevas

const fs = require('fs');
const path = require('path');
const { parseTourHtml } = require('../app.js');

const SOURCE = 'https://www.u2.com/pages/tours';
const OUT = path.join(__dirname, '..', 'tours.json');
const DEBUG = path.join(__dirname, '..', 'debug-fetch.html');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function getHtml() {
  if (process.env.SOURCE_FILE) return fs.readFileSync(process.env.SOURCE_FILE, 'utf8');
  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA, 'Accept-Language': 'en,es;q=0.8' } });
  console.log(`HTTP ${res.status} desde u2.com`);
  if (!res.ok) throw new Error('u2.com respondió HTTP ' + res.status);
  return res.text();
}

// La página anuncia el total ("37 SHOWS · 2 LEGS"). Sirve para comprobar que no se nos escapa ninguna fecha.
function declaredTotal(html) {
  const text = html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
  const m = /(\d+)\s*SHOWS\s*[·•\-–]?\s*(\d+)\s*LEGS/i.exec(text);
  return m ? +m[1] : null;
}

function fail(html, msg) {
  try { fs.writeFileSync(DEBUG, html); } catch (_) { /* ignorar */ }   // el workflow lo sube como artefacto
  throw new Error(msg);
}

(async () => {
  const html = await getHtml();
  console.log(`Descargados ${html.length} bytes`);

  const shows = parseTourHtml(html)
    .sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city));
  const declared = declaredTotal(html);
  console.log(`Fechas reconocidas: ${shows.length} · la página declara: ${declared ?? 'n/d'}`);

  // Nunca sobrescribimos tours.json con una lectura dudosa.
  if (shows.length < 10) fail(html, `Solo se reconocieron ${shows.length} fechas; no se actualiza tours.json`);
  if (declared !== null && declared !== shows.length) {
    fail(html, `La página declara ${declared} shows pero el parser reconoció ${shows.length}; no se actualiza tours.json`);
  }

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) { /* primera vez */ }
  if (prev && JSON.stringify(prev.shows) === JSON.stringify(shows)) {
    console.log(`Sin cambios (${shows.length} fechas).`);
    return;
  }

  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), source: SOURCE, shows }, null, 2) + '\n');
  console.log(`tours.json actualizado: ${prev ? prev.shows.length : 0} → ${shows.length} fechas.`);

  // Fechas que no estaban en la versión anterior (no se avisa en la primera ejecución).
  if (!prev) return;
  const key = s => `${s.date}|${s.city}`;
  const known = new Set(prev.shows.map(key));
  const added = shows.filter(s => !known.has(key(s)));
  if (!added.length) return;

  const fmt = new Intl.DateTimeFormat('es-ES', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' });
  const lines = added.map(s => `- ${fmt.format(new Date(s.date + 'T12:00:00'))} · ${s.city} (${s.cc}) · ${s.venue}`);
  console.log(`${added.length} fecha(s) nueva(s):\n` + lines.join('\n'));
  if (process.env.NEW_DATES_FILE) fs.writeFileSync(process.env.NEW_DATES_FILE, lines.join('\n') + '\n');
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `added=${added.length}\n`);
})().catch(e => { console.error('ERROR: ' + e.message); process.exit(1); });
