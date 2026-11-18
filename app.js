// ===== CONFIGURACIÓN =====
const API_URL = 'https://script.google.com/macros/s/AKfycbygzKsKB-QoUcvcWY5nKcAJ2BuqL23lnvUQ3BFbu-ulZScbabN6EZmpg3Krvh4DURyb/exec';

const LABELS = { I: 'Instalado', P: 'Pendiente', R: 'Rechazado', AM: 'Pendiente anterior mes' };
const COLORS = { I: '#10B981', P: '#F59E0B', R: '#EF4444', AM: '#6D3FD1' };
const NOMBRES_MES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const EYE = '<svg class="eye" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="Ojo"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';

let DATOS = [];
let MESES = [];                                              // meses disponibles (los entrega la hoja CONFIG)
let MES_SEL = sessionStorage.getItem('mes') || 'ACTUAL';
let MES_LABEL = '';
let donut = null, dias = null;
let editRow = null;
let ordenEj = 'generados';                                   // 'generados' | 'instalados'
let soloOjo = false;
let ordenFecha = 'asc';                                      // orden por fecha de ingreso: 'asc' | 'desc'
const ICO_ORDEN = {
  asc: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>',
  desc: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>'
};
const esAdmin = () => session?.role === 'admin';
const ABIERTOS = new Set();                                  // filas desplegadas
let session = JSON.parse(sessionStorage.getItem('session') || 'null');
let urlEj = new URLSearchParams(location.search).get('ejecutivo');

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n, t) => t ? Math.round(n / t * 100) : 0;
const fmtFecha = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const fmtCorta = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-BO', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

// ===== API =====
async function api(body) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
    body: JSON.stringify({ token: session?.token, ...body })
  });
  const json = await res.json();
  if (json.expired) logout();
  return json;
}

// ===== LOGIN =====
async function login() {
  const btn = $('btn-login'), err = $('login-error');
  err.textContent = '';
  btn.disabled = true;
  try {
    const r = await api({ action: 'login', password: $('password').value });
    if (!r.ok) { err.textContent = r.error; return; }
    session = { token: r.token, role: r.role };
    sessionStorage.setItem('session', JSON.stringify(session));
    $('password').value = '';
    await startApp();
  } catch (e) {
    err.textContent = 'No se pudo conectar. Revisa la URL de la API.';
  } finally { btn.disabled = false; }
}

function logout() {
  session = null;
  DATOS = [];
  sessionStorage.removeItem('session');
  sessionStorage.removeItem('mes');
  MES_SEL = 'ACTUAL';
  document.body.classList.remove('is-admin');
  cerrarMenu();
  $('dashboard').hidden = true;
  $('login-screen').hidden = false;
}

async function startApp() {
  $('login-screen').hidden = true;
  $('dashboard').hidden = false;
  document.body.classList.toggle('is-admin', session.role === 'admin');
  await cargar();
}

// Aplica la respuesta del servidor (ventas del mes + meses disponibles)
function aplicar(r) {
  DATOS = r.data;
  MESES = r.meses || [];
  MES_SEL = r.mes || 'ACTUAL';
  MES_LABEL = r.mesLabel || '';
  sessionStorage.setItem('mes', MES_SEL);
  inicializar();
}

async function cargar() {
  $('sidebar-status').textContent = 'Actualizando...';
  $('sel-mes').disabled = true;
  try {
    const r = await api({ action: 'list', mes: esAdmin() ? MES_SEL : 'ACTUAL' });
    if (!r.ok) throw new Error(r.error);
    aplicar(r);
    $('sidebar-status').textContent = session.role === 'admin' ? '● Conectado (admin)' : '● Conectado';
  } catch (e) {
    $('sidebar-status').textContent = '● Error de conexión';
  } finally { $('sel-mes').disabled = false; }
}

// ===== INICIALIZAR =====
function llenarSelect(id, valores, todosTxt) {
  const sel = $(id), actual = sel.value;
  sel.innerHTML = (todosTxt ? `<option value="todos">${todosTxt}</option>` : '') +
    valores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
}

function renderMeses() {
  $('sel-mes').innerHTML = MESES.map(m =>
    `<option value="${esc(m.id)}">${esc(m.label)}${m.actual ? ' (mes actual)' : ''}</option>`).join('');
  $('sel-mes').value = MES_SEL;
  $('mesbar').hidden = !esAdmin() || MESES.length === 0;   // solo el administrador se mueve entre hojas
}

function inicializar() {
  const ejs = [...new Set(DATOS.map(d => d.ejecutivo))].sort();
  const planes = [...new Set(DATOS.map(d => d.plan))].sort();
  ABIERTOS.clear();
  renderMeses();
  llenarSelect('filtro-ej-resumen', ejs, 'Todos los ejecutivos');
  llenarSelect('f-ejecutivo', ejs, 'Todos los ejecutivos');
  llenarSelect('f-plan', planes, 'Todos los planes');
  llenarSelect('sel-ej', ejs);
  $('lista-ej-datos').innerHTML = ejs.map(e => `<option value="${esc(e)}">`).join('');

  if (urlEj) {
    const ej = urlEj.toUpperCase();
    ['filtro-ej-resumen', 'f-ejecutivo', 'sel-ej'].forEach(id => { $(id).value = ej; });
    urlEj = null;
  }
  const etiqueta = MES_LABEL ? ` de ${MES_LABEL}` : '';
  $('detalle-subtitle').textContent = `Todos los registros${etiqueta}`;
  $('sidebar-count').textContent = `${MES_LABEL ? MES_LABEL + ': ' : ''}${DATOS.length} registros`;
  renderResumen();
  renderTabla();
  renderEjecutivo();
}

// ===== RENDER =====
function conteo(datos) {
  const c = { total: datos.length, I: 0, P: 0, R: 0, AM: 0 };
  datos.forEach(d => { if (c[d.estado] !== undefined) c[d.estado]++; });
  return c;
}

function metricsHTML(c, conPct) {
  const card = (cls, label, n) => `
    <div class="metric-card ${cls}">
      <div class="metric-label">${label}</div>
      <div class="metric-value">${n}</div>
      ${conPct ? `<div class="metric-sub">${cls === 'total' ? 'registros en la hoja' : pct(n, c.total) + '% del total'}</div>` : ''}
    </div>`;
  return card('total', 'Total generados', c.total) + card('inst', 'Instalados', c.I) +
    card('pend', 'Pendientes', c.P) + card('anul', 'Rechazados', c.R) + card('am', 'Pendiente anterior mes', c.AM);
}

// Mes de referencia para el gráfico por día: sale de la etiqueta (NOV26); si no hay, del mes más frecuente
function mesReferencia(datos) {
  const m = /^([A-Z]{3})(\d{2})$/.exec(MES_LABEL);
  if (m && NOMBRES_MES.includes(m[1])) return { y: 2000 + Number(m[2]), m: NOMBRES_MES.indexOf(m[1]) };
  const frec = {};
  datos.forEach(d => { if (d.fecha) frec[d.fecha.slice(0, 7)] = (frec[d.fecha.slice(0, 7)] || 0) + 1; });
  const top = Object.entries(frec).sort((a, b) => b[1] - a[1])[0];
  if (top) return { y: Number(top[0].slice(0, 4)), m: Number(top[0].slice(5, 7)) - 1 };
  const h = new Date();
  return { y: h.getFullYear(), m: h.getMonth() };
}

function renderDias(datos) {
  const { y, m } = mesReferencia(datos);
  const clave = `${y}-${String(m + 1).padStart(2, '0')}`;
  const nDias = new Date(y, m + 1, 0).getDate();
  const cuenta = new Array(nDias).fill(0);
  let otros = 0;
  datos.forEach(d => {
    if (d.fecha && d.fecha.slice(0, 7) === clave) cuenta[Number(d.fecha.slice(8, 10)) - 1]++;
    else otros++;
  });
  const total = cuenta.reduce((a, b) => a + b, 0);
  const max = Math.max(...cuenta);
  const nombreMes = `${NOMBRES_MES[m]}${String(y).slice(-2)}`;

  $('dias-resumen').textContent = total
    ? `${total} en ${nombreMes}, día con más ingresos: ${cuenta.indexOf(max) + 1} (${max})`
    : `Sin ventas ingresadas en ${nombreMes}`;
  $('dias-nota').textContent = otros
    ? `${otros} registro${otros === 1 ? '' : 's'} sin fecha de ingreso de este mes no se cuenta${otros === 1 ? '' : 'n'} en el gráfico.`
    : '';

  if (dias) dias.destroy();
  dias = new Chart($('diasChart'), {
    type: 'bar',
    data: {
      labels: cuenta.map((_, i) => i + 1),
      datasets: [{ label: 'Ventas ingresadas', data: cuenta, backgroundColor: '#6D3FD1', borderRadius: 4, maxBarThickness: 18 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { title: i => `Día ${i[0].label}`, label: c => `${c.parsed.y} ${c.parsed.y === 1 ? 'venta' : 'ventas'}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { autoSkip: true, maxRotation: 0 } },
        y: { beginAtZero: true, ticks: { precision: 0 } }
      }
    }
  });
}

function renderResumen() {
  const ej = $('filtro-ej-resumen').value;
  const datos = ej === 'todos' ? DATOS : DATOS.filter(d => d.ejecutivo === ej);
  const c = conteo(datos);
  $('resumen-title').textContent = MESES.find(m => m.id === MES_SEL)?.actual === false ? `Resumen de ${MES_LABEL}` : 'Resumen del mes actual';
  $('resumen-subtitle').textContent = (MES_LABEL ? `${MES_LABEL}: ` : '') + (ej === 'todos' ? 'todos los ejecutivos' : ej);
  $('metrics').innerHTML = metricsHTML(c, true);

  const claves = ['I', 'P', 'R', 'AM'];
  if (donut) donut.destroy();
  donut = new Chart($('donutChart'), {
    type: 'doughnut',
    data: { labels: claves.map(k => LABELS[k]), datasets: [{ data: claves.map(k => c[k]), backgroundColor: claves.map(k => COLORS[k]), borderWidth: 0, hoverOffset: 4 }] },
    options: { responsive: false, cutout: '72%', plugins: { legend: { display: false } } }
  });
  $('donutLegend').innerHTML = claves.map(k => `
    <div class="dl-item">
      <div class="dl-label"><span class="dl-dot" style="background:${COLORS[k]}"></span>${LABELS[k]}</div>
      <div><span class="dl-val">${c[k]}</span><span class="dl-pct">${pct(c[k], c.total)}%</span></div>
    </div>`).join('');

  renderDias(datos);

  // Ejecutivos ordenados de mayor a menor (desempate: la otra métrica, luego nombre)
  const filas = [...new Set(datos.map(d => d.ejecutivo))].map(nombre => ({ nombre, e: conteo(datos.filter(d => d.ejecutivo === nombre)) }));
  filas.sort((a, b) => ordenEj === 'instalados'
    ? (b.e.I - a.e.I) || (b.e.total - a.e.total) || a.nombre.localeCompare(b.nombre)
    : (b.e.total - a.e.total) || (b.e.I - a.e.I) || a.nombre.localeCompare(b.nombre));
  document.querySelectorAll('#ej-orden [data-orden]').forEach(b => {
    const on = b.dataset.orden === ordenEj;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  });
  $('ej-bars').innerHTML = filas.map(({ nombre, e }) => {
    const ini = nombre.split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2);
    const valor = ordenEj === 'instalados' ? e.I : e.total;
    return `
      <div class="ej-row">
        <div class="avatar">${esc(ini)}</div>
        <div class="ej-info">
          <div class="ej-name">${esc(nombre)}</div>
          <div class="stacked-bar">${claves.map(k => `<div class="sb-seg" style="width:${pct(e[k], e.total)}%;background:${COLORS[k]}"></div>`).join('')}</div>
          <div class="ej-counts">${claves.map(k => `<span style="color:${COLORS[k]}">${e[k]} ${LABELS[k].toLowerCase()}</span>`).join('')}</div>
        </div>
        <div class="ej-total"><b>${valor}</b><small>${ordenEj === 'instalados' ? 'instalados' : 'generados'}</small></div>
      </div>`;
  }).join('') || '<div class="empty">Sin datos</div>';
}

// ===== LISTA DE VENTAS (con detalle desplegable) =====
function filaHTML(d, i, conEj) {
  const abierto = ABIERTOS.has(d.row);
  const obsIni = String(d.obs || '').replace(/\s+/g, ' ').trim();   // inicio de la observación (se recorta por CSS)
  return `
    <div class="v-row${d.ojo ? ' ojo' : ''}${abierto ? ' open' : ''}" data-row="${d.row}">
      <div class="v-main" role="button" tabindex="0" aria-expanded="${abierto}">
        <span class="v-n muted">${i + 1}</span>
        <span class="v-plan" title="${esc(d.plan)}">${esc(d.plan)}</span>
        <span class="v-estado"><span class="badge ${esc(d.estado)}">${esc(LABELS[d.estado] || d.estado)}</span></span>
        ${conEj ? `<span class="v-ej" title="${esc(d.ejecutivo)}">${esc(d.ejecutivo)}</span>` : ''}
        <span class="v-cliente">
          <span class="v-cli-top">${d.ojo ? EYE : ''}<span class="v-cliente-txt" title="${esc(d.cliente)}">${esc(d.cliente)}</span></span>
          ${obsIni ? `<span class="v-obs-wide" title="${esc(obsIni)}">${esc(obsIni)}</span>` : ''}
        </span>
        <span class="v-nums"><span>${esc(d.celular || '-')}</span><span class="v-ref-m"><small>Ref</small> ${esc(d.referencia || '-')}</span></span>
        ${obsIni ? `<span class="v-obs-mini">${esc(obsIni)}</span>` : ''}
        <span class="v-cel">${esc(d.celular)}</span>
        <span class="v-ref" title="${esc(d.referencia)}">${esc(d.referencia)}</span>
        <span class="v-fi">${fmtCorta(d.fecha)}</span>
        <span class="v-fins">${fmtCorta(d.fecIns)}</span>
        <span class="v-chev" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span>
      </div>
      <div class="v-detail"${abierto ? '' : ' hidden'}>
        <dl class="v-dl">
          <div class="only-mini v-plan-d"><dt>Plan</dt><dd>${d.plan ? esc(d.plan) : '<span class="muted">Sin plan</span>'}</dd></div>
          <div class="only-mini"><dt>Fecha de ingreso</dt><dd>${fmtFecha(d.fecha) || '<span class="muted">Sin fecha</span>'}</dd></div>
          <div class="only-mini"><dt>Fecha de instalación</dt><dd>${fmtFecha(d.fecIns) || '<span class="muted">Sin fecha</span>'}</dd></div>
          <div class="v-obs"><dt>Observaciones</dt><dd>${d.obs ? esc(d.obs) : '<span class="muted">Sin observaciones</span>'}</dd></div>
        </dl>
        <div class="v-actions admin-only">
          <button class="btn btn-ghost btn-sm" data-ojo="${d.row}">${d.ojo ? 'Quitar Ojo' : 'Marcar Ojo'}</button>
          <button class="btn btn-ghost btn-sm" data-edit="${d.row}">Editar</button>
          <button class="btn btn-danger btn-sm" data-del="${d.row}">Eliminar</button>
        </div>
      </div>
    </div>`;
}

function listaHTML(filas, conEj) {
  if (!filas.length) return '<div class="empty">No hay registros con estos filtros</div>';
  const head = `<div class="v-head"><span>Nro</span><span>Plan</span><span>Estado</span>${conEj ? '<span>Ejecutivo</span>' : ''}<span>Cliente</span><span>Celular</span><span>Referencia</span><span>Fecha ingreso</span><span>Fecha instalación</span><span></span></div>`;
  return `<div class="v-list${conEj ? ' con-ej' : ''}">${head}${filas.map((d, i) => filaHTML(d, i, conEj)).join('')}</div>`;
}

// Ordena por fecha de ingreso; los registros sin fecha quedan al final en ambos sentidos
function ordenar(filas) {
  const dir = ordenFecha === 'desc' ? -1 : 1;
  return [...filas].sort((a, b) => {
    if (!a.fecha && !b.fecha) return (a.row - b.row) * dir;
    if (!a.fecha) return 1;
    if (!b.fecha) return -1;
    return (a.fecha.localeCompare(b.fecha) || (a.row - b.row)) * dir;
  });
}

function pintarOrden() {
  const txt = ordenFecha === 'desc' ? 'más recientes' : 'más antiguas';
  document.querySelectorAll('.sort-btn').forEach(b => {
    b.innerHTML = `${ICO_ORDEN[ordenFecha]}<span>Ingreso: ${txt}</span>`;
    b.setAttribute('aria-label', `Ordenado por fecha de ingreso, ${txt} primero. Tocar para invertir`);
  });
}

function renderTabla() {
  const fe = $('f-ejecutivo').value, fs = $('f-estado').value, fp = $('f-plan').value;
  const fn = $('f-nombre').value.toLowerCase().trim();
  const filas = ordenar(DATOS.filter(d =>
    (fe === 'todos' || d.ejecutivo === fe) && (fs === 'todos' || d.estado === fs) &&
    (fp === 'todos' || d.plan === fp) && (!soloOjo || d.ojo) &&
    (!fn || [d.cliente, d.celular, d.referencia].some(t => String(t || '').toLowerCase().includes(fn)))));
  const activos = [fe, fs, fp].filter(v => v !== 'todos').length;
  $('btn-filtros').textContent = activos ? `Filtros (${activos})` : 'Filtros';
  $('count-detalle').textContent = `${filas.length} de ${DATOS.length} registros`;
  pintarOrden();
  $('lista-detalle').innerHTML = listaHTML(filas, true);
}

function renderEjecutivo() {
  const ej = $('sel-ej').value, fs = $('f-estado-ej').value;
  if (!ej) { $('lista-ej').innerHTML = ''; $('metrics-ej').innerHTML = ''; return; }
  const propios = DATOS.filter(d => d.ejecutivo === ej);
  $('ej-table-title').textContent = `Ventas de ${ej}`;
  $('metrics-ej').innerHTML = metricsHTML(conteo(propios), false);
  const filasEj = ordenar(fs === 'todos' ? propios : propios.filter(d => d.estado === fs));
  $('count-ej').textContent = `${filasEj.length} registro${filasEj.length === 1 ? '' : 's'}`;
  pintarOrden();
  $('lista-ej').innerHTML = listaHTML(filasEj, false);
}

function toggleFila(rowEl) {
  const id = Number(rowEl.dataset.row);
  const abre = !rowEl.classList.contains('open');
  rowEl.classList.toggle('open', abre);
  rowEl.querySelector('.v-main').setAttribute('aria-expanded', abre);
  rowEl.querySelector('.v-detail').hidden = !abre;
  abre ? ABIERTOS.add(id) : ABIERTOS.delete(id);
}

// ===== CRUD (admin) =====
function abrirModal(row) {
  if (!esAdmin()) return;
  editRow = row;
  const f = $('form-reg');
  f.reset();
  $('form-status').textContent = '';
  $('modal-title').textContent = row ? 'Editar registro' : 'Nuevo registro';
  if (row) {
    const d = DATOS.find(x => x.row === row);
    Object.keys(d).forEach(k => {
      const el = f.elements[k];
      if (!el) return;
      if (el.type === 'checkbox') el.checked = !!d[k];
      else el.value = d[k] ?? '';
    });
  }
  $('modal').hidden = false;
}
const cerrarModal = () => { $('modal').hidden = true; };

async function guardar(ev) {
  ev.preventDefault();
  const btn = $('btn-save'), st = $('form-status');
  const reg = Object.fromEntries(new FormData($('form-reg')));
  reg.ojo = $('form-reg').elements.ojo.checked;
  btn.disabled = true;
  st.className = 'status-msg';
  st.textContent = 'Guardando...';
  try {
    const r = await api(editRow ? { action: 'update', mes: MES_SEL, row: editRow, reg } : { action: 'add', mes: MES_SEL, reg });
    if (!r.ok) throw new Error(r.error);
    cerrarModal();
    aplicar(r);
  } catch (e) {
    st.className = 'status-msg err';
    st.textContent = 'No se pudo guardar: ' + e.message;
  } finally { btn.disabled = false; }
}

async function eliminar(row) {
  if (!esAdmin()) return;
  const d = DATOS.find(x => x.row === row);
  if (!confirm(`¿Eliminar el registro de "${d.cliente}"? Se borrará también de la hoja de Google.`)) return;
  try {
    const r = await api({ action: 'delete', mes: MES_SEL, row });
    if (!r.ok) throw new Error(r.error);
    aplicar(r);
  } catch (e) { alert('No se pudo eliminar: ' + e.message); }
}

// Marca o quita el Ojo sin cerrar el detalle abierto
async function alternarOjo(row) {
  if (!esAdmin()) return;
  const d = DATOS.find(x => x.row === row);
  const nuevo = !d.ojo;
  d.ojo = nuevo;
  renderTabla(); renderEjecutivo();
  try {
    const r = await api({ action: 'ojo', mes: MES_SEL, row, valor: nuevo });
    if (!r.ok) throw new Error(r.error);
    DATOS = r.data;
  } catch (e) {
    d.ojo = !nuevo;
    alert('No se pudo cambiar el Ojo: ' + e.message);
  }
  renderTabla(); renderEjecutivo();
}

// ===== MENÚ MÓVIL =====
function cerrarMenu() { $('sidebar').classList.remove('open'); $('scrim').hidden = true; }
function alternarMenu() {
  const abre = !$('sidebar').classList.contains('open');
  $('sidebar').classList.toggle('open', abre);
  $('scrim').hidden = !abre;
}

// ===== EVENTOS =====
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  cerrarMenu();
  window.scrollTo(0, 0);
}

document.addEventListener('DOMContentLoaded', () => {
  $('btn-login').onclick = login;
  $('password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $('btn-logout').onclick = logout;
  $('btn-refresh').onclick = () => { cerrarMenu(); cargar(); };
  $('btn-menu').onclick = alternarMenu;
  $('scrim').onclick = cerrarMenu;
  $('btn-nuevo').onclick = () => abrirModal(null);
  $('btn-cancel').onclick = cerrarModal;
  $('form-reg').onsubmit = guardar;
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.onclick = () => switchView(n.dataset.view));

  $('sel-mes').onchange = () => { MES_SEL = $('sel-mes').value; cargar(); };
  $('filtro-ej-resumen').onchange = renderResumen;
  $('ej-orden').onclick = e => {
    const b = e.target.closest('[data-orden]');
    if (!b) return;
    ordenEj = b.dataset.orden;
    renderResumen();
  };
  ['f-nombre', 'f-ejecutivo', 'f-estado', 'f-plan'].forEach(id => $(id).addEventListener('input', renderTabla));
  $('btn-filtros').onclick = () => {
    const abre = !$('filtros').classList.contains('open');
    $('filtros').classList.toggle('open', abre);
    $('btn-filtros').setAttribute('aria-expanded', abre);
  };
  $('f-ojo').onclick = () => {
    soloOjo = !soloOjo;
    $('f-ojo').classList.toggle('on', soloOjo);
    $('f-ojo').setAttribute('aria-pressed', soloOjo);
    renderTabla();
  };
  ['sel-ej', 'f-estado-ej'].forEach(id => $(id).onchange = renderEjecutivo);

  document.addEventListener('click', e => {
    if (e.target.closest('.sort-btn')) {
      ordenFecha = ordenFecha === 'asc' ? 'desc' : 'asc';
      renderTabla(); renderEjecutivo();
      return;
    }
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]'), oj = e.target.closest('[data-ojo]');
    if (ed) return abrirModal(Number(ed.dataset.edit));
    if (del) return eliminar(Number(del.dataset.del));
    if (oj) return alternarOjo(Number(oj.dataset.ojo));
    const main = e.target.closest('.v-main');
    if (main) toggleFila(main.closest('.v-row'));
  });
  document.addEventListener('keydown', e => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.classList?.contains('v-main')) {
      e.preventDefault();
      toggleFila(e.target.closest('.v-row'));
    }
    if (e.key === 'Escape') { cerrarModal(); cerrarMenu(); }
  });

  pintarOrden();
  if (session) startApp(); // sesión activa en esta pestaña
});
