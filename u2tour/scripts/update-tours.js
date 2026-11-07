// Descarga u2.com/pages/tours, extrae las fechas y actualiza tours.json solo si hay cambios.
//   node scripts/update-tours.js
// Para probar sin red: SOURCE_FILE=ruta/a/pagina.html node scripts/update-tours.js

const fs = require('fs');
const path = require('path');
const { parseTourHtml } = require('../app.js');

const SOURCE = 'https://www.u2.com/pages/tours';
const OUT = path.join(__dirname, '..', 'tours.json');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function getHtml() {
  if (process.env.SOURCE_FILE) return fs.readFileSync(process.env.SOURCE_FILE, 'utf8');
  const res = await fetch(SOURCE, { headers: { 'User-Agent': UA, 'Accept-Language': 'en,es;q=0.8' } });
  if (!res.ok) throw new Error('u2.com respondió HTTP ' + res.status);
  return res.text();
}

(async () => {
  const shows = parseTourHtml(await getHtml())
    .sort((a, b) => a.date.localeCompare(b.date) || a.city.localeCompare(b.city));

  // Si la lectura es sospechosamente corta (cambio de marcado, bloqueo...), no sobrescribimos nada.
  if (shows.length < 10) throw new Error(`Solo se reconocieron ${shows.length} fechas; no se actualiza tours.json`);

  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch (_) { /* primera vez */ }
  if (prev && JSON.stringify(prev.shows) === JSON.stringify(shows)) {
    console.log(`Sin cambios (${shows.length} fechas).`);
    return;
  }

  fs.writeFileSync(OUT, JSON.stringify({ updated: new Date().toISOString(), source: SOURCE, shows }, null, 2) + '\n');
  const before = prev ? prev.shows.length : 0;
  console.log(`tours.json actualizado: ${before} → ${shows.length} fechas.`);
})().catch(e => { console.error(e.message); process.exit(1); });
