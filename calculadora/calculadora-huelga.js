'use strict';

/* ============================================================
   Calculadora de descuento en nómina por huelga (orientativa)
   - Lógica pura: parseNum() y calcular()  (testeable con Node)
   - Interfaz: init() / render()           (solo en navegador)
   ============================================================ */

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

/** Convierte texto escrito a la española ("1.800,50", "1800,5", "24.000") en número >= 0. */
function parseNum(raw) {
  let s = String(raw == null ? '' : raw).trim().replace(/[€\s]/g, '');
  if (!s) return 0;
  const hayComa = s.includes(',');
  const hayPunto = s.includes('.');
  if (hayComa && hayPunto) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (hayComa) {
    s = s.replace(',', '.');
  } else if (hayPunto && /^\d{1,3}(\.\d{3})+$/.test(s)) {
    s = s.replace(/\./g, '');          // "24.000" -> 24000
  }
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * p = {
 *   anual      salario bruto anual (todo lo salarial, con pagas extra incluidas)
 *   divisor    365 | 360 | días de trabajo efectivo
 *   fraccion   1 = jornada completa; horas_huelga / horas_jornada si es paro parcial
 *   dias       nº de días de huelga (modo total)
 *   porMes     true => usar diasMes
 *   diasMes    array de 12 con días por mes
 *   ss, irpf   porcentajes (0-100) que NO te retendrán sobre lo descontado
 *   ayudaDia   ayuda (caja de resistencia) por jornada completa
 * }
 */
function calcular(p) {
  const divisor = p.divisor > 0 ? p.divisor : 365;
  const diario = p.anual / divisor;
  const factorNeto = Math.max(0, 1 - (p.ss + p.irpf) / 100);
  const brutoMensual = p.anual / 12;

  let diasTotal;
  let bruto;
  let meses = null;

  if (p.porMes) {
    meses = (p.diasMes || []).map((d, i) => {
      const descuento = Math.min(brutoMensual, d * p.fraccion * diario);
      return {
        mes: MESES[i],
        dias: d,
        descuento,
        brutoNormal: brutoMensual,
        brutoConHuelga: brutoMensual - descuento,
        netoNormal: brutoMensual * factorNeto,
        netoConHuelga: (brutoMensual - descuento) * factorNeto,
      };
    });
    diasTotal = meses.reduce((a, m) => a + m.dias, 0);
    bruto = meses.reduce((a, m) => a + m.descuento, 0);
  } else {
    diasTotal = p.dias;
    bruto = p.dias * p.fraccion * diario;
  }

  const equivDias = diasTotal * p.fraccion;
  const neto = bruto * factorNeto;
  const ayuda = equivDias * (p.ayudaDia || 0);

  return {
    divisor, diario, diarioNeto: diario * factorNeto, factorNeto,
    diasTotal, equivDias, bruto, neto, ayuda,
    netoTrasAyuda: Math.max(0, neto - ayuda),
    pctAnual: p.anual > 0 ? (bruto / p.anual) * 100 : 0,
    meses,
  };
}

/* ------------------------- Interfaz ------------------------- */

function init() {
  const $ = (id) => document.getElementById(id);
  const eur = (n) => new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
  const pc = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 }).format(n) + ' %';
  const nf = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(n);
  const radio = (name) => document.querySelector('input[name="' + name + '"]:checked').value;

  // Rejilla de meses
  const grid = $('gridMeses');
  MESES.forEach((m, i) => {
    const div = document.createElement('div');
    div.className = 'mes';
    div.innerHTML = '<label for="m' + i + '">' + m + '</label>' +
      '<input id="m' + i + '" type="number" min="0" max="31" step="1" inputmode="numeric" value="0">';
    grid.appendChild(div);
  });

  let ultimoResumen = '';

  function render() {
    // --- lectura ---
    const tipoSal = radio('tipoSalario');
    const pagas = parseInt($('pagas').value, 10);
    const sal = parseNum($('salario').value);
    const anual = tipoSal === 'anual' ? sal : sal * pagas;

    const metodo = $('metodo').value;
    const diasLab = parseNum($('diasLab').value) || 220;
    const divisor = metodo === '365' ? 365 : metodo === '360' ? 360 : Math.max(1, diasLab);

    const parcial = radio('tipoHuelga') === 'parcial';
    let fraccion = 1;
    if (parcial) {
      const j = parseNum($('jornada').value);
      const h = parseNum($('horas').value);
      fraccion = j > 0 ? Math.min(1, h / j) : 0;
    }

    const porMes = $('porMes').checked;
    const dias = Math.min(366, Math.floor(parseNum($('dias').value)));
    const diasMes = MESES.map((_, i) => Math.min(31, Math.floor(parseNum($('m' + i).value))));

    // --- visibilidad ---
    $('lblSalario').textContent = tipoSal === 'anual'
      ? 'Salario bruto anual (€)' : 'Salario bruto mensual, sin prorrata de pagas (€)';
    $('bloqueParcial').hidden = !parcial;
    $('bloqueDias').hidden = porMes;
    $('bloqueMeses').hidden = !porMes;
    $('bloqueLab').hidden = metodo !== 'lab';
    $('lblDias').textContent = parcial ? 'Número de días con paro parcial' : 'Número de días de huelga';

    const out = $('contenidoResultado');
    if (anual <= 0) {
      out.innerHTML = '<p class="aviso">Introduce tu salario para ver el cálculo.</p>';
      $('btnCopiar').hidden = true;
      return;
    }

    const r = calcular({
      anual, divisor, fraccion, dias, porMes, diasMes,
      ss: Math.min(100, parseNum($('ss').value)),
      irpf: Math.min(100, parseNum($('irpf').value)),
      ayudaDia: parseNum($('ayuda').value),
    });

    if (r.diasTotal === 0 || fraccion === 0) {
      out.innerHTML = '<p class="aviso">Indica al menos un día de huelga' +
        (parcial ? ' y las horas de paro' : '') + ' para calcular el descuento.</p>';
      $('btnCopiar').hidden = true;
      return;
    }

    // --- tarjetas ---
    let html = '<div class="tarjetas">' +
      '<div class="tarjeta principal"><dt>Pérdida neta aproximada<br><small>(lo que dejarás de cobrar en mano)</small></dt><dd>' + eur(r.neto) + '</dd></div>' +
      '<div class="tarjeta"><dt>Descuento bruto en nómina</dt><dd>' + eur(r.bruto) + '</dd></div>' +
      (r.ayuda > 0
        ? '<div class="tarjeta"><dt>Pérdida neta tras ayuda sindical</dt><dd>' + eur(r.netoTrasAyuda) + '</dd></div>'
        : '') +
      '<div class="tarjeta"><dt>Por cada jornada completa</dt><dd>' + eur(r.diario) + ' <small>bruto</small><br>' + eur(r.diarioNeto) + ' <small>neto aprox.</small></dd></div>' +
      '</div>';
    html = html.replace('<div class="tarjetas">', '<dl class="tarjetas">').replace(/<\/div>$/, '</dl>');

    html += '<p class="barra-txt">Supone un <strong>' + pc(r.pctAnual) + '</strong> de tu salario bruto anual.</p>' +
      '<div class="barra" role="img" aria-label="' + pc(r.pctAnual) + ' del salario anual"><span style="width:' +
      Math.max(2, Math.min(100, r.pctAnual)) + '%"></span></div>';

    // --- tabla por meses ---
    if (r.meses) {
      html += '<h3>Tu nómina mes a mes (aprox.)</h3><div class="tabla-scroll"><table>' +
        '<caption class="sr">Estimación de nómina mensual con y sin huelga</caption>' +
        '<thead><tr><th scope="col">Mes</th><th scope="col">Días</th><th scope="col">Descuento bruto</th>' +
        '<th scope="col">Neto sin huelga</th><th scope="col">Neto con huelga</th></tr></thead><tbody>';
      r.meses.forEach((m) => {
        if (m.dias > 0) {
          html += '<tr><th scope="row">' + m.mes + '</th><td>' + m.dias + '</td><td>' + eur(m.descuento) +
            '</td><td>' + eur(m.netoNormal) + '</td><td>' + eur(m.netoConHuelga) + '</td></tr>';
        }
      });
      html += '</tbody></table></div>';
    }

    // --- sensibilidad ---
    html += '<h3>Referencia rápida</h3><div class="tabla-scroll"><table>' +
      '<caption class="sr">Pérdida según número de días de huelga</caption>' +
      '<thead><tr><th scope="col">Días de huelga</th><th scope="col">Bruto</th><th scope="col">Neto aprox.</th></tr></thead><tbody>';
    [1, 2, 3, 5, 10, 15, 20].forEach((n) => {
      const b = n * fraccion * r.diario;
      html += '<tr><th scope="row">' + n + '</th><td>' + eur(b) + '</td><td>' + eur(b * r.factorNeto) + '</td></tr>';
    });
    html += '</tbody></table></div>';

    // --- explicación ---
    const etiquetaDivisor = metodo === '365' ? '365 días naturales' : metodo === '360' ? '360 (mensual / 30 días)' : divisor + ' días de trabajo efectivo';
    html += '<details><summary>¿Cómo se ha calculado?</summary><ol>' +
      '<li>Salario bruto anual: <strong>' + eur(anual) + '</strong>' +
      (tipoSal === 'mensual' ? ' (' + eur(sal) + ' × ' + pagas + ' pagas)' : '') + '.</li>' +
      '<li>Valor de un día: ' + eur(anual) + ' ÷ ' + etiquetaDivisor + ' = <strong>' + eur(r.diario) + '</strong>.</li>' +
      '<li>Jornadas equivalentes de huelga: <strong>' + nf(r.equivDias) + '</strong>' +
      (parcial ? ' (' + r.diasTotal + ' días × ' + nf(fraccion * 100) + ' % de la jornada)' : '') + '.</li>' +
      '<li>Descuento bruto: ' + nf(r.equivDias) + ' × ' + eur(r.diario) + ' = <strong>' + eur(r.bruto) + '</strong>.</li>' +
      '<li>Como en los días de huelga no se cotiza ni se retiene IRPF sobre lo descontado, restamos esos porcentajes ('
      + nf(Math.min(100, parseNum($('ss').value))) + ' % SS + ' + nf(Math.min(100, parseNum($('irpf').value))) + ' % IRPF): neto ≈ <strong>' + eur(r.neto) + '</strong>.</li>' +
      '</ol></details>';

    out.innerHTML = html;
    $('btnCopiar').hidden = false;

    ultimoResumen = 'Estimación de descuento por huelga\n' +
      '- Salario bruto anual: ' + eur(anual) + '\n' +
      '- Jornadas de huelga equivalentes: ' + nf(r.equivDias) + '\n' +
      '- Valor de un día (bruto): ' + eur(r.diario) + '\n' +
      '- Descuento bruto en nómina: ' + eur(r.bruto) + '\n' +
      '- Pérdida neta aproximada: ' + eur(r.neto) + '\n' +
      (r.ayuda > 0 ? '- Pérdida neta tras ayuda sindical: ' + eur(r.netoTrasAyuda) + '\n' : '') +
      'Cálculo orientativo; depende de tu convenio y de tu nómina real.';
  }

  $('form').addEventListener('input', render);
  $('form').addEventListener('change', render);
  $('form').addEventListener('submit', (e) => e.preventDefault());

  $('btnCopiar').addEventListener('click', async () => {
    const estado = $('estadoCopia');
    try {
      await navigator.clipboard.writeText(ultimoResumen);
      estado.textContent = 'Resumen copiado al portapapeles.';
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = ultimoResumen;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); estado.textContent = 'Resumen copiado al portapapeles.'; }
      catch (err) { estado.textContent = 'No se pudo copiar. Selecciona el texto manualmente.'; }
      document.body.removeChild(ta);
    }
    setTimeout(() => { estado.textContent = ''; }, 4000);
  });

  render();
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', init);
}
if (typeof module !== 'undefined') {
  module.exports = { parseNum, calcular };
}
