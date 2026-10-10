'use strict';

const API_BASE = 'https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes';
const PRICES_BY_PROVINCE_URL = `${API_BASE}/EstacionesTerrestres/FiltroProvinciaProducto`;
const PRICES_BY_CCAA_URL = `${API_BASE}/EstacionesTerrestres/FiltroCCAAProducto`;
const PAGE_SIZE = 25;
const REQUEST_TIMEOUT_MS = 30000;

// Comunidades autónomas según el listado oficial del MITECO: [IDCCAA, nombre].
const CCAA = [
  ['01', 'Andalucía'], ['02', 'Aragón'], ['03', 'Principado de Asturias'], ['04', 'Illes Balears'],
  ['05', 'Canarias'], ['06', 'Cantabria'], ['07', 'Castilla-La Mancha'], ['08', 'Castilla y León'],
  ['09', 'Cataluña'], ['10', 'Comunitat Valenciana'], ['11', 'Extremadura'], ['12', 'Galicia'],
  ['13', 'Comunidad de Madrid'], ['14', 'Región de Murcia'], ['15', 'Comunidad Foral de Navarra'],
  ['16', 'País Vasco'], ['17', 'La Rioja'], ['18', 'Ceuta'], ['19', 'Melilla']
];

// Provincias según el listado oficial del MITECO: [IDProvincia, nombre, IDCCAA].
const PROVINCES = [
  ['02', 'Albacete', '07'], ['03', 'Alicante / Alacant', '10'], ['04', 'Almería', '01'], ['01', 'Araba/Álava', '16'],
  ['33', 'Asturias', '03'], ['05', 'Ávila', '08'], ['06', 'Badajoz', '11'], ['07', 'Illes Balears', '04'],
  ['08', 'Barcelona', '09'], ['48', 'Bizkaia', '16'], ['09', 'Burgos', '08'], ['10', 'Cáceres', '11'],
  ['11', 'Cádiz', '01'], ['39', 'Cantabria', '06'], ['12', 'Castellón / Castelló', '10'], ['51', 'Ceuta', '18'],
  ['13', 'Ciudad Real', '07'], ['14', 'Córdoba', '01'], ['15', 'A Coruña', '12'], ['16', 'Cuenca', '07'],
  ['20', 'Gipuzkoa', '16'], ['17', 'Girona', '09'], ['18', 'Granada', '01'], ['19', 'Guadalajara', '07'],
  ['21', 'Huelva', '01'], ['22', 'Huesca', '02'], ['23', 'Jaén', '01'], ['24', 'León', '08'],
  ['25', 'Lleida', '09'], ['27', 'Lugo', '12'], ['28', 'Madrid', '13'], ['29', 'Málaga', '01'],
  ['52', 'Melilla', '19'], ['30', 'Murcia', '14'], ['31', 'Navarra', '15'], ['32', 'Ourense', '12'],
  ['34', 'Palencia', '08'], ['35', 'Las Palmas', '05'], ['36', 'Pontevedra', '12'], ['26', 'La Rioja', '17'],
  ['37', 'Salamanca', '08'], ['38', 'Santa Cruz de Tenerife', '05'], ['40', 'Segovia', '08'], ['41', 'Sevilla', '01'],
  ['42', 'Soria', '08'], ['43', 'Tarragona', '09'], ['44', 'Teruel', '02'], ['45', 'Toledo', '07'],
  ['46', 'Valencia / València', '10'], ['47', 'Valladolid', '08'], ['49', 'Zamora', '08'], ['50', 'Zaragoza', '02']
];

// Otros nombres habituales, para que el buscador reconozca la zona.
const PROVINCE_ALIASES = {
  '48': ['Vizcaya'], '20': ['Guipúzcoa'], '15': ['Coruña', 'La Coruña'], '17': ['Gerona'], '25': ['Lérida'],
  '32': ['Orense'], '26': ['Rioja'], '07': ['Baleares'], '38': ['Tenerife']
};
const CCAA_ALIASES = { '09': ['Catalunya'], '10': ['Comunidad Valenciana'], '16': ['Euskadi'] };

const CCAA_BY_ID = new Map(CCAA);
const PROVINCE_BY_ID = new Map(PROVINCES.map(([id, name, ccaa]) => [id, { id, name, ccaa }]));

const searchForm = document.querySelector('#search-form');
const queryInput = document.querySelector('#query');
const territoryList = document.querySelector('#territory-list');
const searchButton = document.querySelector('#search-button');
const filtersToggle = document.querySelector('#filters-toggle');
const filtersSummary = document.querySelector('#filters-summary');
const filtersPanel = document.querySelector('#filters-panel');
const ccaaSelect = document.querySelector('#ccaa');
const provinceSelect = document.querySelector('#province');
const municipalityInput = document.querySelector('#municipality');
const municipalityList = document.querySelector('#municipality-list');
const fuelSelect = document.querySelector('#fuel');
const applyButton = document.querySelector('#apply-button');
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

let stations = [];
let currentPage = 1;
let currentDate = '';
let textQuery = '';        // texto del buscador (sin la zona) que filtra los resultados cargados
let loadedScope = null;    // zona de la última consulta correcta: { type, id, label }
let loadedFuel = '';
let lastSubmitKey = '';    // repetir la misma búsqueda vuelve a consultar el servicio
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

function byName(a, b) {
  return a[1].localeCompare(b[1], 'es');
}

function countLabel(count) {
  return `${count.toLocaleString('es-ES')} ${count === 1 ? 'estación' : 'estaciones'}`;
}

function selectedText(select) {
  return select.selectedOptions[0]?.textContent ?? '';
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

function setLoading(value) {
  loading = value;
  searchButton.disabled = value;
  applyButton.disabled = value;
  searchButton.textContent = value ? 'Buscando…' : 'Buscar';
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

// ---------- Reconocimiento de la zona en el buscador ----------

const TERRITORIES = [];

function addTerritory(type, id, label, names) {
  new Set(names.map(words).filter(Boolean)).forEach(key => TERRITORIES.push({ type, id, label, key, size: key.split(' ').length }));
}

PROVINCES.forEach(([id, name]) => addTerritory('province', id, name, [name, ...name.split('/'), ...(PROVINCE_ALIASES[id] ?? [])]));
CCAA.forEach(([id, name]) => addTerritory('ccaa', id, name, [name, ...(CCAA_ALIASES[id] ?? [])]));
// Primero los nombres más largos («Castilla y León» antes que «León»); a igualdad, la provincia antes que la comunidad.
TERRITORIES.sort((a, b) => b.size - a.size || b.key.length - a.key.length || (a.type === b.type ? 0 : a.type === 'province' ? -1 : 1));

// Separa la consulta en zona (provincia o comunidad) y texto libre. Si hay varias zonas, gana la última:
// «Avenida de Madrid Valladolid» → zona Valladolid, texto «Avenida de Madrid».
function parseQuery(raw) {
  const parts = String(raw ?? '').split(/\s+/).filter(part => words(part));
  const list = [];
  parts.forEach((part, index) => tokens(part).forEach(word => list.push({ word, index })));

  const hits = [];
  for (const territory of TERRITORIES) {
    const key = territory.key.split(' ');
    for (let start = 0; start + key.length <= list.length; start++) {
      if (key.every((word, offset) => list[start + offset].word === word)) hits.push({ territory, start, end: start + key.length });
    }
  }
  const kept = [];
  for (const hit of hits) {
    if (!kept.some(other => hit.start < other.end && other.start < hit.end)) kept.push(hit);
  }
  kept.sort((a, b) => b.start - a.start);
  const chosen = kept[0];
  if (!chosen) return { territory: null, text: parts.join(' ') };

  const used = new Set(list.slice(chosen.start, chosen.end).map(item => item.index));
  return { territory: chosen.territory, text: parts.filter((_, index) => !used.has(index)).join(' ') };
}

// ---------- Filtros ----------

function loadCcaa() {
  ccaaSelect.replaceChildren(new Option('Selecciona una comunidad', ''));
  [...CCAA].sort(byName).forEach(([id, name]) => ccaaSelect.add(new Option(name, id)));
}

function loadProvinces(ccaaId, selected = '') {
  provinceSelect.replaceChildren(new Option(ccaaId ? 'Todas las provincias' : '—', ''));
  provinceSelect.disabled = !ccaaId;
  PROVINCES.filter(province => province[2] === ccaaId).sort(byName)
    .forEach(([id, name]) => provinceSelect.add(new Option(name, id)));
  provinceSelect.value = selected;
}

function loadTerritorySuggestions() {
  const names = new Set([...CCAA.map(([, name]) => name), ...PROVINCES.map(([, name]) => name)]);
  territoryList.replaceChildren(...[...names].sort((a, b) => a.localeCompare(b, 'es')).map(name => new Option(name)));
}

function loadMunicipalities() {
  // El campo admite texto libre; la lista solo ofrece sugerencias con los municipios de la consulta.
  const towns = [...new Set(stations.map(station => station.town).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  municipalityList.replaceChildren(...towns.map(town => new Option(town)));
  municipalityInput.disabled = towns.length === 0;
  municipalityInput.value = '';
}

function setFiltersOpen(open) {
  filtersPanel.hidden = !open;
  filtersToggle.setAttribute('aria-expanded', String(open));
  filtersToggle.textContent = open ? 'Ocultar filtros' : 'Mostrar filtros';
  filtersSummary.hidden = open;
}

function updateFiltersSummary() {
  filtersSummary.textContent = selectedText(fuelSelect);
}

function scopeFromSelects() {
  const ccaaId = ccaaSelect.value;
  if (!ccaaId) return null;
  const provinceId = provinceSelect.value;
  return provinceId
    ? { type: 'province', id: provinceId, label: PROVINCE_BY_ID.get(provinceId).name }
    : { type: 'ccaa', id: ccaaId, label: CCAA_BY_ID.get(ccaaId) };
}

function scopeKey(scope) {
  return scope ? `${scope.type}:${scope.id}` : '';
}

// Refleja en los filtros la zona escrita en el buscador.
function applyTerritory(territory) {
  if (territory.type === 'ccaa') {
    ccaaSelect.value = territory.id;
    loadProvinces(territory.id);
  } else {
    const province = PROVINCE_BY_ID.get(territory.id);
    ccaaSelect.value = province.ccaa;
    loadProvinces(province.ccaa, province.id);
  }
}

// ---------- Datos ----------

function getPrice(item) {
  const raw = String(item.PrecioProducto ?? '').trim().replace(',', '.');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mapStation(item) {
  const province = PROVINCE_BY_ID.get(String(item.IDProvincia ?? '').trim());
  const station = {
    id: String(item.IDEESS ?? `${item['Rótulo']}-${item['Dirección']}-${item.Municipio}`),
    name: String(item['Rótulo'] ?? '').trim() || 'Estación sin rótulo',
    town: String(item.Municipio ?? item.Localidad ?? '').trim(),
    locality: String(item.Localidad ?? '').trim(),
    province: province?.name ?? String(item.Provincia ?? '').trim(),
    address: String(item['Dirección'] ?? '').trim(),
    postcode: String(item['C.P.'] ?? '').trim(),
    price: getPrice(item),
    schedule: String(item.Horario ?? '').trim(),
    latitude: String(item.Latitud ?? '').trim(),
    longitude: String(item['Longitud (WGS84)'] ?? '').trim()
  };
  const ccaaName = province ? CCAA_BY_ID.get(province.ccaa) : '';
  // Texto normalizado, con espacio inicial, para buscar por comienzo de palabra.
  station.search = ` ${words([station.name, station.address, station.town, station.locality, station.postcode, station.province, ccaaName].join(' '))}`;
  station.townSearch = ` ${words(station.town)}`;
  return station;
}

// Enlace a Google Maps: usa las coordenadas oficiales si son válidas; si no, busca por nombre y dirección.
function mapsUrl(station) {
  const lat = Number.parseFloat(station.latitude.replace(',', '.'));
  const lng = Number.parseFloat(station.longitude.replace(',', '.'));
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= 27 && lat <= 44 && lng >= -19 && lng <= 5.5; // rango aproximado de España, Canarias incluidas
  const query = hasCoordinates
    ? `${lat},${lng}`
    : [station.name, station.address, station.postcode, station.town, station.province].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

async function loadStations(scope, fuelId) {
  setLoading(true);
  tableWrap.hidden = true;
  pagination.hidden = true;
  sortField.hidden = true;
  resultsSummary.textContent = '';
  showStatus('Consultando…');

  try {
    const base = scope.type === 'province' ? PRICES_BY_PROVINCE_URL : PRICES_BY_CCAA_URL;
    const data = await fetchJson(`${base}/${encodeURIComponent(scope.id)}/${encodeURIComponent(fuelId)}`);
    const list = data.ListaEESSPrecio ?? data.listaEESSPrecio ?? data.ListaEESS ?? [];
    if (!Array.isArray(list)) throw new Error('Respuesta del servicio no válida.');
    stations = list.map(mapStation);
    currentDate = String(data.Fecha ?? data.fecha ?? '').trim();
    loadedScope = scope;
    loadedFuel = fuelId;
    currentPage = 1;
    resultsTitle.textContent = `${scope.label} · ${selectedText(fuelSelect)}`;
    loadMunicipalities();
    renderResults();
    if (stations.length) hideStatus();
    else showStatus('El servicio no devuelve estaciones para esta zona y combustible.');
  } catch (error) {
    stations = [];
    currentDate = '';
    loadedScope = null;
    resultsTitle.textContent = 'Resultados';
    loadMunicipalities();
    renderResults();
    showStatus(error instanceof TypeError ? 'No se pudo conectar con el servicio oficial.' : error.message, 'error');
  } finally {
    setLoading(false);
  }
}

// Consulta el servicio solo si cambia la zona o el combustible (o se repite la búsqueda); si no, solo filtra.
async function run(scope, refresh = false) {
  const fuelId = fuelSelect.value;
  const stale = !loadedScope || scopeKey(scope) !== scopeKey(loadedScope) || fuelId !== loadedFuel;
  if (stale || refresh) {
    await loadStations(scope, fuelId);
  } else {
    hideStatus();
    currentPage = 1;
    renderResults();
  }
}

async function onSearch(event) {
  event.preventDefault();
  if (loading) return;
  const raw = queryInput.value.trim();
  const parsed = parseQuery(raw);
  if (parsed.territory) applyTerritory(parsed.territory);
  const scope = scopeFromSelects();
  if (!scope) {
    showStatus('Escribe una provincia o comunidad, por ejemplo «Sevilla».', 'error');
    queryInput.focus();
    return;
  }
  textQuery = parsed.text;
  const key = `${words(raw)}|${fuelSelect.value}`;
  const refresh = key === lastSubmitKey;
  lastSubmitKey = key;
  await run(scope, refresh);
}

async function onApplyFilters(event) {
  event.preventDefault();
  if (loading) return;
  const scope = scopeFromSelects();
  if (!scope) {
    showStatus('Elige una comunidad autónoma.', 'error');
    ccaaSelect.focus();
    return;
  }
  // El buscador pasa a reflejar la zona de los filtros y conserva el texto libre.
  textQuery = parseQuery(queryInput.value).text;
  queryInput.value = [scope.label, textQuery].filter(Boolean).join(' ');
  lastSubmitKey = `${words(queryInput.value)}|${fuelSelect.value}`;
  await run(scope);
}

// ---------- Resultados ----------

function filteredStations() {
  const townTokens = tokens(municipalityInput.value);
  const textTokens = tokens(textQuery);
  if (!townTokens.length && !textTokens.length) return stations;
  return stations.filter(station => townTokens.every(token => station.townSearch.includes(` ${token}`))
    && textTokens.every(token => station.search.includes(` ${token}`)));
}

function sortedStations() {
  const sorted = [...filteredStations()];
  switch (sortSelect.value) {
    case 'price-desc': sorted.sort((a, b) => (b.price ?? -1) - (a.price ?? -1)); break;
    case 'name-asc': sorted.sort((a, b) => a.name.localeCompare(b.name, 'es')); break;
    case 'town-asc': sorted.sort((a, b) => a.town.localeCompare(b.town, 'es')); break;
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

  const detail = document.createElement('span');
  detail.className = 'station-brand';
  detail.textContent = [station.postcode ? `C.P. ${station.postcode}` : '', station.province].filter(Boolean).join(' · ') || 'Estación de servicio';

  td.append(name, detail);
  return td;
}

function summaryText(shown, total) {
  if (!loadedScope) return 'Busca una zona para ver precios.';
  if (!total) return 'Sin estaciones.';
  const date = currentDate ? ` · datos de ${currentDate}` : '';
  if (!shown) return `Ninguna estación coincide (${total.toLocaleString('es-ES')} en total)${date}`;
  if (shown !== total) return `${shown.toLocaleString('es-ES')} de ${countLabel(total)}${date}`;
  return `${countLabel(total)}${date}`;
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

  resultsSummary.textContent = summaryText(sorted.length, stations.length);
  sortField.hidden = !stations.length;
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
filtersPanel.addEventListener('submit', onApplyFilters);
filtersToggle.addEventListener('click', () => setFiltersOpen(filtersPanel.hidden));
ccaaSelect.addEventListener('change', () => loadProvinces(ccaaSelect.value));
fuelSelect.addEventListener('change', updateFiltersSummary);
sortSelect.addEventListener('change', () => { currentPage = 1; renderResults(); });
municipalityInput.addEventListener('input', () => { currentPage = 1; renderResults(); });
previousButton.addEventListener('click', () => { if (currentPage > 1) changePage(-1); });
nextButton.addEventListener('click', () => changePage(1));

loadCcaa();
loadProvinces('');
loadTerritorySuggestions();
updateFiltersSummary();
setFiltersOpen(false);
renderResults();
