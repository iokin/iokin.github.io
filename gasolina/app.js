'use strict';

const API_BASE = 'https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes';
const MUNICIPALITIES_URL = `${API_BASE}/Listados/Municipios/`;
const PRICES_BY_TOWN_URL = `${API_BASE}/EstacionesTerrestres/FiltroMunicipioProducto`;
const PRICES_BY_PROVINCE_URL = `${API_BASE}/EstacionesTerrestres/FiltroProvinciaProducto`;
const PAGE_SIZE = 25;
const REQUEST_TIMEOUT_MS = 30000;
const TOWNS_TIMEOUT_MS = 60000;
const NEARBY_RADIUS_KM = 15;       // «Cerca de mí» muestra las estaciones dentro de este radio
const NEARBY_FALLBACK_COUNT = 10;  // si no hay ninguna en el radio, las más cercanas
const NEAREST_PROVINCES = 3;       // provincias que se consultan alrededor de la ubicación
const PROVINCE_REACH_KM = 160;     // solo provincias cuyo centro queda a esta distancia o menos
const MAX_CHOICES = 12;
const TOWNS_CACHE_KEY = 'carburantes:localidades:v1';
const TOWNS_CACHE_DAYS = 30;

// Provincias del listado oficial del MITECO: [IDProvincia, nombre, latitud, longitud del centro (aproximado)].
// El centro solo sirve para elegir qué provincias consultar; las distancias salen de las coordenadas de cada estación.
const PROVINCES = [
  ['01', 'Araba/Álava', 42.85, -2.7], ['02', 'Albacete', 38.95, -2.0], ['03', 'Alicante / Alacant', 38.5, -0.6],
  ['04', 'Almería', 37.1, -2.3], ['05', 'Ávila', 40.6, -5.0], ['06', 'Badajoz', 38.7, -6.2],
  ['07', 'Illes Balears', 39.6, 2.9], ['08', 'Barcelona', 41.7, 2.0], ['09', 'Burgos', 42.35, -3.6],
  ['10', 'Cáceres', 39.7, -6.2], ['11', 'Cádiz', 36.5, -5.8], ['12', 'Castellón / Castelló', 40.2, -0.1],
  ['13', 'Ciudad Real', 38.9, -3.9], ['14', 'Córdoba', 37.9, -4.7], ['15', 'A Coruña', 43.0, -8.4],
  ['16', 'Cuenca', 40.1, -2.1], ['17', 'Girona', 42.1, 2.8], ['18', 'Granada', 37.2, -3.3],
  ['19', 'Guadalajara', 40.8, -2.6], ['20', 'Gipuzkoa', 43.2, -2.1], ['21', 'Huelva', 37.5, -6.8],
  ['22', 'Huesca', 42.2, -0.1], ['23', 'Jaén', 37.8, -3.5], ['24', 'León', 42.7, -5.9],
  ['25', 'Lleida', 41.7, 1.0], ['26', 'La Rioja', 42.3, -2.5], ['27', 'Lugo', 43.0, -7.4],
  ['28', 'Madrid', 40.5, -3.7], ['29', 'Málaga', 36.8, -4.6], ['30', 'Murcia', 38.0, -1.5],
  ['31', 'Navarra', 42.7, -1.65], ['32', 'Ourense', 42.2, -7.6], ['33', 'Asturias', 43.3, -5.9],
  ['34', 'Palencia', 42.4, -4.5], ['35', 'Las Palmas', 28.5, -14.5], ['36', 'Pontevedra', 42.4, -8.6],
  ['37', 'Salamanca', 40.9, -6.0], ['38', 'Santa Cruz de Tenerife', 28.4, -17.0], ['39', 'Cantabria', 43.2, -4.0],
  ['40', 'Segovia', 41.1, -4.0], ['41', 'Sevilla', 37.4, -5.7], ['42', 'Soria', 41.7, -2.5],
  ['43', 'Tarragona', 41.1, 1.0], ['44', 'Teruel', 40.6, -1.1], ['45', 'Toledo', 39.8, -4.2],
  ['46', 'Valencia / València', 39.4, -0.9], ['47', 'Valladolid', 41.6, -4.7], ['48', 'Bizkaia', 43.25, -2.85],
  ['49', 'Zamora', 41.7, -6.0], ['50', 'Zaragoza', 41.6, -1.0], ['51', 'Ceuta', 35.89, -5.32],
  ['52', 'Melilla', 35.29, -2.94]
];
const PROVINCE_BY_ID = new Map(PROVINCES.map(([id, name, lat, lng]) => [id, { id, name, lat, lng }]));

const searchForm = document.querySelector('#search-form');
const queryInput = document.querySelector('#query');
const townList = document.querySelector('#town-list');
const fuelSelect = document.querySelector('#fuel');
const searchButton = document.querySelector('#search-button');
const locateButton = document.querySelector('#locate-button');
const choices = document.querySelector('#choices');
const choicesList = document.querySelector('#choices-list');
const choicesMore = document.querySelector('#choices-more');
const sortField = document.querySelector('#sort-field');
const sortSelect = document.querySelector('#sort');
const statusBox = document.querySelector('#status');
const resultsTitle = document.querySelector('#results-title');
const resultsSummary = document.querySelector('#results-summary');
const resultsBody = document.querySelector('#results-body');
const tableWrap = document.querySelector('#table-wrap');
const pagination = document.querySelector('#pagination');
const pageSummary = document.querySelector('#page-summary');
const previousButton = document.querySelector('#previous-page');
const nextButton = document.querySelector('#next-page');

let towns = null;          // localidades del listado oficial (se cargan al usar el buscador)
let townsPromise = null;
let stations = [];
let currentPage = 1;
let currentDate = '';
let context = null;        // { geo, fallback } de la última consulta correcta
let lastSearch = null;     // { type: 'town', town } o { type: 'geo', lat, lng }; se repite al cambiar de combustible
let loading = false;

// ---------- Utilidades ----------

// Minúsculas, sin tildes ni signos: «Alcalá de Henares» → «alcala de henares».
function words(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokens(value) {
  return words(value).split(' ').filter(Boolean);
}

function countLabel(count) {
  return `${count.toLocaleString('es-ES')} ${count === 1 ? 'estación' : 'estaciones'}`;
}

function selectedText(select) {
  return select.selectedOptions[0]?.textContent ?? '';
}

function errorMessage(error) {
  if (error instanceof TypeError) return 'No se pudo conectar con el servicio oficial.';
  if (error instanceof SyntaxError) return 'Respuesta del servicio no válida.';
  return error.message;
}

function showStatus(message, type = 'info') {
  statusBox.className = `status${type === 'error' ? ' status--error' : ''}`;
  statusBox.replaceChildren();
  const icon = document.createElement('span');
  icon.className = 'status__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = type === 'error' ? '!' : 'ℹ';
  const text = document.createElement('span');
  text.textContent = message;
  statusBox.append(icon, text);
  statusBox.hidden = false;
}

function hideStatus() {
  statusBox.hidden = true;
}

function setBusy(value) {
  loading = value;
  searchButton.disabled = value;
  locateButton.disabled = value;
}

async function fetchJson(url, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`El servicio oficial respondió con HTTP ${response.status}.`);
    if (!(response.headers.get('content-type') || '').includes('json')) throw new Error('El servicio no devolvió JSON.');
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('El servicio tarda demasiado en responder. Inténtalo de nuevo.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function distanceKm(lat1, lng1, lat2, lng2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

// Rango aproximado de España, Canarias incluidas.
function insideSpain(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && lat >= 27 && lat <= 44 && lng >= -19 && lng <= 5.5;
}

// ---------- Localidades ----------

function makeTown([id, provinceId, name]) {
  const province = PROVINCE_BY_ID.get(provinceId)?.name ?? '';
  const key = words(name);
  return {
    id, provinceId, name, province,
    label: province ? `${name} (${province})` : name,
    key,
    nameWords: ` ${key}`,
    searchWords: ` ${key} ${words(province)}`,
    full: `${key} ${words(province)}`.trim()
  };
}

function readTownsCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(TOWNS_CACHE_KEY) ?? 'null');
    if (cached && Array.isArray(cached.rows) && cached.rows.length && Date.now() - cached.savedAt < TOWNS_CACHE_DAYS * 864e5) return cached.rows;
  } catch { /* sin almacenamiento disponible */ }
  return null;
}

function writeTownsCache(rows) {
  try {
    localStorage.setItem(TOWNS_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), rows }));
  } catch { /* cuota superada o modo privado */ }
}

function loadTowns() {
  if (towns) return Promise.resolve(towns);
  townsPromise ??= (async () => {
    let rows = readTownsCache();
    if (!rows) {
      const data = await fetchJson(MUNICIPALITIES_URL, TOWNS_TIMEOUT_MS);
      if (!Array.isArray(data)) throw new Error('Lista de localidades no válida.');
      rows = data.map(item => [String(item.IDMunicipio ?? '').trim(), String(item.IDProvincia ?? '').trim(), String(item.Municipio ?? '').trim()])
        .filter(([id, , name]) => id && name);
      if (!rows.length) throw new Error('Lista de localidades vacía.');
      writeTownsCache(rows);
    }
    towns = rows.map(makeTown);
    return towns;
  })().catch(error => {
    townsPromise = null;
    throw error;
  });
  return townsPromise;
}

// Busca por comienzo de palabra, sin tildes. Orden: 0 nombre exacto, 1 empieza por lo escrito,
// 2 el nombre contiene todas las palabras, 3 coincide al sumar la provincia («Alcalá Madrid»).
function findTowns(raw) {
  const queryTokens = tokens(raw);
  if (!queryTokens.length || !towns) return [];
  const query = queryTokens.join(' ');
  const matches = [];
  for (const town of towns) {
    let tier;
    if (town.key === query || town.full === query) tier = 0;
    else if (queryTokens.every(token => town.nameWords.includes(` ${token}`))) tier = town.key.startsWith(query) ? 1 : 2;
    else if (queryTokens.every(token => town.searchWords.includes(` ${token}`))) tier = 3;
    else continue;
    matches.push({ town, tier });
  }
  return matches.sort((a, b) => a.tier - b.tier || a.town.name.localeCompare(b.town.name, 'es'));
}

// Devuelve la localidad si no hay duda; si no, null y se pregunta cuál.
function pickTown(matches) {
  const exact = matches.filter(match => match.tier === 0);
  const byName = matches.filter(match => match.tier <= 2);
  if (exact.length === 1) return exact[0].town;
  if (byName.length === 1) return byName[0].town;
  if (!byName.length && matches.length === 1) return matches[0].town;
  return null;
}

function updateSuggestions() {
  const query = words(queryInput.value);
  if (!towns || query.length < 2) {
    townList.replaceChildren();
    return;
  }
  townList.replaceChildren(...findTowns(query).slice(0, 15).map(({ town }) => new Option(town.label)));
}

function hideChoices() {
  choices.hidden = true;
  choicesList.replaceChildren();
}

// Vuelve al estado inicial de los resultados (tabla, resumen y título).
function clearResults() {
  stations = [];
  currentDate = '';
  context = null;
  currentPage = 1;
  resultsTitle.textContent = 'Resultados';
  renderResults();
}

function showChoices(matches) {
  clearResults();
  const byName = matches.filter(match => match.tier <= 2);
  const shown = byName.length ? byName : matches;
  choicesList.replaceChildren(...shown.slice(0, MAX_CHOICES).map(({ town }) => {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button button--choice';
    button.textContent = town.label;
    button.addEventListener('click', () => chooseTown(town));
    item.append(button);
    return item;
  }));
  choicesMore.hidden = shown.length <= MAX_CHOICES;
  choicesMore.textContent = `Hay ${shown.length.toLocaleString('es-ES')} coincidencias. Escribe más letras para afinar.`;
  choices.hidden = false;
  hideStatus();
  choicesList.querySelector('button')?.focus();
}

function chooseTown(town) {
  hideChoices();
  queryInput.value = town.label;
  load({ type: 'town', town });
}

// ---------- Datos ----------

function getPrice(item) {
  const raw = String(item.PrecioProducto ?? '').trim().replace(',', '.');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function parseCoordinate(value) {
  const number = Number.parseFloat(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(number) ? number : null;
}

function mapStation(item, origin = null) {
  const lat = parseCoordinate(item.Latitud);
  const lng = parseCoordinate(item['Longitud (WGS84)']);
  const coords = insideSpain(lat, lng) ? { lat, lng } : null;
  return {
    id: String(item.IDEESS ?? `${item['Rótulo']}-${item['Dirección']}-${item.Municipio}`),
    name: String(item['Rótulo'] ?? '').trim() || 'Estación sin rótulo',
    town: String(item.Municipio ?? item.Localidad ?? '').trim(),
    province: PROVINCE_BY_ID.get(String(item.IDProvincia ?? '').trim())?.name ?? String(item.Provincia ?? '').trim(),
    address: String(item['Dirección'] ?? '').trim(),
    postcode: String(item['C.P.'] ?? '').trim(),
    price: getPrice(item),
    schedule: String(item.Horario ?? '').trim(),
    coords,
    distance: origin && coords ? distanceKm(origin.lat, origin.lng, coords.lat, coords.lng) : null
  };
}

// Enlace a Google Maps: usa las coordenadas oficiales si son válidas; si no, busca por nombre y dirección.
function mapsUrl(station) {
  const query = station.coords
    ? `${station.coords.lat},${station.coords.lng}`
    : [station.name, station.address, station.postcode, station.town, station.province].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

async function fetchStationList(url) {
  const data = await fetchJson(url);
  const list = data.ListaEESSPrecio ?? data.listaEESSPrecio ?? data.ListaEESS ?? [];
  if (!Array.isArray(list)) throw new Error('Respuesta del servicio no válida.');
  return { list, date: String(data.Fecha ?? data.fecha ?? '').trim() };
}

async function fetchTown(town, fuelId) {
  const { list, date } = await fetchStationList(`${PRICES_BY_TOWN_URL}/${encodeURIComponent(town.id)}/${encodeURIComponent(fuelId)}`);
  return {
    stations: list.map(item => mapStation(item)),
    date,
    context: { geo: false, fallback: false },
    title: town.name === town.province ? town.name : town.label,
    empty: `Sin estaciones de este combustible en ${town.name}.`
  };
}

// Provincias a consultar alrededor de una ubicación: las más próximas por su centro, sin pasarse de PROVINCE_REACH_KM.
function nearestProvinces(lat, lng) {
  const ranked = [...PROVINCE_BY_ID.values()]
    .map(province => ({ id: province.id, km: distanceKm(lat, lng, province.lat, province.lng) }))
    .sort((a, b) => a.km - b.km);
  const reachable = ranked.filter(province => province.km <= PROVINCE_REACH_KM).slice(0, NEAREST_PROVINCES);
  return (reachable.length ? reachable : ranked.slice(0, 1)).map(province => province.id);
}

async function fetchNearby(origin, fuelId) {
  const ids = nearestProvinces(origin.lat, origin.lng);
  const settled = await Promise.allSettled(ids.map(id => fetchStationList(`${PRICES_BY_PROVINCE_URL}/${encodeURIComponent(id)}/${encodeURIComponent(fuelId)}`)));
  const loaded = settled.filter(item => item.status === 'fulfilled').map(item => item.value);
  if (!loaded.length) throw settled[0].reason;

  const located = loaded.flatMap(item => item.list).map(item => mapStation(item, origin))
    .filter(station => station.distance !== null)
    .sort((a, b) => a.distance - b.distance);
  const near = located.filter(station => station.distance <= NEARBY_RADIUS_KM);
  const fallback = near.length === 0;
  return {
    stations: fallback ? located.slice(0, NEARBY_FALLBACK_COUNT) : near,
    date: loaded[0].date,
    context: { geo: true, fallback },
    title: 'Cerca de ti',
    empty: 'No hay estaciones de este combustible cerca de ti.',
    warning: loaded.length < ids.length ? 'Resultados incompletos: no se pudo consultar alguna provincia cercana.' : ''
  };
}

async function load(search) {
  lastSearch = search;
  const fuelId = fuelSelect.value;
  setBusy(true);
  tableWrap.hidden = true;
  pagination.hidden = true;
  sortField.hidden = true;
  resultsSummary.textContent = '';
  showStatus(search.type === 'geo' ? 'Buscando estaciones cercanas…' : 'Consultando…');

  try {
    const result = search.type === 'geo' ? await fetchNearby(search, fuelId) : await fetchTown(search.town, fuelId);
    stations = result.stations;
    currentDate = result.date;
    context = result.context;
    currentPage = 1;
    sortSelect.querySelector('option[value="distance"]').disabled = !context.geo;
    if (!context.geo && sortSelect.value === 'distance') sortSelect.value = 'price-asc';
    resultsTitle.textContent = `${result.title} · ${selectedText(fuelSelect)}`;
    renderResults();
    if (result.warning) showStatus(result.warning, 'error');
    else if (stations.length) hideStatus();
    else showStatus(result.empty);
  } catch (error) {
    clearResults();
    showStatus(errorMessage(error), 'error');
  } finally {
    setBusy(false);
  }
}

// ---------- Acciones ----------

async function onSearch(event) {
  event.preventDefault();
  if (loading) return;
  const raw = queryInput.value.trim();
  hideChoices();
  if (!raw) {
    showStatus('Escribe una localidad o usa «Cerca de mí».', 'error');
    queryInput.focus();
    return;
  }

  setBusy(true);
  if (!towns) showStatus('Cargando localidades…');
  try {
    await loadTowns();
  } catch (error) {
    setBusy(false);
    showStatus(errorMessage(error), 'error');
    return;
  }
  setBusy(false);

  const matches = findTowns(raw);
  if (!matches.length) {
    showStatus(`No encontramos «${raw}». Prueba con otro nombre.`, 'error');
    return;
  }
  const town = pickTown(matches);
  if (town) {
    queryInput.value = town.label;
    await load({ type: 'town', town });
  } else {
    showChoices(matches);
  }
}

function getPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 });
  });
}

function geolocationMessage(error) {
  if (error?.code === 1) return 'No tienes permiso de ubicación. Actívalo o escribe una localidad.';
  if (error?.code === 3) return 'Tu ubicación tarda demasiado. Inténtalo de nuevo.';
  return 'No se pudo obtener tu ubicación.';
}

async function onLocate() {
  if (loading) return;
  hideChoices();
  if (!('geolocation' in navigator)) {
    showStatus('Tu navegador no permite la geolocalización.', 'error');
    return;
  }
  setBusy(true);
  showStatus('Obteniendo tu ubicación…');
  let position;
  try {
    position = await getPosition();
  } catch (error) {
    setBusy(false);
    showStatus(geolocationMessage(error), 'error');
    return;
  }
  const { latitude, longitude } = position.coords;
  if (!insideSpain(latitude, longitude)) {
    setBusy(false);
    showStatus('Tu ubicación está fuera de España.', 'error');
    return;
  }
  queryInput.value = '';
  townList.replaceChildren();
  await load({ type: 'geo', lat: latitude, lng: longitude });
}

// ---------- Resultados ----------

function sortedStations() {
  const sorted = [...stations];
  switch (sortSelect.value) {
    case 'price-desc': sorted.sort((a, b) => (b.price ?? -1) - (a.price ?? -1)); break;
    case 'distance': sorted.sort((a, b) => (a.distance ?? Number.POSITIVE_INFINITY) - (b.distance ?? Number.POSITIVE_INFINITY)); break;
    default: sorted.sort((a, b) => (a.price ?? Number.POSITIVE_INFINITY) - (b.price ?? Number.POSITIVE_INFINITY));
  }
  return sorted;
}

function cell(text, className = '') {
  const td = document.createElement('td');
  if (className) td.className = className;
  td.textContent = text || '—';
  return td;
}

function stationCell(station) {
  const td = document.createElement('td');
  const name = document.createElement('span');
  name.className = 'station-name';

  const link = document.createElement('a');
  link.className = 'station-link';
  link.href = mapsUrl(station);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  const label = document.createElement('span');
  label.textContent = station.name;
  const arrow = document.createElement('span');
  arrow.className = 'station-link__icon';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = ' ↗';
  const hint = document.createElement('span');
  hint.className = 'sr-only';
  hint.textContent = ' (Google Maps, pestaña nueva)';
  link.append(label, arrow, hint);
  name.append(link);

  const distance = station.distance === null ? ''
    : `${station.distance.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} km`;
  const detail = document.createElement('span');
  detail.className = 'station-brand';
  detail.textContent = [distance, station.postcode ? `C.P. ${station.postcode}` : '', station.province].filter(Boolean).join(' · ') || 'Estación de servicio';

  td.append(name, detail);
  return td;
}

function summaryText(total) {
  if (!context) return 'Busca una localidad o usa «Cerca de mí».';
  if (!total) return 'Sin estaciones.';
  const date = currentDate ? ` · datos de ${currentDate}` : '';
  if (context.fallback) return `Ninguna a menos de ${NEARBY_RADIUS_KM} km: las ${total.toLocaleString('es-ES')} más cercanas${date}`;
  return `${countLabel(total)}${context.geo ? ` a menos de ${NEARBY_RADIUS_KM} km` : ''}${date}`;
}

function renderResults() {
  const sorted = sortedStations();
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  resultsBody.replaceChildren();

  pageItems.forEach(station => {
    const row = document.createElement('tr');
    row.append(stationCell(station), cell(station.town), cell(station.address));

    const priceCell = document.createElement('td');
    priceCell.className = 'price-column';
    const price = document.createElement('span');
    price.className = `price${station.price === null ? ' price--missing' : ''}`;
    price.textContent = station.price === null ? 'No disponible' : `${station.price.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/l`;
    priceCell.append(price);
    row.append(priceCell, cell(station.schedule));
    resultsBody.append(row);
  });

  resultsSummary.textContent = summaryText(sorted.length);
  sortField.hidden = !sorted.length;
  tableWrap.hidden = !pageItems.length;
  pagination.hidden = !sorted.length;
  pageSummary.textContent = `Página ${currentPage} de ${pageCount}`;
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= pageCount;
}

function changePage(delta) {
  currentPage += delta;
  renderResults();
  resultsTitle.focus();
}

// ---------- Eventos e inicio ----------

searchForm.addEventListener('submit', onSearch);
locateButton.addEventListener('click', onLocate);
queryInput.addEventListener('input', () => { hideChoices(); updateSuggestions(); });
// La lista de localidades pesa bastante: se descarga (o se lee de la caché) al interesarse el usuario por el buscador.
queryInput.addEventListener('focus', () => { loadTowns().then(updateSuggestions, () => {}); }, { once: true });
fuelSelect.addEventListener('change', () => { if (lastSearch && !loading) load(lastSearch); });
sortSelect.addEventListener('change', () => { currentPage = 1; renderResults(); });
previousButton.addEventListener('click', () => { if (currentPage > 1) changePage(-1); });
nextButton.addEventListener('click', () => changePage(1));

renderResults();
