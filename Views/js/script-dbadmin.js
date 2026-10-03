import {auth,db,onAuthStateChanged,signOut,collection,doc,getDoc,getDocs,addDoc,setDoc,updateDoc,deleteDoc,query,where,onSnapshot,serverTimestamp,writeBatch,escapeHtml,money,getCurrentProfile,isOwner} from './firebase-core.js';
const $=id=>document.getElementById(id);let adminUid=null;let barbers=[];let usersCache=new Map();let presenceMap=new Map();let unsub=[];
const setStatus=(id,t,ok=true)=>{const e=$(id);if(e){e.textContent=t;e.style.color=ok?'#6fb34f':'#d9534f';}};
const date=v=>v?.toDate?v.toDate().toLocaleDateString('es-CO'):'';
function renderApplications(items){$('pending-count').textContent=items.length;$('stat-pending').textContent=items.length;$('applications-list').innerHTML=items.length?items.map(x=>`<div class="admin-item"><div class="admin-item-main"><div class="admin-item-title">${escapeHtml(x.username||x.email)}</div><div class="admin-item-meta">${escapeHtml(x.email||'')}<br>${date(x.createdAt)}</div></div><div class="admin-actions"><button class="mini-btn" data-approve="${x.id}">ACEPTAR</button><button class="mini-btn reject" data-reject="${x.id}">RECHAZAR</button></div></div>`).join(''):'<p class="empty-message">NO HAY SOLICITUDES PENDIENTES</p>';}
function renderBarbers(items){barbers=items;$('barbers-count').textContent=items.length;$('stat-barbers').textContent=items.length;$('note-barber').innerHTML='<option value="">SELECCIONA UN BARBERO</option>'+items.map(b=>`<option value="${b.id}">${escapeHtml(b.username||b.email)}</option>`).join('');$('barbers-list').innerHTML=items.length?items.map(b=>{const p=presenceMap.get(b.id);const online=p?.online===true;const working=p?.working===true;return `<div class="admin-item"><div class="admin-item-main"><div class="admin-item-title"><span class="status-dot ${online?'online':''}"></span>${escapeHtml(b.username||b.email)}</div><div class="admin-item-meta">${working?'🟠 TRABAJANDO AHORA':online?'🟢 EN LÍNEA':'⚪ FUERA DE LÍNEA'} · ${b.appointmentsCompleted||0} trabajos</div></div><div class="admin-actions"><button class="mini-btn secondary" data-note-id="${b.id}">NOTA</button><button class="mini-btn reject" data-delete-barber="${b.id}">ELIMINAR</button></div></div>`}).join(''):'<p class="empty-message">NO HAY BARBEROS APROBADOS</p>';}
function renderReviews(items){$('reviews-count').textContent=items.length;$('reviews-list').innerHTML=items.length?items.slice(0,100).map(r=>{const stars='★'.repeat(Number(r.rating)||0)+'☆'.repeat(5-(Number(r.rating)||0));const b=usersCache.get(r.barberId)?.username||'BARBERO';return `<div class="admin-item"><div class="admin-item-main"><div class="review-anon">RESEÑA ANÓNIMA · ${escapeHtml(b)}</div><div class="rating">${stars}</div><div class="admin-item-meta">${escapeHtml(r.comment||'')}<br>${date(r.createdAt)}</div></div><div class="admin-actions"><button class="mini-btn reject" data-delete-review="${r.id}">BORRAR</button></div></div>`}).join(''):'<p class="empty-message">AÚN NO HAY RESEÑAS</p>';}
async function loadUsers(){const s=await getDocs(collection(db,'users'));usersCache=new Map(s.docs.map(d=>[d.id,{id:d.id,...d.data()}]));const users=[...usersCache.values()];const clients=users.filter(u=>u.role==='usuario'&&u.status!=='deleted');$('clients-count').textContent=clients.length;$('stat-clients').textContent=clients.length;$('promo-client').innerHTML='<option value="">SELECCIONA UN CLIENTE</option>'+clients.map(c=>`<option value="${c.id}">${escapeHtml(c.username||c.email)}</option>`).join('');$('discount-client').innerHTML=$('promo-client').innerHTML;$('clients-list').innerHTML=clients.map(c=>`<div class="admin-item"><div class="admin-item-main"><div class="admin-item-title">${escapeHtml(c.username||c.email)}</div><div class="admin-item-meta">${escapeHtml(c.email||'')}</div></div></div>`).join('')||'<p class="empty-message">NO HAY CLIENTES</p>';}
async function approve(id){const batch=writeBatch(db);batch.update(doc(db,'users',id),{role:'barbero',status:'approved',approvedAt:serverTimestamp(),approvedBy:adminUid});batch.update(doc(db,'barberApplications',id),{status:'approved',reviewedAt:serverTimestamp(),reviewedBy:adminUid});await batch.commit();}
async function reject(id){const batch=writeBatch(db);batch.update(doc(db,'users',id),{role:'barbero',status:'rejected',rejectedAt:serverTimestamp(),rejectedBy:adminUid});batch.update(doc(db,'barberApplications',id),{status:'rejected',reviewedAt:serverTimestamp(),reviewedBy:adminUid});await batch.commit();}
async function deleteBarber(id){if(!confirm('Esto bloqueará definitivamente la cuenta dentro de la aplicación y eliminará sus datos de Firestore. En Spark no existe una API cliente segura para borrar el usuario de Firebase Authentication. ¿Continuar?'))return;const batch=writeBatch(db);batch.update(doc(db,'users',id),{status:'deleted',deletedAt:serverTimestamp(),deletedBy:adminUid});batch.delete(doc(db,'barberApplications',id));batch.delete(doc(db,'metodosPago',id));await batch.commit();}
async function loadNotes(){const s=await getDocs(collection(db,'notas'));$('notes-admin-list').innerHTML=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)).map(n=>`<div class="admin-item"><div class="admin-item-main"><div class="admin-item-title">${escapeHtml(usersCache.get(n.barberoId)?.username||n.barberoId)}</div><div class="admin-item-meta">${escapeHtml(n.texto)}<br>${date(n.createdAt)}</div></div><div class="admin-actions"><button class="mini-btn secondary" data-edit-note="${n.id}">EDITAR</button><button class="mini-btn reject" data-delete-note="${n.id}">BORRAR</button></div></div>`).join('')||'<p class="empty-message">NO HAY NOTAS.</p>';}
async function editNote(id){const s=await getDoc(doc(db,'notas',id));if(!s.exists())return;const n=s.data();const text=prompt('Editar nota:',n.texto||'');if(text===null)return;const value=text.trim();if(!value)return;await updateDoc(doc(db,'notas',id),{texto:value,updatedAt:serverTimestamp()});loadNotes();}
function subscribe(){unsub.push(onSnapshot(query(collection(db,'barberApplications'),where('status','==','pending')),s=>renderApplications(s.docs.map(d=>({id:d.id,...d.data()})))));unsub.push(onSnapshot(query(collection(db,'users'),where('role','==','barbero')),s=>renderBarbers(s.docs.map(d=>({id:d.id,...d.data()})).filter(x=>x.status==='approved'))));unsub.push(onSnapshot(collection(db,'resenas'),s=>renderReviews(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))));unsub.push(onSnapshot(collection(db,'presence'),s=>{presenceMap=new Map(s.docs.map(d=>[d.id,d.data()]));renderBarbers(barbers);}));}
$('applications-list').addEventListener('click',async e=>{const a=e.target.closest('[data-approve]'),r=e.target.closest('[data-reject]');try{if(a)await approve(a.dataset.approve);if(r)await reject(r.dataset.reject);}catch(err){console.error(err);alert('No se pudo actualizar la solicitud.');}});
$('barbers-list').addEventListener('click',async e=>{const n=e.target.closest('[data-note-id]'),d=e.target.closest('[data-delete-barber]');if(n){$('note-barber').value=n.dataset.noteId;$('note-text').focus();}if(d)await deleteBarber(d.dataset.deleteBarber);});
$('reviews-list').addEventListener('click',async e=>{const b=e.target.closest('[data-delete-review]');if(b)await deleteDoc(doc(db,'resenas',b.dataset.deleteReview));});
$('notes-admin-list').addEventListener('click',async e=>{const ed=e.target.closest('[data-edit-note]'),del=e.target.closest('[data-delete-note]');if(ed)await editNote(ed.dataset.editNote);if(del&&confirm('¿Borrar esta nota?')){await deleteDoc(doc(db,'notas',del.dataset.deleteNote));await loadNotes();}});
$('note-form').addEventListener('submit',async e=>{e.preventDefault();const barberId=$('note-barber').value,text=$('note-text').value.trim();if(!barberId||!text)return;await addDoc(collection(db,'notas'),{barberoId:barberId,texto:text,nueva:true,createdAt:serverTimestamp(),creadoPor:adminUid});$('note-text').value='';setStatus('note-message-status','NOTA GUARDADA.');await loadNotes();});
$('promo-form').addEventListener('submit',async e=>{e.preventDefault();const clienteId=$('promo-client').value,titulo=$('promo-title').value.trim(),mensaje=$('promo-message').value.trim();if(!clienteId||!titulo||!mensaje)return;await addDoc(collection(db,'promociones'),{clienteId,titulo,mensaje,activa:true,createdAt:serverTimestamp(),creadoPor:adminUid});e.target.reset();setStatus('promo-message-status','PROMOCIÓN ENVIADA.');});
$('owner-payment-form').addEventListener('submit',async e=>{e.preventDefault();await updateOwnerPayments();});
async function updateOwnerPayments(){await setDoc(doc(db,'metodosPago',adminUid),{nequi:$('owner-nequi').value.trim(),daviplata:$('owner-daviplata').value.trim(),breb:$('owner-breb').value.trim(),updatedAt:serverTimestamp()},{merge:true});setStatus('owner-payment-status','MÉTODOS DE PAGO DEL DUEÑO GUARDADOS.');}
async function loadOwnerPayments(){const s=await getDoc(doc(db,'metodosPago',adminUid));if(s.exists()){const p=s.data();$('owner-nequi').value=p.nequi||'';$('owner-daviplata').value=p.daviplata||'';$('owner-breb').value=p.breb||'';}}
$('btn-admin-logout').addEventListener('click',async()=>{await signOut(auth);localStorage.clear();location.href='home.html';});
$('admin-date').textContent=new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'}).toUpperCase();
onAuthStateChanged(auth,async user=>{if(!user)return location.href='login.html';const p=await getCurrentProfile(user);if(!isOwner(p)){alert('No tienes permisos de administrador.');return location.href='home.html';}adminUid=user.uid;$('admin-name').textContent=(p.username||user.email?.split('@')[0]||'DUEÑO').toUpperCase();$('admin-avatar-initial').textContent=$('admin-name').textContent.charAt(0);await loadUsers();await loadNotes();await loadOwnerPayments();subscribe();subscribeDiscounts();subscribeCobros();});

// ============================================================
// CÓDIGOS DE DESCUENTO (colección `descuentos`, id = código)
// ============================================================
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomDiscountCode(){let r='';for(let i=0;i<6;i++)r+=CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)];return r;}
async function createDiscount(clienteId,pct,send){
  let code='';
  for(let i=0;i<10;i++){const c=randomDiscountCode();if(!(await getDoc(doc(db,'descuentos',c))).exists()){code=c;break;}}
  if(!code)throw new Error('No se pudo generar un código único, intenta de nuevo.');
  const cli=usersCache.get(clienteId);
  const batch=writeBatch(db);
  batch.set(doc(db,'descuentos',code),{codigo:code,clienteId,cliente:cli?.username||cli?.email||'CLIENTE',porcentaje:pct,estado:'activo',creadoPor:adminUid,createdAt:serverTimestamp()});
  if(send)batch.set(doc(collection(db,'promociones')),{clienteId,titulo:`DESCUENTO DEL ${pct}%`,mensaje:`Usa el código ${code} al pagar tu próxima cita y obtén ${pct}% de descuento.`,codigo:code,porcentaje:pct,activa:true,createdAt:serverTimestamp(),creadoPor:adminUid});
  await batch.commit();
  return code;
}
function renderDiscounts(items){
  $('discounts-count').textContent=items.filter(d=>d.estado==='activo').length;
  $('discounts-list').innerHTML=items.length?items.map(d=>`<div class="admin-item"><div class="admin-item-main"><div class="admin-item-title"><span class="code-chip">${escapeHtml(d.codigo||d.id)}</span> ${Number(d.porcentaje)||0}%</div><div class="admin-item-meta">${escapeHtml(d.cliente||'')} · ${d.estado==='activo'?'🟢 ACTIVO':'⚪ USADO'}<br>${date(d.createdAt)}</div></div><div class="admin-actions">${d.estado==='activo'?`<button class="mini-btn reject" data-delete-discount="${d.id}">ANULAR</button>`:''}</div></div>`).join(''):'<p class="empty-message">AÚN NO HAY CÓDIGOS</p>';
}
function subscribeDiscounts(){
  unsub.push(onSnapshot(collection(db,'descuentos'),s=>renderDiscounts(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)))));
}
$('discount-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const clienteId=$('discount-client').value,pct=Number($('discount-percent').value);
  if(!clienteId)return;
  if(!Number.isInteger(pct)||pct<1||pct>100)return setStatus('discount-form-status','EL DESCUENTO DEBE SER UN NÚMERO ENTERO ENTRE 1 Y 100.',false);
  try{
    const code=await createDiscount(clienteId,pct,$('discount-send').checked);
    e.target.reset();$('discount-send').checked=true;
    setStatus('discount-form-status',`CÓDIGO GENERADO: ${code}`);
  }catch(err){console.error(err);setStatus('discount-form-status',err.message||'NO SE PUDO GENERAR EL CÓDIGO.',false);}
});
$('discounts-list').addEventListener('click',async e=>{
  const b=e.target.closest('[data-delete-discount]');if(!b)return;
  if(!confirm('¿Anular este código? El cliente ya no podrá usarlo.'))return;
  try{
    const code=b.dataset.deleteDiscount;
    const batch=writeBatch(db);
    batch.delete(doc(db,'descuentos',code));
    (await getDocs(query(collection(db,'promociones'),where('codigo','==',code)))).docs.forEach(d=>batch.delete(d.ref));
    await batch.commit();
  }catch(err){console.error(err);alert('No se pudo anular el código.');}
});

// ============================================================
// COBROS DE BARBEROS (colección `cobros`, la escribe Caja)
// ============================================================
let cobrosReady=false,toastTimer=null;
function showToast(text){const t=$('toast');t.textContent=text;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),8000);}
const cobroText=c=>`${c.barbero||'BARBERO'} cobró «${c.servicio||'servicio'}» a ${c.cliente||'CLIENTE'} · ${money(c.total)}${c.descuentoPct?` (-${c.descuentoPct}%)`:''}`;
function renderCobros(items){
  const unread=items.filter(c=>c.leido===false).length;
  $('cobros-unread').textContent=unread;
  $('cobros-list').innerHTML=items.length?items.slice(0,50).map(c=>`<div class="admin-item"><div class="admin-item-main"><div class="admin-item-title">${c.leido===false?'<span class="unread-dot"></span>':''}${escapeHtml(c.barbero||'BARBERO')} · ${escapeHtml(c.servicio||'')}</div><div class="admin-item-meta">CLIENTE: ${escapeHtml(c.cliente||'')} · ${money(c.total)}${c.descuentoPct?` (descuento ${c.descuentoPct}%, subtotal ${money(c.subtotal)})`:''}<br>EFECTIVO · ${c.createdAt?.toDate?c.createdAt.toDate().toLocaleString('es-CO'):''}</div></div><div class="admin-actions">${c.leido===false?`<button class="mini-btn secondary" data-read-cobro="${c.id}">LEÍDO</button>`:''}</div></div>`).join(''):'<p class="empty-message">AÚN NO HAY COBROS</p>';
}
function subscribeCobros(){
  unsub.push(onSnapshot(collection(db,'cobros'),s=>{
    const items=s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    renderCobros(items);
    // Avisa en vivo de los cobros nuevos (no de los que ya existían al abrir la página).
    if(cobrosReady)s.docChanges().forEach(ch=>{if(ch.type==='added'&&ch.doc.data().leido===false)showToast('💰 '+cobroText(ch.doc.data()));});
    cobrosReady=true;
  }));
}
$('cobros-list').addEventListener('click',async e=>{const b=e.target.closest('[data-read-cobro]');if(b)await updateDoc(doc(db,'cobros',b.dataset.readCobro),{leido:true});});
$('cobros-mark-all').addEventListener('click',async()=>{
  const unreadDocs=(await getDocs(query(collection(db,'cobros'),where('leido','==',false)))).docs;
  if(!unreadDocs.length)return;
  const batch=writeBatch(db);unreadDocs.forEach(d=>batch.update(d.ref,{leido:true}));await batch.commit();
});
