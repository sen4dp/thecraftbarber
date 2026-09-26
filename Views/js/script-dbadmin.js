import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, getDocs, addDoc, updateDoc, deleteDoc, query, where, orderBy, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDc1Oha-1Es-7vS9jZe5DkXXuI17OYVzKY',
  authDomain: 'the-craftbarber.firebaseapp.com',
  projectId: 'the-craftbarber',
  storageBucket: 'the-craftbarber.firebasestorage.app',
  messagingSenderId: '1064165237871',
  appId: '1:1064165237871:web:3aae757a6f5a30bfb3d99a',
  measurementId: 'G-HCPNHKKS7C'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

let adminUid = null;
let barbers = [];
let clients = [];
let usersCache = new Map();
let unsubscribeApplications = null;
let unsubscribeBarbers = null;
let unsubscribeReviews = null;
let unsubscribePresence = null;
let presenceMap = new Map();

function setStatus(id, text, ok = true) { const el = $(id); if (el) { el.textContent = text; el.style.color = ok ? '#347621' : '#c0392b'; } }
function formatDate(value) {
  if (!value) return 'SIN FECHA';
  const d = value?.toDate ? value.toDate() : new Date(value);
  return Number.isNaN(d.getTime()) ? 'SIN FECHA' : d.toLocaleDateString('es-CO');
}
function formatTimestamp(value) { return formatDate(value); }

function renderApplications(items) {
  $('pending-count').textContent = items.length;
  $('stat-pending').textContent = items.length;
  if (!items.length) { $('applications-list').innerHTML = '<p class="empty-message">NO HAY SOLICITUDES PENDIENTES</p>'; return; }
  $('applications-list').innerHTML = items.map(item => `
    <div class="admin-item">
      <div class="admin-item-main"><div class="admin-item-title">${escapeHtml(item.username || item.email || 'BARBERO')}</div><div class="admin-item-meta">${escapeHtml(item.email || '')}<br>REGISTRO: ${formatTimestamp(item.createdAt)}</div></div>
      <div class="admin-actions"><button class="mini-btn" data-action="approve" data-id="${item.id}">ACEPTAR</button><button class="mini-btn reject" data-action="reject" data-id="${item.id}">NO ACEPTAR</button></div>
    </div>`).join('');
}

function renderBarbers(items) {
  barbers = items;
  $('barbers-count').textContent = items.length;
  $('stat-barbers').textContent = items.length;
  const options = items.map(b => `<option value="${b.id}">${escapeHtml(b.username || b.email || b.id)}</option>`).join('');
  $('note-barber').innerHTML = '<option value="">SELECCIONA UN BARBERO</option>' + options;
  if (!items.length) { $('barbers-list').innerHTML = '<p class="empty-message">NO HAY BARBEROS APROBADOS</p>'; return; }
  $('barbers-list').innerHTML = items.map(b => {
    const presence = presenceMap.get(b.id);
    const lastSeenMs = presence?.lastSeen?.toDate ? presence.lastSeen.toDate().getTime() : 0;
    const online = presence?.online === true && lastSeenMs > (Date.now() - 70000);
    return `<div class="admin-item"><div class="admin-item-main"><div class="admin-item-title"><span class="status-dot ${online ? 'online' : ''}"></span>${escapeHtml(b.username || b.email || 'BARBERO')}</div><div class="admin-item-meta">${escapeHtml(b.email || '')}<br>${online ? 'EN LÍNEA AHORA' : 'FUERA DE LÍNEA'} · ${b.appointmentsCompleted || 0} trabajos registrados</div></div><div class="admin-actions"><button class="mini-btn secondary" data-note-id="${b.id}">DEJAR NOTA</button></div></div>`;
  }).join('');
}

function renderReviews(items) {
  $('reviews-count').textContent = items.length;
  if (!items.length) { $('reviews-list').innerHTML = '<p class="empty-message">AÚN NO HAY RESEÑAS</p>'; return; }
  $('reviews-list').innerHTML = items.slice(0, 50).map(r => {
    const stars = '★'.repeat(Math.max(0, Math.min(5, Number(r.rating) || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, Number(r.rating) || 0)));
    const barber = usersCache.get(r.barberId)?.username || 'BARBERO';
    return `<div class="admin-item"><div class="admin-item-main"><div class="review-anon">RESEÑA ANÓNIMA · PARA ${escapeHtml(barber)}</div><div class="rating">${stars}</div><div class="admin-item-meta">${escapeHtml(r.comment || 'Sin comentario')}<br>${formatTimestamp(r.createdAt)}</div></div></div>`;
  }).join('');
}

function aggregateClients(citas, users) {
  const counts = new Map();
  for (const c of citas) {
    const uid = c.userId || c.clienteId;
    const key = uid || String(c.cliente || '').trim().toLowerCase();
    if (!key) continue;
    const prev = counts.get(key) || { key, count: 0, name: c.cliente || 'CLIENTE', userId: uid || null };
    prev.count++;
    if (uid && users.has(uid)) { prev.name = users.get(uid).username || users.get(uid).email || prev.name; }
    counts.set(key, prev);
  }
  return [...counts.values()].sort((a,b)=>b.count-a.count).slice(0,20);
}

function renderClients(items) {
  clients = items;
  $('clients-count').textContent = items.length;
  $('stat-clients').textContent = items.length;
  $('promo-client').innerHTML = '<option value="">SELECCIONA UN CLIENTE</option>' + items.filter(c=>c.userId).map(c=>`<option value="${c.userId}">${escapeHtml(c.name)} · ${c.count} citas</option>`).join('');
  if (!items.length) { $('clients-list').innerHTML = '<p class="empty-message">AÚN NO HAY DATOS DE CLIENTES</p>'; return; }
  $('clients-list').innerHTML = items.map((c, index) => `<div class="admin-item"><div class="admin-item-main"><div class="admin-item-title">#${index+1} ${escapeHtml(c.name)}</div><div class="admin-item-meta">${c.count} citas registradas</div></div>${c.userId ? `<div class="admin-actions"><button class="mini-btn secondary" data-client-id="${c.userId}">VER PERFIL</button></div>` : ''}</div>`).join('');
}

async function loadUsersAndClients() {
  const snap = await getDocs(collection(db, 'users'));
  usersCache = new Map(snap.docs.map(d => [d.id, { id:d.id, ...d.data() }]));
  const users = [...usersCache.values()];
  const clientUsers = users.filter(u => u.role === 'usuario' && u.status !== 'deleted');
  // We still use all users as fallback for old appointment records.
  const citaSnap = await getDocs(collection(db, 'citas'));
  const frequent = aggregateClients(citaSnap.docs.map(d => d.data()), usersCache);
  if (!frequent.length && clientUsers.length) renderClients(clientUsers.map(u => ({userId:u.id,name:u.username||u.email,count:0})));
  else renderClients(frequent);
}

async function approveApplication(id) {
  const ref = doc(db, 'barberApplications', id);
  const snap = await getDoc(ref); if (!snap.exists()) return;
  const data = snap.data();
  await updateDoc(doc(db, 'users', id), { role:'barbero', status:'approved', approvedAt:serverTimestamp(), approvedBy:adminUid });
  await updateDoc(ref, { status:'approved', reviewedAt:serverTimestamp(), reviewedBy:adminUid });
}

async function rejectApplication(id) {
  const ref = doc(db, 'barberApplications', id);
  const snap = await getDoc(ref); if (!snap.exists()) return;
  await updateDoc(doc(db, 'users', id), { role:'barbero', status:'rejected', rejectedAt:serverTimestamp(), rejectedBy:adminUid });
  await updateDoc(ref, { status:'rejected', reviewedAt:serverTimestamp(), reviewedBy:adminUid });
  // La eliminación real del usuario de Firebase Authentication requiere Admin SDK/Cloud Functions.
  // El login queda bloqueado por status=rejected hasta que se active esa función.
}

async function openClientProfile(uid) {
  const user = usersCache.get(uid); if (!user) return;
  $('client-modal-initial').textContent = (user.username || user.email || 'C').trim().charAt(0).toUpperCase();
  $('client-modal-name').value = user.username || '';
  $('client-modal-email').value = user.email || '';
  const promoSnap = await getDocs(query(collection(db,'promociones'), where('clienteId','==',uid)));
  const promoHtml = promoSnap.docs.map(d => { const p=d.data(); return `<div class="promo-admin-item"><strong>${escapeHtml(p.titulo || 'PROMOCIÓN')}</strong><span>${escapeHtml(p.mensaje || '')}</span></div>`; }).join('') || '<p class="empty-message">SIN PROMOCIONES ENVIADAS</p>';
  $('client-modal-stats').textContent = 'CLIENTE FRECUENTE · Las reseñas que deja son anónimas.';
  $('client-modal-promos').innerHTML = promoHtml;
  $('client-modal').style.display = 'flex';
}

function subscribeRealtime() {
  unsubscribeApplications = onSnapshot(query(collection(db,'barberApplications'), where('status','==','pending')), snap => renderApplications(snap.docs.map(d=>({id:d.id,...d.data()}))));
  unsubscribeBarbers = onSnapshot(query(collection(db,'users'), where('role','==','barbero')), snap => renderBarbers(snap.docs.map(d=>({id:d.id,...d.data()})).filter(b=>b.status==='approved')));
  unsubscribeReviews = onSnapshot(collection(db,'resenas'), snap => renderReviews(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))));
  unsubscribePresence = onSnapshot(collection(db,'presence'), snap => { presenceMap = new Map(snap.docs.map(d=>[d.id,d.data()])); renderBarbers(barbers); });
}

$('applications-list').addEventListener('click', async e => { const btn=e.target.closest('[data-action]'); if(!btn)return; btn.disabled=true; try { if(btn.dataset.action==='approve') await approveApplication(btn.dataset.id); else await rejectApplication(btn.dataset.id); } catch(err){ console.error(err); alert('No se pudo actualizar la solicitud. Revisa las reglas de Firestore.'); } finally { btn.disabled=false; } });
$('barbers-list').addEventListener('click', e => { const btn=e.target.closest('[data-note-id]'); if(btn){ $('note-barber').value=btn.dataset.noteId; $('note-text').focus(); } });
$('clients-list').addEventListener('click', e => { const btn=e.target.closest('[data-client-id]'); if(btn) openClientProfile(btn.dataset.clientId); });
$('client-modal-close').addEventListener('click', ()=>$('client-modal').style.display='none');
$('client-modal').addEventListener('click',e=>{if(e.target.id==='client-modal')$('client-modal').style.display='none'});
$('note-form').addEventListener('submit', async e=>{e.preventDefault(); if(!adminUid)return; const barberId=$('note-barber').value; const text=$('note-text').value.trim(); if(!barberId||!text)return; try{await addDoc(collection(db,'notas'),{barberoId:barberId,texto:text,nueva:true,createdAt:serverTimestamp(),creadoPor:adminUid}); $('note-text').value=''; setStatus('note-message-status','NOTA GUARDADA.');}catch(err){console.error(err);setStatus('note-message-status','NO SE PUDO GUARDAR.',false)}});
$('promo-form').addEventListener('submit', async e=>{e.preventDefault();if(!adminUid)return;const clienteId=$('promo-client').value,titulo=$('promo-title').value.trim(),mensaje=$('promo-message').value.trim();if(!clienteId||!titulo||!mensaje)return;try{await addDoc(collection(db,'promociones'),{clienteId,titulo,mensaje,activa:true,createdAt:serverTimestamp(),creadoPor:adminUid});$('promo-form').reset();setStatus('promo-message-status','PROMOCIÓN ENVIADA.');}catch(err){console.error(err);setStatus('promo-message-status','NO SE PUDO ENVIAR.',false)}});
$('btn-admin-logout').addEventListener('click', async()=>{await signOut(auth);localStorage.clear();location.href='home.html'});

$('admin-date').textContent = new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();

onAuthStateChanged(auth, async user => {
  if (!user) { location.href='login.html'; return; }
  try {
    const userSnap = await getDoc(doc(db,'users',user.uid));
    const profile = userSnap.exists() ? userSnap.data() : {};
    if (profile.role !== 'dueno' && profile.role !== 'admin') { alert('No tienes permisos de administrador.'); await signOut(auth); location.href='home.html'; return; }
    adminUid = user.uid;
    $('admin-name').textContent = (profile.username || user.displayName || user.email?.split('@')[0] || 'ADMINISTRADOR').toUpperCase();
    $('admin-avatar-initial').textContent = $('admin-name').textContent.charAt(0);
    await loadUsersAndClients();
    subscribeRealtime();
  } catch(err) { console.error(err); alert('No se pudo cargar el panel de administración.'); }
});
