// ============================================================
// Gestión de tienda (dueño + barberos)
//   - Dueño: ve y edita TODOS los productos y pedidos.
//   - Barbero aprobado: solo los suyos (lo imponen las reglas de Firestore).
// ============================================================
import {
  auth, db, onAuthStateChanged, collection, doc, getDoc, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, serverTimestamp, escapeHtml, money, getCurrentProfile,
  isOwner, isBarber, compressImage
} from './firebase-core.js';
import { CATEGORIAS, ORDER_STATUS, settleOrder, ordersOfSeller, safeImg } from './shop-core.js';

const $ = id => document.getElementById(id);
let user = null, profile = null, owner = false;
let products = [];
let newImage = null;        // data-URL de la foto elegida en el formulario
let toastTimer = null;

function toast(t) { const e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => e.classList.remove('show'), 3500); }
function setStatus(id, t, ok = true) { const e = $(id); e.textContent = t; e.style.color = ok ? '#2d6a1c' : '#b03a2e'; }

// ------------------------------------------------------------
// Productos
// ------------------------------------------------------------
function renderProducts() {
  products.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || '', 'es'));
  $('products-count').textContent = products.length;
  $('st-products').textContent = products.length;
  $('products-list').innerHTML = products.length ? products.map(p => {
    const img = safeImg(p.imagen);
    return `<article class="product-card ${p.activo === false ? 'is-off' : ''}">
      <div class="product-thumb">${img ? `<img src="${img}" alt="" loading="lazy">` : '<div class="no-photo">SIN FOTO</div>'}
        <span class="tag ${p.activo === false ? 'tag-off' : p.stock <= 0 ? 'tag-danger' : 'tag-ok'} stock-tag">${p.activo === false ? 'OCULTO' : p.stock <= 0 ? 'AGOTADO' : 'STOCK ' + p.stock}</span></div>
      <div class="product-body">
        <span class="product-cat">${escapeHtml(p.categoria || 'Otros')}</span>
        <h3 class="product-name">${escapeHtml(p.nombre)}</h3>
        ${owner ? `<span class="product-seller">Vendedor: ${escapeHtml(p.vendedor || '')}</span>` : ''}
        <span class="product-price">${money(p.precio)}</span>
      </div>
      <div class="product-actions">
        <button class="mini-btn" data-edit="${escapeHtml(p.id)}">EDITAR</button>
        <button class="mini-btn secondary" data-toggle="${escapeHtml(p.id)}">${p.activo === false ? 'MOSTRAR' : 'OCULTAR'}</button>
        <button class="mini-btn reject" data-del="${escapeHtml(p.id)}">BORRAR</button>
      </div></article>`;
  }).join('') : '<p class="empty-message">AÚN NO HAS CREADO PRODUCTOS</p>';
}

function resetForm() {
  $('product-form').reset(); $('p-id').value = ''; newImage = null;
  $('p-photo-box').innerHTML = 'TOCA PARA SUBIR FOTO';
  $('form-title').textContent = 'NUEVO PRODUCTO'; $('p-cancel').hidden = true; $('p-active').checked = true;
}

function editProduct(id) {
  const p = products.find(x => x.id === id); if (!p) return;
  $('p-id').value = p.id; $('p-name').value = p.nombre || ''; $('p-cat').value = p.categoria || CATEGORIAS[0];
  $('p-desc').value = p.descripcion || ''; $('p-price').value = p.precio; $('p-stock').value = p.stock; $('p-active').checked = p.activo !== false;
  newImage = null;
  const img = safeImg(p.imagen);
  $('p-photo-box').innerHTML = img ? `<img src="${img}" alt="">` : 'TOCA PARA SUBIR FOTO';
  $('form-title').textContent = 'EDITAR PRODUCTO'; $('p-cancel').hidden = false;
  $('product-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('p-photo').addEventListener('change', async e => {
  const f = e.target.files[0]; if (!f) return;
  try {
    // 480 px y calidad .7: ~30-60 KB por foto, suficiente para tarjeta de catálogo y seguro bajo el límite de 1 MB por documento.
    newImage = await compressImage(f, 480, .7);
    $('p-photo-box').innerHTML = `<img src="${newImage}" alt="">`;
  } catch (err) { setStatus('p-status', err.message || 'No se pudo leer la imagen.', false); }
});

$('product-form').addEventListener('submit', async e => {
  e.preventDefault();
  const id = $('p-id').value;
  const precio = Number($('p-price').value), stock = Number($('p-stock').value);
  if (!Number.isInteger(precio) || precio < 100) return setStatus('p-status', 'El precio debe ser un número entero (mínimo $100).', false);
  if (!Number.isInteger(stock) || stock < 0) return setStatus('p-status', 'El stock debe ser un entero mayor o igual a 0.', false);

  const data = {
    nombre: $('p-name').value.trim(), categoria: $('p-cat').value, descripcion: $('p-desc').value.trim(),
    precio, stock, activo: $('p-active').checked, updatedAt: serverTimestamp()
  };
  if (!data.nombre) return setStatus('p-status', 'Escribe el nombre del producto.', false);
  if (newImage) data.imagen = newImage;

  $('p-submit').disabled = true;
  try {
    if (id) {
      await updateDoc(doc(db, 'productos', id), data);       // no toca vendedorId: el dueño puede editar sin "robar" el producto
    } else {
      await addDoc(collection(db, 'productos'), {
        ...data, vendedorId: user.uid,
        vendedor: profile.username || user.email?.split('@')[0] || (owner ? 'DUEÑO' : 'BARBERO'),
        createdAt: serverTimestamp()
      });
    }
    setStatus('p-status', id ? 'PRODUCTO ACTUALIZADO.' : 'PRODUCTO CREADO.'); resetForm();
  } catch (err) { console.error(err); setStatus('p-status', 'No se pudo guardar (revisa tu conexión o permisos).', false); }
  finally { $('p-submit').disabled = false; }
});
$('p-cancel').addEventListener('click', resetForm);

$('products-list').addEventListener('click', async e => {
  const ed = e.target.closest('[data-edit]'), tg = e.target.closest('[data-toggle]'), del = e.target.closest('[data-del]');
  try {
    if (ed) editProduct(ed.dataset.edit);
    if (tg) { const p = products.find(x => x.id === tg.dataset.toggle); await updateDoc(doc(db, 'productos', p.id), { activo: p.activo === false, updatedAt: serverTimestamp() }); }
    if (del && confirm('¿Borrar este producto definitivamente? Los pedidos ya hechos conservan su detalle.')) await deleteDoc(doc(db, 'productos', del.dataset.del));
  } catch (err) { console.error(err); alert('No se pudo completar la acción.'); }
});

// ------------------------------------------------------------
// Pedidos recibidos
// ------------------------------------------------------------
function renderOrders(items) {
  items.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  const pending = items.filter(o => o.estado === 'pendiente').length;
  $('orders-count').textContent = items.length; $('st-pending').textContent = pending;
  const tagFor = s => s === 'pagado' || s === 'entregado' ? 'tag-ok' : s === 'cancelado' ? 'tag-danger' : 'tag-warn';
  $('orders-list').innerHTML = items.length ? items.slice(0, 100).map(o => {
    const cash = o.metodoPago === 'efectivo';
    return `<div class="order-card">
      <div class="order-head"><span class="tag ${tagFor(o.estado)}">${ORDER_STATUS[o.estado] || escapeHtml(o.estado)}</span>
        <span class="order-meta">${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString('es-CO') : ''}</span></div>
      <div class="order-meta">CLIENTE: ${escapeHtml(o.cliente || '')} · PAGO: ${escapeHtml((o.metodoPago || '').toUpperCase())}${owner ? ` · VENDEDOR: ${escapeHtml(o.vendedor || '')}` : ''}</div>
      <div class="order-items">${(o.items || []).map(i => `${i.cantidad}× ${escapeHtml(i.nombre)}`).join('<br>')}</div>
      ${cash && o.estado === 'pendiente' ? `<div>RADICADO: <span class="code-chip">${escapeHtml(o.radicado || '')}</span> <small>(se cobra en CAJA)</small></div>` : ''}
      <div class="order-total">TOTAL ${money(o.total)}</div>
      <div class="order-actions">
        ${o.estado === 'pendiente' && !cash ? `<button class="mini-btn" data-confirm="${escapeHtml(o.id)}">CONFIRMAR PAGO RECIBIDO</button>` : ''}
        ${o.estado === 'pagado' ? `<button class="mini-btn" data-deliver="${escapeHtml(o.id)}">MARCAR ENTREGADO</button>` : ''}
        ${o.estado === 'pendiente' ? `<button class="mini-btn reject" data-cancel="${escapeHtml(o.id)}">CANCELAR</button>` : ''}
      </div></div>`;
  }).join('') : '<p class="empty-message">AÚN NO HAY PEDIDOS</p>';
}

$('orders-list').addEventListener('click', async e => {
  const c = e.target.closest('[data-confirm]'), d = e.target.closest('[data-deliver]'), x = e.target.closest('[data-cancel]');
  try {
    if (c) {
      if (!confirm('¿Confirmas que ya recibiste el dinero? Se descontará el stock.')) return;
      await settleOrder({ ordenId: c.dataset.confirm, actorUid: user.uid, actorProfile: profile, actorEmail: user.email || '' });
      toast('Pago confirmado y stock actualizado');
    }
    if (d) await updateDoc(doc(db, 'ordenes', d.dataset.deliver), { estado: 'entregado', deliveredAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (x && confirm('¿Cancelar este pedido?')) await updateDoc(doc(db, 'ordenes', x.dataset.cancel), { estado: 'cancelado', cancelledAt: serverTimestamp(), updatedAt: serverTimestamp() });
  } catch (err) { console.error(err); alert(err.message || 'No se pudo actualizar el pedido.'); }
});

// ------------------------------------------------------------
// Métodos de pago del vendedor (misma colección que ya usan el dueño y los barberos)
// ------------------------------------------------------------
async function loadPayments() {
  const s = await getDoc(doc(db, 'metodosPago', user.uid)); const p = s.exists() ? s.data() : {};
  $('pay-nequi').value = p.nequi || ''; $('pay-daviplata').value = p.daviplata || ''; $('pay-breb').value = p.breb || '';
  if (!p.nequi && !p.daviplata && !p.breb) $('pay-hint').textContent = 'Aún no configuras pagos digitales: tus clientes solo podrán pagar en efectivo.';
}
$('pay-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    await setDoc(doc(db, 'metodosPago', user.uid), { nequi: $('pay-nequi').value.trim(), daviplata: $('pay-daviplata').value.trim(), breb: $('pay-breb').value.trim(), updatedAt: serverTimestamp() }, { merge: true });
    setStatus('pay-status', 'MÉTODOS DE PAGO GUARDADOS.');
  } catch (err) { console.error(err); setStatus('pay-status', 'NO SE PUDO GUARDAR.', false); }
});

// ------------------------------------------------------------
// Arranque
// ------------------------------------------------------------
onAuthStateChanged(auth, async u => {
  if (!u) return location.href = 'login.html';
  user = u; profile = await getCurrentProfile(u);
  owner = isOwner(profile);
  if (!owner && !isBarber(profile)) { alert('No tienes acceso a la gestión de la tienda.'); return location.href = 'home.html'; }

  const name = (profile.username || u.email?.split('@')[0] || 'USUARIO').toUpperCase();
  $('mg-name').textContent = name; $('mg-avatar').textContent = name.charAt(0);
  $('mg-role').textContent = owner ? 'DUEÑO / ADMIN' : 'BARBERO';
  $('mg-scope').textContent = owner ? 'VES Y GESTIONAS LOS PRODUCTOS DE TODOS' : 'GESTIONAS TUS PROPIOS PRODUCTOS';
  $('mg-back').href = owner ? '/Views/dashboard-admin.html' : '/Views/dashboard-barbero.html';
  $('p-cat').innerHTML = CATEGORIAS.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  const prodQ = owner ? collection(db, 'productos') : query(collection(db, 'productos'), where('vendedorId', '==', u.uid));
  onSnapshot(prodQ, s => { products = s.docs.map(d => ({ id: d.id, ...d.data() })); renderProducts(); }, err => console.error(err));
  onSnapshot(owner ? collection(db, 'ordenes') : ordersOfSeller(u.uid), s => renderOrders(s.docs.map(d => ({ id: d.id, ...d.data() }))), err => console.error(err));
  loadPayments().catch(console.error);
});
