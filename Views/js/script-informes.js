// ============================================================
// THE CRAFT BARBER - Informes del Dueño/Admin
// Módulo independiente: NO modifica nada de script-dbadmin.js.
//   - Solo LEE las colecciones `citas` y `ordenes` (el Dueño ya tiene permiso en las reglas).
//   - Gráficas de barras y de torta dibujadas en SVG propio (sin librerías externas).
//   - Plan Spark: sin Cloud Functions, todo se calcula en el navegador.
// ============================================================
import { db, collection, getDocs, escapeHtml, money, parseAppointmentDate } from './firebase-core.js';

const $ = id => document.getElementById(id);

// ---------- Catálogo de informes ----------
// kinds: qué se incluye · group: cómo se agrupa · val: qué se grafica (amount | count | units)
// qty: columna "cantidad" de la tabla · allStates: incluye también citas no pagadas/canceladas
const REPORTS = {
  ganancias_tiempo:   { label: 'Ganancias totales (servicios + productos) en el tiempo', kinds: ['servicio', 'producto'], group: 'time',    val: 'amount', qty: 'count', qtyLabel: 'OPERACIONES' },
  ganancias_origen:   { label: 'Ganancias: servicios vs productos',                      kinds: ['servicio', 'producto'], group: 'kind',    val: 'amount', qty: 'count', qtyLabel: 'OPERACIONES' },
  ganancias_barbero:  { label: 'Ganancias por barbero / vendedor',                       kinds: ['servicio', 'producto'], group: 'barbero', val: 'amount', qty: 'count', qtyLabel: 'OPERACIONES' },
  ganancias_metodo:   { label: 'Ganancias por método de pago',                           kinds: ['servicio', 'producto'], group: 'metodo',  val: 'amount', qty: 'count', qtyLabel: 'OPERACIONES' },
  trabajos_tiempo:    { label: 'Trabajos realizados en el tiempo',                       kinds: ['servicio'],             group: 'time',    val: 'count',  qty: 'count', qtyLabel: 'TRABAJOS' },
  trabajos_barbero:   { label: 'Trabajos realizados por barbero',                        kinds: ['servicio'],             group: 'barbero', val: 'count',  qty: 'count', qtyLabel: 'TRABAJOS' },
  trabajos_servicio:  { label: 'Servicios más solicitados',                              kinds: ['servicio'],             group: 'label',   val: 'count',  qty: 'count', qtyLabel: 'TRABAJOS' },
  citas_estado:       { label: 'Citas por estado (incluye canceladas)',                  kinds: ['servicio'],             group: 'estado',  val: 'count',  qty: 'count', qtyLabel: 'CITAS', allStates: true },
  productos_tiempo:   { label: 'Ventas de productos en el tiempo (ingresos)',            kinds: ['producto'],             group: 'time',    val: 'amount', qty: 'units', qtyLabel: 'UNIDADES' },
  productos_top:      { label: 'Productos más vendidos (unidades)',                      kinds: ['producto'],             group: 'label',   val: 'units',  qty: 'units', qtyLabel: 'UNIDADES' },
  productos_ingresos: { label: 'Productos que más ingresos generan',                     kinds: ['producto'],             group: 'label',   val: 'amount', qty: 'units', qtyLabel: 'UNIDADES' },
  productos_vendedor: { label: 'Ventas de productos por vendedor',                       kinds: ['producto'],             group: 'barbero', val: 'amount', qty: 'units', qtyLabel: 'UNIDADES' }
};
const COLORS = ['#347621', '#d9a441', '#4f9f34', '#a9791f', '#235116', '#c0392b', '#7b8f3a', '#e0c068', '#2e8b57', '#8b5a2b', '#6b8e23', '#b8860b'];
const MONTHS = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const MAX_BUCKETS = 400;     // límite de barras al rellenar periodos vacíos
const PIE_MAX = 8;           // rebanadas visibles en la torta (el resto se agrupa en "OTROS")

let records = [];            // movimientos normalizados (citas + líneas de pedidos)
let loaded = false, loading = false;
let chartType = 'bar';
let current = null;          // último resultado calculado (para redibujar y exportar)

// ---------- Utilidades ----------
const toDate = ts => (ts && typeof ts.toDate === 'function') ? ts.toDate() : null;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fmtDate = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const parseInput = (v, endOfDay) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || '');
  if (!m) return null;
  return endOfDay ? new Date(+m[1], +m[2] - 1, +m[3], 23, 59, 59, 999) : new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0, 0);
};
const setStatus = (t, ok = true) => { const e = $('rep-status'); if (e) { e.textContent = t; e.style.color = ok ? '#2f6b1f' : '#c0392b'; } };
const short = (v, isMoney) => {
  if (!isMoney) return String(Math.round(v * 100) / 100);
  if (v >= 1e6) return '$' + (Math.round(v / 1e5) / 10) + 'M';
  if (v >= 1e3) return '$' + (Math.round(v / 100) / 10) + 'k';
  return '$' + Math.round(v);
};
const cut = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// ---------- Carga de datos ----------
// Servicios: una fila por cita. Productos: una fila por línea de pedido PAGADO.
// El importe de cada línea se ajusta para que la suma coincida exactamente con el total del pedido.
async function loadData() {
  const [citasSnap, ordenesSnap] = await Promise.all([
    getDocs(collection(db, 'citas')),
    getDocs(collection(db, 'ordenes'))
  ]);
  const out = [];
  citasSnap.docs.forEach(d => {
    const c = d.data();
    const date = parseAppointmentDate(c) || toDate(c.paidAt) || toDate(c.createdAt);
    if (!date) return;
    const paid = c.estado !== 'cancelada' && (c.estadoPago === 'pagado' || ['recibida', 'finalizada'].includes(c.estado));
    out.push({
      kind: 'servicio', date, paid, estado: String(c.estado || 'reservada').toUpperCase(),
      amount: Number(c.total) || 0, units: 1,
      barbero: c.barbero || 'SIN NOMBRE', label: c.servicio || 'SIN SERVICIO',
      metodo: String(c.metodoPago || 'sin dato').toUpperCase()
    });
  });
  ordenesSnap.docs.forEach(d => {
    const o = d.data();
    if (!(o.estadoPago === 'pagado' && o.estado !== 'cancelado')) return;
    const date = toDate(o.paidAt) || toDate(o.createdAt);
    if (!date) return;
    const items = Array.isArray(o.items) ? o.items : [];
    const raw = items.reduce((s, i) => s + (Number(i.precio) || 0) * (Number(i.cantidad) || 0), 0);
    const total = Number(o.total) || raw;
    const k = raw > 0 ? total / raw : 1;
    items.forEach(i => out.push({
      kind: 'producto', date, paid: true, estado: String(o.estado || 'pagado').toUpperCase(),
      amount: Math.round((Number(i.precio) || 0) * (Number(i.cantidad) || 0) * k),
      units: Number(i.cantidad) || 0,
      barbero: o.vendedor || 'SIN NOMBRE', label: i.nombre || 'PRODUCTO',
      metodo: String(o.metodoPago || 'sin dato').toUpperCase()
    }));
  });
  records = out;
  loaded = true;
}

// ---------- Agrupación por tiempo ----------
function bucketStart(d, g) {
  if (g === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  if (g === 'week') { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; } // lunes
  if (g === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
  if (g === 'semester') return new Date(d.getFullYear(), d.getMonth() < 6 ? 0 : 6, 1);
  return new Date(d.getFullYear(), 0, 1);
}
function bucketNext(d, g) {
  if (g === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  if (g === 'week') return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 7);
  if (g === 'month') return new Date(d.getFullYear(), d.getMonth() + 1, 1);
  if (g === 'semester') return new Date(d.getFullYear(), d.getMonth() + 6, 1);
  return new Date(d.getFullYear() + 1, 0, 1);
}
function bucketLabel(d, g) {
  if (g === 'day') return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
  if (g === 'week') return `SEM ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (g === 'month') return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (g === 'semester') return `S${d.getMonth() < 6 ? 1 : 2} ${d.getFullYear()}`;
  return String(d.getFullYear());
}
function autoGranularity(start, end) {
  const days = Math.max(1, (end - start) / 864e5);
  return days <= 45 ? 'day' : days <= 180 ? 'week' : days <= 1100 ? 'month' : 'year';
}

// ---------- Cálculo del informe ----------
function compute() {
  const rep = REPORTS[$('rep-type').value];
  if (!rep) return null;
  const from = parseInput($('rep-from').value, false);
  const to = parseInput($('rep-to').value, true);
  if (from && to && from > to) { setStatus('LA FECHA INICIAL NO PUEDE SER POSTERIOR A LA FINAL.', false); return null; }
  const inRange = r => (!from || r.date >= from) && (!to || r.date <= to);

  // KPIs: siempre sobre lo pagado dentro del rango
  const paidRows = records.filter(r => r.paid && inRange(r));
  const kpi = {
    ingresos: paidRows.reduce((s, r) => s + r.amount, 0),
    trabajos: paidRows.filter(r => r.kind === 'servicio').length,
    unidades: paidRows.filter(r => r.kind === 'producto').reduce((s, r) => s + r.units, 0),
    ingServ: paidRows.filter(r => r.kind === 'servicio').reduce((s, r) => s + r.amount, 0),
    ingProd: paidRows.filter(r => r.kind === 'producto').reduce((s, r) => s + r.amount, 0)
  };

  const rows = records.filter(r => rep.kinds.includes(r.kind) && (rep.allStates || r.paid) && inRange(r));
  let gran = null, items = [];
  const map = new Map();
  const add = (key, label, sort, r) => {
    let g = map.get(key);
    if (!g) { g = { key, label, sort, amount: 0, count: 0, units: 0 }; map.set(key, g); }
    g.amount += r.amount; g.count += 1; g.units += r.units;
  };

  if (rep.group === 'time') {
    gran = $('rep-gran').value;
    const dates = rows.map(r => r.date.getTime());
    const start = from || (dates.length ? new Date(Math.min(...dates)) : null);
    const end = to || (dates.length ? new Date(Math.max(...dates)) : null);
    if (gran === 'auto' && start && end) gran = autoGranularity(start, end);
    if (gran === 'auto') gran = 'month';
    rows.forEach(r => { const b = bucketStart(r.date, gran); add(b.getTime(), bucketLabel(b, gran), b.getTime(), r); });
    // Rellena periodos sin movimientos para que la gráfica no engañe (si no son demasiados).
    if (start && end && rows.length) {
      let cur = bucketStart(start, gran), n = 0;
      const last = bucketStart(end, gran).getTime();
      while (cur.getTime() <= last && n <= MAX_BUCKETS) { cur = bucketNext(cur, gran); n++; }
      if (n <= MAX_BUCKETS) {
        cur = bucketStart(start, gran);
        while (cur.getTime() <= last) {
          if (!map.has(cur.getTime())) map.set(cur.getTime(), { key: cur.getTime(), label: bucketLabel(cur, gran), sort: cur.getTime(), amount: 0, count: 0, units: 0 });
          cur = bucketNext(cur, gran);
        }
      }
    }
    items = [...map.values()].sort((a, b) => a.sort - b.sort);
  } else {
    rows.forEach(r => {
      if (rep.group === 'kind') add(r.kind, r.kind === 'servicio' ? 'SERVICIOS' : 'PRODUCTOS', 0, r);
      else add(r[rep.group], String(r[rep.group]).toUpperCase(), 0, r);
    });
    items = [...map.values()].sort((a, b) => b[rep.val] - a[rep.val]);
  }

  items.forEach(i => { i.value = i[rep.val]; });
  const total = items.reduce((s, i) => s + i.value, 0);
  return { rep, items, total, kpi, from, to, gran };
}

// ---------- Gráficas SVG ----------
function barChart(items, isMoney) {
  const n = items.length;
  const W = Math.max(640, n * 56), H = 330, padL = 14, padR = 14, padT = 28, padB = 78;
  const max = Math.max(...items.map(i => i.value), 1);
  const bw = (W - padL - padR) / n, ch = H - padT - padB;
  let g = '';
  [0, .25, .5, .75, 1].forEach(f => {
    const y = H - padB - ch * f;
    g += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" stroke="#ddd" stroke-width="1"/>`;
  });
  items.forEach((it, i) => {
    const h = (it.value / max) * ch, x = padL + i * bw + bw * .15, w = bw * .7, y = H - padB - h, cx = x + w / 2;
    const col = COLORS[i % COLORS.length];
    g += `<rect x="${x}" y="${y}" width="${w}" height="${Math.max(h, 0)}" fill="${col}" stroke="#000" stroke-width="2"><title>${escapeHtml(it.label)}: ${isMoney ? money(it.value) : it.value}</title></rect>`;
    if (it.value > 0) g += `<text x="${cx}" y="${y - 6}" text-anchor="middle" font-size="11" fill="#1c1c1c">${escapeHtml(short(it.value, isMoney))}</text>`;
    const ly = H - padB + 16;
    g += `<text x="${cx}" y="${ly}" text-anchor="end" font-size="11" fill="#1c1c1c" transform="rotate(-35 ${cx} ${ly})">${escapeHtml(cut(it.label, 16))}</text>`;
  });
  g += `<line x1="${padL}" x2="${W - padR}" y1="${H - padB}" y2="${H - padB}" stroke="#000" stroke-width="3"/>`;
  return `<div class="rep-scroll"><svg viewBox="0 0 ${W} ${H}" style="width:100%;min-width:${W}px;height:auto" role="img" aria-label="Gráfica de barras" xmlns="http://www.w3.org/2000/svg" font-family="Pixelify Sans, sans-serif">${g}</svg></div>`;
}

function pieChart(items, total, isMoney) {
  // Solo valores positivos; las rebanadas pequeñas se agrupan en OTROS.
  let list = items.filter(i => i.value > 0).sort((a, b) => b.value - a.value);
  if (list.length > PIE_MAX) {
    const rest = list.slice(PIE_MAX - 1);
    list = list.slice(0, PIE_MAX - 1).concat([{ label: 'OTROS', value: rest.reduce((s, i) => s + i.value, 0) }]);
  }
  const sum = list.reduce((s, i) => s + i.value, 0) || 1;
  const cx = 130, cy = 130, r = 120;
  let a0 = -Math.PI / 2, paths = '';
  list.forEach((it, i) => {
    const frac = it.value / sum, col = COLORS[i % COLORS.length];
    const tip = `<title>${escapeHtml(it.label)}: ${isMoney ? money(it.value) : it.value} (${(frac * 100).toFixed(1)}%)</title>`;
    if (frac >= 0.9999) { paths += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${col}" stroke="#000" stroke-width="3">${tip}</circle>`; return; }
    const a1 = a0 + frac * 2 * Math.PI, large = frac > .5 ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    paths += `<path d="M${cx} ${cy} L${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${col}" stroke="#000" stroke-width="3">${tip}</path>`;
    a0 = a1;
  });
  const legend = list.map((it, i) => `<li><span class="rep-chip" style="background:${COLORS[i % COLORS.length]}"></span><span class="rep-leg-name">${escapeHtml(it.label)}</span><span class="rep-leg-val">${isMoney ? money(it.value) : it.value} · ${(it.value / sum * 100).toFixed(1)}%</span></li>`).join('');
  return `<div class="rep-pie"><svg viewBox="0 0 260 260" width="260" height="260" role="img" aria-label="Gráfica de torta" xmlns="http://www.w3.org/2000/svg">${paths}</svg><ul class="rep-legend">${legend}</ul></div>`;
}

// ---------- Render ----------
function render() {
  if (!loaded) return;
  setStatus('');
  const res = compute();
  if (!res) { $('rep-kpis').innerHTML = ''; $('rep-chart').innerHTML = ''; $('rep-table').innerHTML = ''; current = null; return; }
  current = res;
  const { rep, items, total, kpi, from, to } = res;
  const isMoney = rep.val === 'amount';

  $('rep-gran-wrap').hidden = rep.group !== 'time';
  $('rep-period').textContent = (from || to)
    ? `PERIODO: ${from ? fmtDate(from) : 'INICIO'} AL ${to ? fmtDate(to) : 'HOY'}${res.gran ? ' · POR ' + ({ day: 'DÍA', week: 'SEMANA', month: 'MES', semester: 'SEMESTRE', year: 'AÑO' })[res.gran] : ''}`
    : `PERIODO: TODO EL HISTORIAL${res.gran ? ' · POR ' + ({ day: 'DÍA', week: 'SEMANA', month: 'MES', semester: 'SEMESTRE', year: 'AÑO' })[res.gran] : ''}`;

  $('rep-kpis').innerHTML = [
    ['INGRESOS TOTALES', money(kpi.ingresos)],
    ['SERVICIOS', money(kpi.ingServ)],
    ['PRODUCTOS', money(kpi.ingProd)],
    ['TRABAJOS', kpi.trabajos],
    ['UNIDADES VENDIDAS', kpi.unidades]
  ].map(([l, v]) => `<div class="rep-kpi"><span class="rep-kpi-val">${escapeHtml(v)}</span><span class="rep-kpi-label">${l}</span></div>`).join('');

  if (!items.length || total <= 0) {
    $('rep-chart').innerHTML = '<p class="empty-message">NO HAY DATOS PARA ESTE INFORME EN EL PERIODO SELECCIONADO.</p>';
    $('rep-table').innerHTML = '';
    return;
  }
  $('rep-chart').innerHTML = chartType === 'pie' ? pieChart(items, total, isMoney) : barChart(items, isMoney);

  const qtyKey = rep.qty;
  const rowsHtml = items.map(i => `<tr><td>${escapeHtml(i.label)}</td><td>${money(i.amount)}</td><td>${i[qtyKey]}</td><td>${(i.value / total * 100).toFixed(1)}%</td></tr>`).join('');
  const totAmount = items.reduce((s, i) => s + i.amount, 0), totQty = items.reduce((s, i) => s + i[qtyKey], 0);
  $('rep-table').innerHTML = `<div class="rep-scroll"><table class="rep-table"><thead><tr><th>CONCEPTO</th><th>INGRESOS</th><th>${rep.qtyLabel}</th><th>% DEL GRÁFICO</th></tr></thead><tbody>${rowsHtml}</tbody><tfoot><tr><td>TOTAL</td><td>${money(totAmount)}</td><td>${totQty}</td><td>100%</td></tr></tfoot></table></div>`;
}

// ---------- Exportar CSV (para contabilidad / Excel) ----------
function exportCsv() {
  if (!current || !current.items.length) { setStatus('NO HAY DATOS PARA EXPORTAR.', false); return; }
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const { rep, items } = current;
  const lines = [['Concepto', 'Ingresos (COP)', rep.qtyLabel].map(q).join(';')];
  items.forEach(i => lines.push([q(i.label), Math.round(i.amount), i[rep.qty]].join(';')));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `informe-${$('rep-type').value}-${ymd(new Date())}.csv`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- Atajos de periodo ----------
function applyPreset(p) {
  const now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let from = null, to = today;
  if (p === 'today') from = today;
  else if (p === '7d') from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
  else if (p === '30d') from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
  else if (p === 'month') from = new Date(today.getFullYear(), today.getMonth(), 1);
  else if (p === '3m') from = new Date(today.getFullYear(), today.getMonth() - 3, today.getDate());
  else if (p === '6m') from = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
  else if (p === 'year') from = new Date(today.getFullYear(), 0, 1);
  else if (p === 'all') { from = null; to = null; }
  $('rep-from').value = from ? ymd(from) : '';
  $('rep-to').value = to ? ymd(to) : '';
  render();
}

// ---------- Datos: carga con aviso en pantalla ----------
async function refresh() {
  if (loading) return;
  loading = true;
  setStatus('CARGANDO DATOS…');
  try { await loadData(); render(); }
  catch (e) { console.error(e); setStatus('NO SE PUDIERON CARGAR LOS DATOS. REVISA TU CONEXIÓN O PERMISOS.', false); }
  finally { loading = false; }
}

// ---------- Inicio ----------
function init() {
  const modal = $('reports-modal'), btn = $('btn-reports');
  if (!modal || !btn) return; // si la página no tiene el módulo, no hace nada

  $('rep-type').innerHTML = Object.entries(REPORTS).map(([k, v]) => `<option value="${k}">${escapeHtml(v.label)}</option>`).join('');
  applyPresetSilently();

  const open = () => { modal.classList.add('open'); if (!loaded) refresh(); };
  const close = () => modal.classList.remove('open');
  btn.addEventListener('click', open);
  $('reports-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  ['rep-type', 'rep-from', 'rep-to', 'rep-gran'].forEach(id => $(id).addEventListener('change', render));
  $('rep-presets').addEventListener('click', e => { const b = e.target.closest('[data-preset]'); if (b) applyPreset(b.dataset.preset); });
  $('rep-chart-type').addEventListener('click', e => {
    const b = e.target.closest('[data-chart]'); if (!b) return;
    chartType = b.dataset.chart;
    $('rep-chart-type').querySelectorAll('[data-chart]').forEach(x => x.classList.toggle('active', x === b));
    render();
  });
  $('rep-refresh').addEventListener('click', refresh);
  $('rep-csv').addEventListener('click', exportCsv);
}
// Periodo inicial (últimos 30 días) sin disparar render antes de cargar datos.
function applyPresetSilently() {
  const t = new Date(), today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  $('rep-from').value = ymd(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29));
  $('rep-to').value = ymd(today);
}
init();
