'use strict';

const API_BASE = 'https://energia.serviciosmin.gob.es/ServiciosRestCarburantes/PreciosCarburantes';
const PROVINCES_URL = `${API_BASE}/Listados/Provincias/`;
const PRICES_URL = `${API_BASE}/EstacionesTerrestres/FiltroProvinciaProducto`;
const PAGE_SIZE = 25;

// Códigos provinciales publicados por el listado oficial del MITECO.
const PROVINCES = [
  ['02','Albacete'],['03','Alicante / Alacant'],['04','Almería'],['01','Araba/Álava'],['33','Asturias'],['05','Ávila'],['06','Badajoz'],['07','Illes Balears'],['08','Barcelona'],['48','Bizkaia'],['09','Burgos'],['10','Cáceres'],['11','Cádiz'],['39','Cantabria'],['12','Castellón / Castelló'],['51','Ceuta'],['13','Ciudad Real'],['14','Córdoba'],['15','A Coruña'],['16','Cuenca'],['20','Gipuzkoa'],['17','Girona'],['18','Granada'],['19','Guadalajara'],['21','Huelva'],['22','Huesca'],['23','Jaén'],['24','León'],['25','Lleida'],['27','Lugo'],['28','Madrid'],['29','Málaga'],['52','Melilla'],['30','Murcia'],['31','Navarra'],['32','Ourense'],['34','Palencia'],['35','Las Palmas'],['36','Pontevedra'],['26','La Rioja'],['37','Salamanca'],['38','Santa Cruz de Tenerife'],['40','Segovia'],['41','Sevilla'],['42','Soria'],['43','Tarragona'],['44','Teruel'],['45','Toledo'],['46','Valencia / València'],['47','Valladolid'],['49','Zamora'],['50','Zaragoza']
];

// IDs de productos publicados por el servicio oficial MITECO.
const FUEL_NAMES = new Map([
  ['1', 'Gasolina 95 E5'], ['2', 'Gasolina 95 E10'], ['3', 'Gasolina 98 E5'],
  ['4', 'Gasóleo A habitual'], ['5', 'Gasóleo Premium'], ['17', 'GLP'],
  ['18', 'Gas natural comprimido'], ['19', 'Gas natural licuado'],
  ['21', 'Gasolina 98 E10'], ['27', 'Diésel renovable']
]);

const form = document.querySelector('#search-form');
const provinceSelect = document.querySelector('#province');
const fuelSelect = document.querySelector('#fuel');
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
let currentDate = '';

function normalise(value) {
  return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
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
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`El servicio oficial ha respondido con HTTP ${response.status}.`);
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('json')) {
    throw new Error('El servicio oficial no ha devuelto JSON. Puede ser necesario ajustar la negociación de formato de la API.');
  }
  return response.json();
}

function parseProvinceList(data) {
  // El listado oficial puede presentarse como una cadena compacta: ID + nombre + IDCCAA + comunidad.
  const raw = typeof data === 'string' ? data : Array.isArray(data) ? data : null;
  if (Array.isArray(raw)) return raw.map(item => ({ id: String(item.IDProvincia ?? item.id ?? ''), name: String(item.Provincia ?? item.Nombre ?? item.name ?? '') })).filter(p => p.id && p.name);
  if (raw) {
    const text = raw.trim();
    const matches = [...text.matchAll(/(\d{2})([A-ZÁÉÍÓÚÜÑ /.-]+?)(\d{2})(?=[A-ZÁÉÍÓÚÜÑ])/g)];
    if (matches.length) return matches.map(match => ({ id: match[1], name: match[2].trim() }));
  }
  if (data && typeof data === 'object') {
    const list = data.Provincias ?? data.ListaProvincias ?? data;
    if (Array.isArray(list)) return list.map(item => ({ id: String(item.IDProvincia ?? item.id ?? ''), name: String(item.Provincia ?? item.Nombre ?? item.name ?? '') })).filter(p => p.id && p.name);
  }
  throw new Error('No se ha podido interpretar el listado de provincias del servicio oficial.');
}

function loadProvinces() {
  const provinces = [...PROVINCES].sort((a, b) => a[1].localeCompare(b[1], 'es'));
  provinceSelect.replaceChildren(new Option('Selecciona una provincia', ''));
  provinces.forEach(([id, name]) => provinceSelect.add(new Option(name, id)));
  provinceSelect.value = '28';
  showStatus('Selecciona el combustible y pulsa «Buscar precios» para consultar los datos oficiales.');
}

function getPrice(station) {
  const raw = String(station.PrecioProducto ?? '').trim().replace(',', '.');
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function mapStation(item) {
  return {
    id: String(item.IDEESS ?? `${item.Rótulo}-${item.Dirección}-${item.Municipio}`),
    name: String(item['Rótulo'] ?? 'Estación sin rótulo').trim(),
    town: String(item.Municipio ?? item.Localidad ?? '').trim(),
    locality: String(item.Localidad ?? '').trim(),
    address: String(item['Dirección'] ?? '').trim(),
    postcode: String(item['C.P.'] ?? '').trim(),
    price: getPrice(item),
    schedule: String(item.Horario ?? '').trim(),
    brand: String(item['Rótulo'] ?? '').trim(),
    latitude: String(item.Latitud ?? '').trim(),
    longitude: String(item['Longitud_x0020__x0028_WGS84_x0029_'] ?? '').trim()
  };
}

async function searchPrices(event) {
  if (event) event.preventDefault();
  const provinceId = provinceSelect.value;
  const fuelId = fuelSelect.value;
  if (!provinceId || !fuelId) {
    showStatus('Selecciona una provincia y un tipo de combustible.', 'error');
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
    const url = `${PRICES_URL}/${encodeURIComponent(provinceId)}/${encodeURIComponent(fuelId)}`;
    const data = await fetchJson(url);
    const list = data.ListaEESSPrecio ?? data.listaEESSPrecio ?? data.ListaEESS ?? [];
    if (!Array.isArray(list)) throw new Error('La respuesta del servicio no contiene una lista de estaciones válida.');
    stations = list.map(mapStation);
    currentDate = String(data.Fecha ?? data.fecha ?? '').trim();
    currentPage = 1;
    resultsTitle.textContent = `Estaciones de servicio · ${provinceSelect.selectedOptions[0].textContent} · ${FUEL_NAMES.get(fuelId) ?? fuelSelect.selectedOptions[0].textContent}`;
    dataDate.textContent = `Fecha de datos: ${currentDate || 'no indicada por el servicio'}`;
    renderResults();
    if (!stations.length) {
      showStatus('El servicio oficial no ha devuelto estaciones para esta combinación de filtros.', 'success');
    } else {
      showStatus(`Consulta completada: ${stations.length.toLocaleString('es-ES')} estaciones recibidas del servicio oficial.`, 'success');
    }
  } catch (error) {
    stations = [];
    renderResults();
    showStatus(`${error.message} Si el error menciona CORS o un problema de red, consulta el apartado de incidencias del README.`, 'error');
    dataDate.textContent = 'Fecha de datos: no disponible';
  } finally {
    searchButton.disabled = false;
    searchButton.innerHTML = '<span aria-hidden="true">⌕</span> Buscar precios';
  }
}

function sortedStations() {
  const sorted = [...stations];
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

function renderResults() {
  const sorted = sortedStations();
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  currentPage = Math.min(currentPage, pageCount);
  const pageItems = sorted.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  resultsBody.replaceChildren();

  pageItems.forEach(station => {
    const row = document.createElement('tr');
    const nameCell = document.createElement('td');
    const name = document.createElement('span');
    name.className = 'station-name';
    name.textContent = station.name;
    const brand = document.createElement('span');
    brand.className = 'station-brand';
    brand.textContent = station.postcode ? `C.P. ${station.postcode}` : 'Estación de servicio';
    nameCell.append(name, brand);
    row.append(nameCell, cell(station.town), cell(station.address));

    const priceCell = document.createElement('td');
    priceCell.className = 'price-column';
    const price = document.createElement('span');
    price.className = `price${station.price === null ? ' price--missing' : ''}`;
    price.textContent = station.price === null ? 'No disponible' : `${station.price.toLocaleString('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} €/l`;
    priceCell.append(price);
    row.append(priceCell, cell(station.schedule));
    resultsBody.append(row);
  });

  resultsSummary.textContent = stations.length ? `${stations.length.toLocaleString('es-ES')} estaciones encontradas` : 'Los resultados aparecerán aquí tras realizar una consulta.';
  tableWrap.hidden = !pageItems.length;
  pagination.hidden = !sorted.length;
  pageSummary.textContent = `Página ${currentPage} de ${pageCount} · ${sorted.length.toLocaleString('es-ES')} estaciones`;
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= pageCount;
}

form.addEventListener('submit', searchPrices);
sortSelect.addEventListener('change', () => { currentPage = 1; renderResults(); });
previousButton.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderResults(); } });
nextButton.addEventListener('click', () => { currentPage++; renderResults(); });
loadProvinces();
