// Service worker de "Real Sociedad · Seguimiento"
// - Guarda la interfaz para abrirla sin conexión
// - Decide y muestra los avisos (1 h antes, inicio y final del partido)

const CACHE = "rs-shell-v1";
const ESTADO = "rs-estado-v1";
const ARCHIVOS = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];

const BASE = "https://www.thesportsdb.com/api/v1/json/123";
const TEAM_ID = "133724";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ARCHIVOS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => k !== CACHE && k !== ESTADO).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Red primero (para que las actualizaciones lleguen) y caché como respaldo sin conexión.
// Solo ficheros propios; las llamadas a la API y los escudos no pasan por aquí.
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((r) => {
        if (r.ok) { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); }
        return r;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match("./index.html")))
  );
});

// ===== Estado de los avisos (se guarda en la Cache API) =====
async function leerEstado() {
  try {
    const c = await caches.open(ESTADO);
    const r = await c.match("estado");
    if (r) return await r.json();
  } catch (_) {}
  return { activo: false, avisados: {} };
}

async function guardarEstado(est) {
  const c = await caches.open(ESTADO);
  await c.put("estado", new Response(JSON.stringify(est), { headers: { "Content-Type": "application/json" } }));
}

function fecha(ev) {
  if (ev.strTimestamp) return new Date(ev.strTimestamp.endsWith("Z") ? ev.strTimestamp : ev.strTimestamp + "Z");
  if (ev.dateEvent) return new Date(`${ev.dateEvent}T${ev.strTime || "00:00:00"}Z`);
  return null;
}

async function evaluar(proximos, ultimos) {
  const est = await leerEstado();
  if (!est.activo || Notification.permission !== "granted") return;

  const hora = new Intl.DateTimeFormat("es-ES", { hour: "2-digit", minute: "2-digit" });
  const ahora = Date.now();
  const avisos = [];

  const lista = (proximos || []).map((e) => ({ e, f: fecha(e) })).filter((x) => x.f).sort((a, b) => a.f - b.f);
  if (lista.length) {
    const { e, f } = lista[0];
    const ms = f - ahora;
    const par = `${e.strHomeTeam} – ${e.strAwayTeam}`;
    if (ms > 0 && ms <= 3600000) {
      avisos.push({ clave: `ant-${e.idEvent}`, titulo: "La Real juega en menos de una hora", cuerpo: `${par} · ${hora.format(f)}` });
    }
    if (ms <= 0 && ms > -900000) {
      avisos.push({ clave: `ini-${e.idEvent}`, titulo: "¡Empieza el partido!", cuerpo: par });
    }
  }

  for (const e of ultimos || []) {
    const f = fecha(e);
    if (!f || e.intHomeScore == null || e.intHomeScore === "" || e.intAwayScore == null || e.intAwayScore === "") continue;
    const desde = ahora - f;
    if (desde < 0 || desde > 6 * 3600000) continue;
    avisos.push({ clave: `fin-${e.idEvent}`, titulo: "Final del partido", cuerpo: `${e.strHomeTeam} ${e.intHomeScore} - ${e.intAwayScore} ${e.strAwayTeam}` });
  }

  for (const a of avisos) {
    if (est.avisados[a.clave]) continue;
    est.avisados[a.clave] = ahora;
    await self.registration.showNotification(a.titulo, {
      body: a.cuerpo,
      tag: a.clave,
      icon: "icon-192.png",
      badge: "icon-192.png",
    });
  }

  // Limpia avisos antiguos
  const claves = Object.keys(est.avisados).sort((a, b) => est.avisados[a] - est.avisados[b]);
  while (claves.length > 40) delete est.avisados[claves.shift()];

  await guardarEstado(est);
}

// La página manda aquí la configuración y los datos recién descargados
self.addEventListener("message", (ev) => {
  const d = ev.data || {};
  ev.waitUntil((async () => {
    if (d.tipo === "config") {
      const est = await leerEstado();
      est.activo = !!d.activo;
      await guardarEstado(est);
    } else if (d.tipo === "datos") {
      await evaluar(d.proximos, d.ultimos);
    }
  })());
});

// Revisión en segundo plano (solo donde el navegador lo permita: Chrome/Edge en Android con la app instalada)
async function revisar() {
  try {
    const [a, b] = await Promise.all([
      fetch(`${BASE}/eventsnext.php?id=${TEAM_ID}`).then((r) => r.json()),
      fetch(`${BASE}/eventslast.php?id=${TEAM_ID}`).then((r) => r.json()),
    ]);
    await evaluar(a.events, b.results);
  } catch (_) {}
}

self.addEventListener("periodicsync", (ev) => {
  if (ev.tag === "rs-check") ev.waitUntil(revisar());
});

self.addEventListener("notificationclick", (ev) => {
  ev.notification.close();
  ev.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      const abierta = lista.find((c) => "focus" in c);
      return abierta ? abierta.focus() : self.clients.openWindow("./");
    })
  );
});
