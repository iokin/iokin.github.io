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

const PROVINCE_NAMES = new Map(PROVINCES.map(([id, name]) => [id, name]));

const form = document.querySelector('#search-form');
const ccaaSelect = document.querySelector('#ccaa');
const provinceSelect = document.querySelector('#province');
const fuelSelect = document.querySelector('#fuel');
const municipalityInput = document.querySelector('#municipality');
const municipalityList = document.querySelector('#municipality-list');
const sortSelect = document.querySelector('#sort');
const searchButton = document.querySelector('#search-button');
const statusBox = document.querySelector('#status');
const resultsTitle = document.querySelector('#results-title');
const resultsSummary = document.querySelector('#results-summary');
const resultsBody = document.querySelector('#results-body');
const tableWrap = document.querySelector('#table-wrap');
const pagination = document.querySelector('#pagination');
const pageSummary = document.querySelector('#page-summary');
const previousButton = document.querySelector('#previous-page');
const nextButton = document.querySelector('#next-page');
const dataDate = document.querySelector('#data-date');

let stations = [];
let currentPage = 1;

// Compara sin tildes ni mayúsculas para que «alcala» encuentre «Alcalá de Henares».
function normalise(value) {
  return String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es').trim();
}

function byName(a, b) {
  return a[1].localeCompare(b[1], 'es');
}

function showStatus(message, type = 'info') {
  statusBox.className = `status${type === 'error' ? ' status--error' : type === 'success' ? ' status--success' : ''}`;
  statusBox.replaceChildren();
  const icon = document.createElement('span');
  icon.className = 'status__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = type === 'error' ? '!' : type === 'success' ? '✓' : 'ℹ';
  const text = document.createElement('span');
  text.textContent = message;
  statusBox.append(icon, text);
  statusBox.hidden = false;
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    if (!response.ok) throw new Error(`El servicio oficial ha respondido con HTTP ${response.status}.`);
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('json')) {
      throw new Error('El servicio oficial no ha devuelto JSON. Puede ser necesario ajustar la negociación de formato de la API.');
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('El servicio oficial tarda demasiado en responder. Inténtalo de nuevo en unos minutos.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function loadCcaa() {
  ccaaSelect.replaceChildren(new Option('Selecciona una comunidad', ''));
  [...CCAA].sort(byName).forEach(([id, name]) => ccaaSelect.add(new Option(name, id)));
}

function loadProvinces(ccaaId, selected = '') {
  provinceSelect.replaceChildren(new Option(ccaaId ? 'Todas las provincias' : 'Selecciona primero una comunidad', ''));
  provinceSelect.disabled = !ccaaId;
  PROVINCES.filter(province => province[2] === ccaaId).sort(byName)
    .forEach(([id, name]) => provinceSelect.add(new Option(name, id)));
  provinceSelect.value = selected;
}

function loadMunicipalities() {
  // El campo admite texto libre; la lista solo ofrece sugerencias con los municipios de la consulta.
  const towns = [...new Set(stations.map(station => station.town).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'es'));
  municipalityList.replaceChildren(...towns.map(town => new Option(town)));
  municipalityInput.disabled = towns.length === 0;
  municipalityInput.value = '';
}

function getPrice(item) {
  const raw = String(item.PrecioProducto ?? '').trim().replace(',', '.');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mapStation(item) {
  const provinceId = String(item.IDProvincia ?? '').trim();
  return {
    id: String(item.IDEESS ?? `${item['Rótulo']}-${item['Dirección']}-${item.Municipio}`),
    name: String(item['Rótulo'] ?? '').trim() || 'Estación sin rótulo',
    town: String(item.Municipio ?? item.Localidad ?? '').trim(),
    province: PROVINCE_NAMES.get(provinceId) ?? String(item.Provincia ?? '').trim(),
    address: String(item['Dirección'] ?? '').trim(),
    postcode: String(item['C.P.'] ?? '').trim(),
    price: getPrice(item),
    schedule: String(item.Horario ?? '').trim(),
    latitude: String(item.Latitud ?? '').trim(),
    longitude: String(item['Longitud (WGS84)'] ?? '').trim()
  };
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

function selectedText(select) {
  return select.selectedOptions[0]?.textContent ?? '';
}

async function searchPrices(event) {
  if (event) event.preventDefault();
  const ccaaId = ccaaSelect.value;
  const provinceId = provinceSelect.value;
  const fuelId = fuelSelect.value;
  if (!ccaaId || !fuelId) {
    showStatus('Selecciona una comunidad autónoma y un tipo de combustible.', 'error');
    return;
  }

  searchButton.disabled = true;
  searchButton.textContent = 'Consultando…';
  tableWrap.hidden = true;
  pagination.hidden = true;
  resultsBody.replaceChildren();
  showStatus('Consultando los datos oficiales del MITECO…');
  dataDate.textContent = 'Fecha de datos: consultando…';

  try {
    // Con provincia se consulta por provincia; sin ella, por toda la comunidad autónoma.
    const url = provinceId
      ? `${PRICES_BY_PROVINCE_URL}/${encodeURIComponent(provinceId)}/${encodeURIComponent(fuelId)}`
      : `${PRICES_BY_CCAA_URL}/${encodeURIComponent(ccaaId)}/${encodeURIComponent(fuelId)}`;
    const data = await fetchJson(url);
    const list = data.ListaEESSPrecio ?? data.listaEESSPrecio ?? data.ListaEESS ?? [];
    if (!Array.isArray(list)) throw new Error('La respuesta del servicio no contiene una lista de estaciones válida.');
    stations = list.map(mapStation);
    const dateText = String(data.Fecha ?? data.fecha ?? '').trim();
    currentPage = 1;
    const scope = provinceId ? selectedText(provinceSelect) : selectedText(ccaaSelect);
    resultsTitle.textContent = `Estaciones de servicio · ${scope} · ${selectedText(fuelSelect)}`;
    dataDate.textContent = `Fecha de datos: ${dateText || 'no indicada por el servicio'}`;
    loadMunicipalities();
    renderResults();
    if (!stations.length) {
      showStatus('El servicio oficial no ha devuelto estaciones para esta combinación de filtros.', 'success');
    } else {
      showStatus(`Consulta completada: ${stations.length.toLocaleString('es-ES')} estaciones recibidas del servicio oficial.`, 'success');
    }
  } catch (error) {
    stations = [];
    resultsTitle.textContent = 'Estaciones de servicio';
    loadMunicipalities();
    renderResults();
    const message = error instanceof TypeError ? 'No se ha podido conectar con el servicio oficial.' : error.message;
    showStatus(`${message} Si el problema persiste y la consola menciona CORS, consulta el apartado de incidencias del README.`, 'error');
    dataDate.textContent = 'Fecha de datos: no disponible';
  } finally {
    searchButton.disabled = false;
    searchButton.innerHTML = '<span aria-hidden="true">⌕</span> Buscar precios';
  }
}

function filteredStations() {
  const query = normalise(municipalityInput.value);
  return query ? stations.filter(station => normalise(station.town).includes(query)) : stations;
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
  hint.textContent = ' (ver en Google Maps, se abre en una pestaña nueva)';
  link.append(label, arrow, hint);
  name.append(link);

  const detail = document.createElement('span');
  detail.className = 'station-brand';
  detail.textContent = [station.postcode ? `C.P. ${station.postcode}` : '', station.province].filter(Boolean).join(' · ') || 'Estación de servicio';

  td.append(name, detail);
  return td;
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

  const town = municipalityInput.value.trim();
  if (!stations.length) {
    resultsSummary.textContent = 'Los resultados aparecerán aquí tras realizar una consulta.';
  } else if (town && !sorted.length) {
    resultsSummary.textContent = `Ninguna estación coincide con «${town}» (de ${stations.length.toLocaleString('es-ES')} en total)`;
  } else if (town) {
    resultsSummary.textContent = `${sorted.length.toLocaleString('es-ES')} estaciones que coinciden con «${town}» (de ${stations.length.toLocaleString('es-ES')} en total)`;
  } else {
    resultsSummary.textContent = `${stations.length.toLocaleString('es-ES')} estaciones encontradas`;
  }
  tableWrap.hidden = !pageItems.length;
  pagination.hidden = !sorted.length;
  pageSummary.textContent = `Página ${currentPage} de ${pageCount} · ${sorted.length.toLocaleString('es-ES')} estaciones`;
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= pageCount;
}

function changePage(delta) {
  currentPage += delta;
  renderResults();
  resultsTitle.focus();
}

form.addEventListener('submit', searchPrices);
ccaaSelect.addEventListener('change', () => loadProvinces(ccaaSelect.value));
sortSelect.addEventListener('change', () => { currentPage = 1; renderResults(); });
municipalityInput.addEventListener('input', () => { currentPage = 1; renderResults(); });
previousButton.addEventListener('click', () => { if (currentPage > 1) changePage(-1); });
nextButton.addEventListener('click', () => changePage(1));

loadCcaa();
ccaaSelect.value = '13';
loadProvinces('13', '28');
showStatus('Selecciona los filtros y pulsa «Buscar precios» para consultar los datos oficiales.');
