// ============================================================
// THE CRAFT BARBER - Núcleo de la tienda (productos, carrito, pedidos)
// Compatible con plan Spark: sin Storage ni Cloud Functions.
//   - Las fotos se guardan comprimidas (base64) en el propio documento.
//   - El precio y el stock "reales" se validan al cobrar (settleOrder),
//     nunca se confía en el total que envía el navegador del cliente.
// ============================================================
import {
  db, collection, doc, getDoc, getDocs, query, where, runTransaction, writeBatch,
  serverTimestamp
} from './firebase-core.js';

// ------------------------------------------------------------
// Constantes
// ------------------------------------------------------------
export const CATEGORIAS = ['Cera y pomada', 'Shampoo y cuidado', 'Aceites y barba', 'Herramientas', 'Otros'];

// Mismos métodos que ya usa la agenda y el panel de pagos del dueño/barbero.
export const PAYMENT_METHODS = [
  { id: 'nequi',     label: 'NEQUI',     field: 'nequi' },
  { id: 'daviplata', label: 'DAVIPLATA', field: 'daviplata' },
  { id: 'breb',      label: 'BRE-B',     field: 'breb' },
  { id: 'efectivo',  label: 'EFECTIVO',  field: null }
];

export const ORDER_STATUS = {
  pendiente: 'PENDIENTE',
  pagado: 'PAGADO',
  entregado: 'ENTREGADO',
  cancelado: 'CANCELADO'
};

// ------------------------------------------------------------
// Carrito (localStorage). Estructura: { [productoId]: cantidad }
// ------------------------------------------------------------
const CART_KEY = 'cb_cart_v1';

export function getCart() {
  try {
    const raw = JSON.parse(localStorage.getItem(CART_KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}
export function saveCart(cart) {
  try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* modo privado: se ignora */ }
}
export function cartCount(cart = getCart()) {
  return Object.values(cart).reduce((n, q) => n + (Number(q) || 0), 0);
}
export function clearCart() { saveCart({}); }

// ------------------------------------------------------------
// Pagos del vendedor (dueño o barbero): colección `metodosPago/{uid}`
// ------------------------------------------------------------
export async function loadSellerPayments(uid) {
  const snap = await getDoc(doc(db, 'metodosPago', uid));
  return snap.exists() ? snap.data() : {};
}

// ------------------------------------------------------------
// Radicados de 5 caracteres (mismo alfabeto que las citas, sin 0/O/1/I)
// ------------------------------------------------------------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function generateCode() {
  let r = '';
  for (let i = 0; i < 5; i++) r += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return r;
}

// ------------------------------------------------------------
// CHECKOUT
// Divide el carrito en UN pedido por vendedor (cada vendedor cobra con sus
// propios métodos y su propia caja). Todo se escribe en un solo batch.
//   lines: [{ producto:{id,nombre,precio,stock,vendedorId,vendedor,...}, cantidad }]
// Devuelve: [{ ordenId, vendedor, total, radicado|null }]
// ------------------------------------------------------------
export async function checkout({ user, profile, lines, metodo }) {
  if (!lines.length) throw new Error('Tu carrito está vacío.');
  if (!PAYMENT_METHODS.some(m => m.id === metodo)) throw new Error('Selecciona un método de pago.');

  // 1) Revalidar contra Firestore (precio, stock y que el producto siga activo).
  const fresh = [];
  for (const l of lines) {
    const snap = await getDoc(doc(db, 'productos', l.producto.id));
    if (!snap.exists() || snap.data().activo === false) throw new Error(`«${l.producto.nombre}» ya no está disponible.`);
    const p = { id: snap.id, ...snap.data() };
    if (l.cantidad > p.stock) throw new Error(`Solo quedan ${p.stock} unidad(es) de «${p.nombre}».`);
    fresh.push({ producto: p, cantidad: l.cantidad });
  }

  // 2) Agrupar por vendedor.
  const bySeller = new Map();
  fresh.forEach(l => {
    const k = l.producto.vendedorId;
    if (!bySeller.has(k)) bySeller.set(k, { vendedorId: k, vendedor: l.producto.vendedor || 'VENDEDOR', lines: [] });
    bySeller.get(k).lines.push(l);
  });

  // 3) Escribir. Si un radicado choca con otro existente las reglas rechazan el batch
  //    (permission-denied); se reintenta con códigos nuevos.
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    const batch = writeBatch(db);
    const result = [];
    for (const g of bySeller.values()) {
      const items = g.lines.map(l => ({
        productoId: l.producto.id, nombre: l.producto.nombre,
        precio: l.producto.precio, cantidad: l.cantidad
      }));
      const total = items.reduce((s, i) => s + i.precio * i.cantidad, 0);
      const ordenRef = doc(collection(db, 'ordenes'));
      const orden = {
        userId: user.uid,
        cliente: profile.username || user.email?.split('@')[0] || 'CLIENTE',
        vendedorId: g.vendedorId, vendedor: g.vendedor,
        items, subtotal: total, total,
        metodoPago: metodo,
        estado: 'pendiente', estadoPago: 'pendiente',
        createdAt: serverTimestamp(), updatedAt: serverTimestamp()
      };
      let radicado = null;
      if (metodo === 'efectivo') {
        radicado = generateCode();
        orden.radicado = radicado;
        // `barberoId` permite reutilizar la regla existente: el barbero solo ve SUS radicados.
        batch.set(doc(db, 'radicados', radicado), {
          codigo: radicado, tipo: 'pedido', ordenId: ordenRef.id,
          userId: user.uid, barberoId: g.vendedorId, total,
          estado: 'activo', createdAt: serverTimestamp()
        });
      }
      batch.set(ordenRef, orden);
      result.push({ ordenId: ordenRef.id, vendedor: g.vendedor, vendedorId: g.vendedorId, total, radicado });
    }
    try {
      await batch.commit();
      clearCart();
      return result;
    } catch (e) {
      lastError = e;
      if (metodo !== 'efectivo' || e.code !== 'permission-denied') break; // solo el choque de radicado se reintenta
    }
  }
  throw lastError || new Error('No se pudo crear el pedido.');
}

// ------------------------------------------------------------
// COBRO DE UN PEDIDO (lo usan Caja y el panel de gestión de tienda)
//   - Recalcula el total con los precios ACTUALES de `productos`.
//   - Descuenta stock (falla si no alcanza).
//   - Si viene `radicado`: lo quema, crea la transacción y, si cobra un barbero,
//     deja el aviso en `cobros` para el dueño. Todo atómico.
// ------------------------------------------------------------
export async function settleOrder({ ordenId, radicado = null, actorUid, actorProfile, actorEmail = '' }) {
  const isOwnerRole = ['dueno', 'admin'].includes(actorProfile?.role);
  const ordenRef = doc(db, 'ordenes', ordenId);
  return runTransaction(db, async tx => {
    // --- LECTURAS (Firestore exige todas las lecturas antes de escribir) ---
    const oSnap = await tx.get(ordenRef);
    if (!oSnap.exists()) throw new Error('El pedido no existe.');
    const o = oSnap.data();
    if (o.estado !== 'pendiente') throw new Error('Este pedido ya no está pendiente.');
    if (!isOwnerRole && o.vendedorId !== actorUid) throw new Error('Este pedido pertenece a otro vendedor.');

    let radRef = null;
    if (radicado) {
      radRef = doc(db, 'radicados', radicado);
      const rSnap = await tx.get(radRef);
      if (!rSnap.exists() || rSnap.data().estado !== 'activo' || rSnap.data().ordenId !== ordenId)
        throw new Error('El radicado ya no está disponible.');
    }

    const prods = [];
    for (const it of o.items) {
      const ref = doc(db, 'productos', it.productoId);
      const pSnap = await tx.get(ref);
      if (!pSnap.exists()) throw new Error(`«${it.nombre}» ya no existe en el catálogo.`);
      const p = pSnap.data();
      if (p.stock < it.cantidad) throw new Error(`Stock insuficiente de «${it.nombre}» (quedan ${p.stock}).`);
      prods.push({ ref, p, it });
    }

    // --- CÁLCULO con precios autoritativos ---
    const total = prods.reduce((s, x) => s + x.p.precio * x.it.cantidad, 0);

    // --- ESCRITURAS ---
    prods.forEach(x => tx.update(x.ref, { stock: x.p.stock - x.it.cantidad, updatedAt: serverTimestamp() }));
    tx.update(ordenRef, { estado: 'pagado', estadoPago: 'pagado', subtotal: total, total, paidAt: serverTimestamp(), updatedAt: serverTimestamp() });

    if (radRef) {
      tx.update(radRef, { estado: 'usado', usedAt: serverTimestamp(), usedBy: actorUid });
      tx.set(doc(db, 'transacciones', ordenId), {
        ordenId, radicado, metodo: 'efectivo', total,
        estado: 'Pago realizado con éxito', processedBy: actorUid, createdAt: serverTimestamp()
      });
      if (!isOwnerRole) {
        // Mismo aviso que ya reciben los cobros de citas en el panel del dueño.
        tx.set(doc(db, 'cobros', ordenId), {
          ordenId, tipo: 'producto', radicado, metodo: 'efectivo',
          cobradoPor: actorUid,
          barbero: actorProfile?.username || actorEmail.split('@')[0] || 'BARBERO',
          cliente: o.cliente || 'CLIENTE',
          servicio: 'PRODUCTOS: ' + o.items.map(i => `${i.cantidad}× ${i.nombre}`).join(', ').slice(0, 120),
          subtotal: total, descuentoPct: 0, total,
          leido: false, createdAt: serverTimestamp()
        });
      }
    }
    return { total };
  });
}

// ------------------------------------------------------------
// Consulta de pedidos (para vistas)
// ------------------------------------------------------------
export const ordersOfClient = uid => query(collection(db, 'ordenes'), where('userId', '==', uid));
export const ordersOfSeller = uid => query(collection(db, 'ordenes'), where('vendedorId', '==', uid));
export async function getAllActiveProducts() {
  const s = await getDocs(query(collection(db, 'productos'), where('activo', '==', true)));
  return s.docs.map(d => ({ id: d.id, ...d.data() }));
}

// Solo se renderizan imágenes que sean data-URL de imagen (evita inyectar otras URLs).
export const safeImg = src => (typeof src === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(src)) ? src : '';
