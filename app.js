// ===== CONFIGURACIÓN =====
const API_URL = 'https://script.google.com/macros/s/AKfycbzlw_U2UlEAzJPJmFxHjFt-IOkj5kKimv6FsdhjWyrIaZTc_nxcrVD3P-Jsx1MbNVqt/exec';

const LABELS = { I: 'Instalado', P: 'Pendiente', R: 'Rechazado', AM: 'Pendiente anterior mes' };
const COLORS = { I: '#10B981', P: '#F59E0B', R: '#EF4444', AM: '#6D3FD1' };

let DATOS = [];
let donut = null;
let editRow = null;
let session = JSON.parse(sessionStorage.getItem('session') || 'null');
let urlEj = new URLSearchParams(location.search).get('ejecutivo');

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (n, t) => t ? Math.round(n / t * 100) : 0;
const fmtFecha = d => d ? new Date(d + 'T12:00:00').toLocaleDateString('es-BO', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

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
  document.body.classList.remove('is-admin');
  $('dashboard').hidden = true;
  $('login-screen').hidden = false;
}

async function startApp() {
  $('login-screen').hidden = true;
  $('dashboard').hidden = false;
  document.body.classList.toggle('is-admin', session.role === 'admin');
  await cargar();
}

async function cargar() {
  $('sidebar-status').textContent = 'Actualizando...';
  try {
    const r = await api({ action: 'list' });
    if (!r.ok) throw new Error(r.error);
    DATOS = r.data;
    $('sidebar-status').textContent = session.role === 'admin' ? '● Conectado (admin)' : '● Conectado';
    inicializar();
  } catch (e) {
    $('sidebar-status').textContent = '● Error de conexión';
  }
}

// ===== INICIALIZAR =====
function llenarSelect(id, valores, todosTxt) {
  const sel = $(id), actual = sel.value;
  sel.innerHTML = (todosTxt ? `<option value="todos">${todosTxt}</option>` : '') +
    valores.map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('');
  if ([...sel.options].some(o => o.value === actual)) sel.value = actual;
}

function inicializar() {
  const ejs = [...new Set(DATOS.map(d => d.ejecutivo))].sort();
  const planes = [...new Set(DATOS.map(d => d.plan))].sort();
  llenarSelect('filtro-ej-resumen', ejs, 'Todos los ejecutivos');
  llenarSelect('f-ejecutivo', ejs, 'Todos los ejecutivos');
  llenarSelect('f-plan', planes, 'Todos los planes');
  llenarSelect('sel-ej', ejs);
  $('lista-ej').innerHTML = ejs.map(e => `<option value="${esc(e)}">`).join('');

  if (urlEj) {
    const ej = urlEj.toUpperCase();
    ['filtro-ej-resumen', 'f-ejecutivo', 'sel-ej'].forEach(id => { $(id).value = ej; });
    urlEj = null;
  }
  $('sidebar-count').textContent = `${DATOS.length} registros`;
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

function renderResumen() {
  const ej = $('filtro-ej-resumen').value;
  const datos = ej === 'todos' ? DATOS : DATOS.filter(d => d.ejecutivo === ej);
  const c = conteo(datos);
  $('resumen-subtitle').textContent = ej === 'todos' ? 'Mostrando todos los ejecutivos' : `Filtrando por: ${ej}`;
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

  const ejs = [...new Set(datos.map(d => d.ejecutivo))].sort();
  $('ej-bars').innerHTML = ejs.map(nombre => {
    const e = conteo(datos.filter(d => d.ejecutivo === nombre));
    const ini = nombre.split(' ').map(w => w[0]).join('').slice(0, 2);
    return `
      <div class="ej-row">
        <div class="avatar">${esc(ini)}</div>
        <div class="ej-info">
          <div class="ej-name">${esc(nombre)}</div>
          <div class="stacked-bar">${claves.map(k => `<div class="sb-seg" style="width:${pct(e[k], e.total)}%;background:${COLORS[k]}"></div>`).join('')}</div>
          <div class="ej-counts">${claves.map(k => `<span style="color:${COLORS[k]}">${e[k]} ${LABELS[k].toLowerCase()}</span>`).join('')}</div>
        </div>
        <div class="ej-total">${e.total}</div>
      </div>`;
  }).join('') || '<div class="empty">Sin datos</div>';
}

function tablaHTML(filas, conEjecutivo) {
  const cols = ['Nro', 'Plan', 'Estado', ...(conEjecutivo ? ['Ejecutivo'] : []), 'Cliente', 'Celular', 'Fecha ingreso', 'Fecha instalación', 'Obs.'];
  const head = `<thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}<th class="admin-only">Acciones</th></tr></thead>`;
  if (!filas.length) return head + `<tbody><tr><td colspan="${cols.length + 1}"><div class="empty">No hay registros con estos filtros</div></td></tr></tbody>`;
  return head + '<tbody>' + filas.map((d, i) => `
    <tr>
      <td class="muted">${i + 1}</td>
      <td>${esc(d.plan)}</td>
      <td><span class="badge ${esc(d.estado)}">${esc(LABELS[d.estado] || d.estado)}</span></td>
      ${conEjecutivo ? `<td>${esc(d.ejecutivo)}</td>` : ''}
      <td>${esc(d.cliente)}</td>
      <td>${esc(d.celular)}</td>
      <td>${fmtFecha(d.fecha)}</td>
      <td>${fmtFecha(d.fecIns)}</td>
      <td class="muted">${esc(d.obs)}</td>
      <td class="admin-only"><div class="actions">
        <button class="btn btn-ghost btn-sm" data-edit="${d.row}">Editar</button>
        <button class="btn btn-danger btn-sm" data-del="${d.row}">Eliminar</button>
      </div></td>
    </tr>`).join('') + '</tbody>';
}

function renderTabla() {
  const fe = $('f-ejecutivo').value, fs = $('f-estado').value, fp = $('f-plan').value;
  const fn = $('f-nombre').value.toLowerCase().trim();
  const filas = DATOS.filter(d =>
    (fe === 'todos' || d.ejecutivo === fe) && (fs === 'todos' || d.estado === fs) &&
    (fp === 'todos' || d.plan === fp) && (!fn || d.cliente.toLowerCase().includes(fn)));
  $('tabla-detalle').innerHTML = tablaHTML(filas, true);
}

function renderEjecutivo() {
  const ej = $('sel-ej').value, fs = $('f-estado-ej').value;
  if (!ej) { $('tabla-ej').innerHTML = ''; $('metrics-ej').innerHTML = ''; return; }
  const propios = DATOS.filter(d => d.ejecutivo === ej);
  $('ej-table-title').textContent = `Ventas de ${ej}`;
  $('metrics-ej').innerHTML = metricsHTML(conteo(propios), false);
  $('tabla-ej').innerHTML = tablaHTML(fs === 'todos' ? propios : propios.filter(d => d.estado === fs), false);
}

// ===== CRUD (admin) =====
function abrirModal(row) {
  editRow = row;
  const f = $('form-reg');
  f.reset();
  $('form-status').textContent = '';
  $('modal-title').textContent = row ? 'Editar registro' : 'Nuevo registro';
  if (row) {
    const d = DATOS.find(x => x.row === row);
    Object.keys(d).forEach(k => { if (f.elements[k]) f.elements[k].value = d[k]; });
  }
  $('modal').hidden = false;
}
const cerrarModal = () => { $('modal').hidden = true; };

async function guardar(ev) {
  ev.preventDefault();
  const btn = $('btn-save'), st = $('form-status');
  const reg = Object.fromEntries(new FormData($('form-reg')));
  btn.disabled = true;
  st.className = 'status-msg';
  st.textContent = 'Guardando...';
  try {
    const r = await api(editRow ? { action: 'update', row: editRow, reg } : { action: 'add', reg });
    if (!r.ok) throw new Error(r.error);
    DATOS = r.data;
    cerrarModal();
    inicializar();
  } catch (e) {
    st.className = 'status-msg err';
    st.textContent = 'No se pudo guardar: ' + e.message;
  } finally { btn.disabled = false; }
}

async function eliminar(row) {
  const d = DATOS.find(x => x.row === row);
  if (!confirm(`¿Eliminar el registro de "${d.cliente}"? Se borrará también de la hoja de Google.`)) return;
  try {
    const r = await api({ action: 'delete', row });
    if (!r.ok) throw new Error(r.error);
    DATOS = r.data;
    inicializar();
  } catch (e) { alert('No se pudo eliminar: ' + e.message); }
}

// ===== EVENTOS =====
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  $('sidebar').classList.remove('open');
}

document.addEventListener('DOMContentLoaded', () => {
  $('btn-login').onclick = login;
  $('password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
  $('btn-logout').onclick = logout;
  $('btn-refresh').onclick = cargar;
  $('btn-menu').onclick = () => $('sidebar').classList.toggle('open');
  $('btn-nuevo').onclick = () => abrirModal(null);
  $('btn-cancel').onclick = cerrarModal;
  $('form-reg').onsubmit = guardar;
  document.querySelectorAll('.nav-item[data-view]').forEach(n => n.onclick = () => switchView(n.dataset.view));

  ['filtro-ej-resumen'].forEach(id => $(id).onchange = renderResumen);
  ['f-nombre', 'f-ejecutivo', 'f-estado', 'f-plan'].forEach(id => $(id).addEventListener('input', renderTabla));
  ['sel-ej', 'f-estado-ej'].forEach(id => $(id).onchange = renderEjecutivo);

  document.addEventListener('click', e => {
    const ed = e.target.closest('[data-edit]'), del = e.target.closest('[data-del]');
    if (ed) abrirModal(Number(ed.dataset.edit));
    if (del) eliminar(Number(del.dataset.del));
  });

  if (session) startApp(); // sesión activa en esta pestaña
});
