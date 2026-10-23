// ============================================================
// Tienda del cliente: catálogo -> carrito -> checkout -> mis pedidos
// ============================================================
import {
  auth, db, onAuthStateChanged, collection, doc, updateDoc, query, where, onSnapshot,
  serverTimestamp, escapeHtml, money, getCurrentProfile
} from './firebase-core.js';
import {
  CATEGORIAS, PAYMENT_METHODS, ORDER_STATUS, getCart, saveCart, cartCount,
  loadSellerPayments, checkout, ordersOfClient, safeImg
} from './shop-core.js';

const $ = id => document.getElementById(id);

let user = null, profile = null;
let products = new Map();          // id -> producto
let cart = getCart();              // { id: cantidad }
let selectedPayment = '';
let sellerPayments = new Map();    // vendedorId -> { nequi, daviplata, breb }
let toastTimer = null;

function toast(text) {
  const t = $('toast'); t.textContent = text; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
function status(text, ok = true) {
  const e = $('checkout-status'); e.textContent = text; e.style.color = ok ? '#2d6a1c' : '#b03a2e';
}

// ------------------------------------------------------------
// Catálogo
// ------------------------------------------------------------
function fillFilters() {
  const cats = [...new Set([...CATEGORIAS, ...[...products.values()].map(p => p.categoria).filter(Boolean)])];
  const sellers = new Map([...products.values()].map(p => [p.vendedorId, p.vendedor || 'VENDEDOR']));
  const cSel = $('f-category').value, sSel = $('f-seller').value;
  $('f-category').innerHTML = '<option value="">TODAS LAS CATEGORÍAS</option>' + cats.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  $('f-seller').innerHTML = '<option value="">TODOS LOS VENDEDORES</option>' + [...sellers].map(([id, n]) => `<option value="${escapeHtml(id)}">${escapeHtml(n)}</option>`).join('');
  $('f-category').value = cSel; $('f-seller').value = sSel;
}

function renderCatalog() {
  const q = $('f-search').value.trim().toLowerCase(), cat = $('f-category').value, sel = $('f-seller').value;
  const list = [...products.values()]
    .filter(p => (!q || `${p.nombre} ${p.descripcion || ''}`.toLowerCase().includes(q)) && (!cat || p.categoria === cat) && (!sel || p.vendedorId === sel))
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  $('catalog-count').textContent = list.length;
  $('stat-products').textContent = products.size;
  $('product-grid').innerHTML = list.length ? list.map(p => {
    const img = safeImg(p.imagen);
    const out = p.stock <= 0;
    const inCart = cart[p.id] || 0;
    const stockTag = out ? '<span class="tag tag-danger stock-tag">AGOTADO</span>' : p.stock <= 3 ? `<span class="tag tag-warn stock-tag">QUEDAN ${p.stock}</span>` : '';
    return `<article class="product-card ${out ? 'is-off' : ''}">
      <div class="product-thumb">${img ? `<img src="${img}" alt="${escapeHtml(p.nombre)}" loading="lazy">` : '<div class="no-photo">SIN FOTO</div>'}${stockTag}</div>
      <div class="product-body">
        <span class="product-cat">${escapeHtml(p.categoria || 'Otros')}</span>
        <h3 class="product-name">${escapeHtml(p.nombre)}</h3>
        <p class="product-desc">${escapeHtml(p.descripcion || '')}</p>
        <span class="product-seller">Vende: ${escapeHtml(p.vendedor || 'VENDEDOR')}</span>
        <span class="product-price">${money(p.precio)}</span>
      </div>
      <div class="product-actions">
        <button class="btn-primary" data-add="${escapeHtml(p.id)}" ${out || inCart >= p.stock ? 'disabled style="opacity:.5;cursor:not-allowed"' : ''}>${inCart ? `AGREGAR (${inCart})` : 'AGREGAR'}</button>
      </div></article>`;
  }).join('') : '<p class="empty-message">NO HAY PRODUCTOS QUE COINCIDAN.</p>';
}

// ------------------------------------------------------------
// Carrito
// ------------------------------------------------------------
function cleanCart() {
  // Quita del carrito productos que ya no existen / están agotados y ajusta cantidades al stock.
  let changed = false;
  for (const [id, q] of Object.entries(cart)) {
    const p = products.get(id);
    if (!p || p.stock <= 0) { delete cart[id]; changed = true; continue; }
    if (q > p.stock) { cart[id] = p.stock; changed = true; }
  }
  if (changed) saveCart(cart);
}
const cartLines = () => Object.entries(cart).map(([id, cantidad]) => ({ producto: products.get(id), cantidad })).filter(l => l.producto);
const cartTotal = () => cartLines().reduce((s, l) => s + l.producto.precio * l.cantidad, 0);

function renderCart() {
  cleanCart();
  const lines = cartLines();
  $('stat-cart').textContent = cartCount(cart);
  $('cart-total').hidden = !lines.length;
  $('checkout-box').hidden = !lines.length;
  $('cart-total-value').textContent = money(cartTotal());
  if (!lines.length) { $('cart-lines').innerHTML = '<p class="empty-message">TU CARRITO ESTÁ VACÍO</p>'; return; }

  const groups = new Map();
  lines.forEach(l => { const k = l.producto.vendedorId; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(l); });
  $('cart-lines').innerHTML = [...groups.values()].map(g => `
    <div class="cart-seller-group">VENDE: ${escapeHtml(g[0].producto.vendedor || 'VENDEDOR')}</div>
    ${g.map(l => { const p = l.producto, img = safeImg(p.imagen); return `
      <div class="cart-line">
        ${img ? `<img src="${img}" alt="">` : '<div class="cart-ph"></div>'}
        <div>
          <div class="cart-line-name">${escapeHtml(p.nombre)}</div>
          <div class="cart-line-sub">${money(p.precio)} c/u · ${money(p.precio * l.cantidad)}</div>
          <div class="qty">
            <button data-dec="${escapeHtml(p.id)}" aria-label="Quitar uno">−</button>
            <span>${l.cantidad}</span>
            <button data-inc="${escapeHtml(p.id)}" aria-label="Agregar uno" ${l.cantidad >= p.stock ? 'disabled' : ''}>+</button>
          </div>
        </div>
        <button class="cart-remove" data-del="${escapeHtml(p.id)}" aria-label="Eliminar">×</button>
      </div>`; }).join('')}`).join('');
  renderPayment();
}

function setQty(id, qty) {
  const p = products.get(id); if (!p) return;
  if (qty <= 0) delete cart[id]; else cart[id] = Math.min(qty, p.stock);
  saveCart(cart); renderCart(); renderCatalog();
}

// ------------------------------------------------------------
// Métodos de pago (los configura cada vendedor en su panel: metodosPago/{uid})
// ------------------------------------------------------------
async function ensureSellerPayments() {
  const ids = [...new Set(cartLines().map(l => l.producto.vendedorId))];
  await Promise.all(ids.filter(id => !sellerPayments.has(id)).map(async id => {
    try { sellerPayments.set(id, await loadSellerPayments(id)); } catch { sellerPayments.set(id, {}); }
  }));
  return ids;
}

// ¿Todos los vendedores del carrito tienen configurado este método?
function methodAvailable(m, sellerIds) {
  if (m.id === 'efectivo') return true;
  return sellerIds.every(id => (sellerPayments.get(id)?.[m.field] || '').trim());
}

async function renderPayment() {
  const sellerIds = await ensureSellerPayments();
  $('pay-options').innerHTML = PAYMENT_METHODS.map(m => {
    const ok = methodAvailable(m, sellerIds);
    return `<button type="button" class="pay-btn ${selectedPayment === m.id ? 'selected' : ''}" data-pay="${m.id}" ${ok ? '' : 'disabled'} title="${ok ? '' : 'Algún vendedor no configuró este método'}">${m.label}</button>`;
  }).join('');
  if (selectedPayment && !methodAvailable(PAYMENT_METHODS.find(m => m.id === selectedPayment), sellerIds)) selectedPayment = '';
  renderPayInfo(sellerIds);
}

function renderPayInfo(sellerIds = [...new Set(cartLines().map(l => l.producto.vendedorId))]) {
  const box = $('pay-info');
  if (!selectedPayment) { box.textContent = 'Selecciona un método de pago.'; return; }
  const m = PAYMENT_METHODS.find(x => x.id === selectedPayment);
  if (m.id === 'efectivo') {
    box.innerHTML = 'Se generará un <strong>radicado de 5 caracteres</strong> por cada vendedor. Preséntalo en caja para pagar y recoger tu pedido.';
    return;
  }
  // Un pedido por vendedor: cada uno recibe el pago en SU cuenta.
  const names = new Map(cartLines().map(l => [l.producto.vendedorId, l.producto.vendedor || 'VENDEDOR']));
  const totals = new Map();
  cartLines().forEach(l => totals.set(l.producto.vendedorId, (totals.get(l.producto.vendedorId) || 0) + l.producto.precio * l.cantidad));
  box.innerHTML = sellerIds.map(id => `<div>Paga <strong>${money(totals.get(id))}</strong> por ${m.label} a <strong>${escapeHtml(names.get(id))}</strong>: <strong>${escapeHtml(sellerPayments.get(id)?.[m.field] || '')}</strong></div>`).join('')
    + '<div style="margin-top:6px;color:#5a5a5a">Haz la transferencia y confirma el pedido; el vendedor verificará tu pago.</div>';
}

// ------------------------------------------------------------
// Checkout
// ------------------------------------------------------------
async function doCheckout() {
  if (!selectedPayment) return status('Selecciona un método de pago.', false);
  const btn = $('btn-checkout'); btn.disabled = true; status('Procesando…');
  try {
    const orders = await checkout({ user, profile, lines: cartLines(), metodo: selectedPayment });
    cart = {}; selectedPayment = '';
    status('');
    $('checkout-result').innerHTML = `<div class="result-box"><h3>¡PEDIDO REGISTRADO!</h3>${orders.map(o => o.radicado
      ? `<p>${escapeHtml(o.vendedor)} · ${money(o.total)}<br>RADICADO: <span class="code-chip">${escapeHtml(o.radicado)}</span></p>`
      : `<p>${escapeHtml(o.vendedor)} · ${money(o.total)}</p>`).join('')}<small>${orders.some(o => o.radicado) ? 'Presenta cada radicado en caja para pagar en efectivo.' : 'El vendedor confirmará tu pago y te avisaremos aquí en “Mis pedidos”.'}</small></div>`;
    renderCart(); renderCatalog();
  } catch (e) {
    console.error(e); status(e.message || 'No se pudo crear el pedido.', false);
  } finally { btn.disabled = false; }
}

// ------------------------------------------------------------
// Mis pedidos
// ------------------------------------------------------------
function renderOrders(items) {
  items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  $('orders-count').textContent = items.length;
  const tagFor = s => s === 'pagado' || s === 'entregado' ? 'tag-ok' : s === 'cancelado' ? 'tag-danger' : 'tag-warn';
  $('orders-list').innerHTML = items.length ? items.map(o => `
    <div class="order-card">
      <div class="order-head"><span class="tag ${tagFor(o.estado)}">${ORDER_STATUS[o.estado] || escapeHtml(o.estado)}</span>
        <span class="order-meta">${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('es-CO') : ''}</span></div>
      <div class="order-meta">VENDEDOR: ${escapeHtml(o.vendedor || '')} · PAGO: ${escapeHtml((o.metodoPago || '').toUpperCase())}</div>
      <div class="order-items">${(o.items || []).map(i => `${i.cantidad}× ${escapeHtml(i.nombre)}`).join('<br>')}</div>
      ${o.radicado && o.estado === 'pendiente' ? `<div>RADICADO: <span class="code-chip">${escapeHtml(o.radicado)}</span></div>` : ''}
      <div class="order-total">TOTAL ${money(o.total)}</div>
      ${o.estado === 'pendiente' ? `<div class="order-actions"><button class="mini-btn reject" data-cancel="${escapeHtml(o.id)}">CANCELAR PEDIDO</button></div>` : ''}
    </div>`).join('') : '<p class="empty-message">AÚN NO HAS HECHO PEDIDOS</p>';
}

// ------------------------------------------------------------
// Eventos
// ------------------------------------------------------------
$('product-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-add]'); if (!b) return;
  const id = b.dataset.add; setQty(id, (cart[id] || 0) + 1); toast('Agregado al carrito');
});
$('cart-lines').addEventListener('click', e => {
  const inc = e.target.closest('[data-inc]'), dec = e.target.closest('[data-dec]'), del = e.target.closest('[data-del]');
  if (inc) setQty(inc.dataset.inc, (cart[inc.dataset.inc] || 0) + 1);
  if (dec) setQty(dec.dataset.dec, (cart[dec.dataset.dec] || 0) - 1);
  if (del) setQty(del.dataset.del, 0);
});
$('pay-options').addEventListener('click', e => {
  const b = e.target.closest('[data-pay]'); if (!b || b.disabled) return;
  selectedPayment = b.dataset.pay;
  document.querySelectorAll('[data-pay]').forEach(x => x.classList.toggle('selected', x === b));
  renderPayInfo();
});
$('btn-checkout').addEventListener('click', doCheckout);
$('btn-clear').addEventListener('click', () => { if (confirm('¿Vaciar el carrito?')) { cart = {}; saveCart(cart); renderCart(); renderCatalog(); } });
['f-search', 'f-category', 'f-seller'].forEach(id => $(id).addEventListener('input', renderCatalog));
$('orders-list').addEventListener('click', async e => {
  const b = e.target.closest('[data-cancel]'); if (!b || !confirm('¿Cancelar este pedido?')) return;
  try { await updateDoc(doc(db, 'ordenes', b.dataset.cancel), { estado: 'cancelado', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() }); }
  catch (err) { console.error(err); alert('No se pudo cancelar el pedido.'); }
});

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------
onAuthStateChanged(auth, async u => {
  if (!u) return location.href = 'login.html';
  user = u; profile = await getCurrentProfile(u);
  if (!profile || profile.role !== 'usuario') { alert('La tienda es para clientes.'); return location.href = 'home.html'; }
  const name = (profile.username || u.email?.split('@')[0] || 'CLIENTE').toUpperCase();
  $('shop-user').textContent = name; $('shop-avatar').textContent = name.charAt(0);

  // Catálogo en vivo: si el vendedor cambia precio/stock, el cliente lo ve al instante.
  onSnapshot(query(collection(db, 'productos'), where('activo', '==', true)), s => {
    products = new Map(s.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    fillFilters(); renderCatalog(); renderCart();
  }, err => { console.error(err); $('product-grid').innerHTML = '<p class="empty-message">NO SE PUDO CARGAR EL CATÁLOGO.</p>'; });

  onSnapshot(ordersOfClient(u.uid), s => renderOrders(s.docs.map(d => ({ id: d.id, ...d.data() }))));
});
