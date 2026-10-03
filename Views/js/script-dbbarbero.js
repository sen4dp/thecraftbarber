import {
  auth, db, onAuthStateChanged, signOut, collection, doc, getDoc, getDocs,
  query, where, onSnapshot, setDoc, updateDoc, serverTimestamp,
  escapeHtml, parseAppointmentDate, getCurrentProfile, money
} from './firebase-core.js';

const $=id=>document.getElementById(id);
let currentUser=null, currentProfile=null;
let unsubCitas=null, unsubNotes=null;
let workingAppointmentId=null;

function todayKey(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function greeting(){const h=new Date().getHours();return h<12?'BUENOS DÍAS':h<19?'BUENAS TARDES':'BUENAS NOCHES';}
function formatDate(d){return d?.toLocaleDateString('es-CO',{day:'2-digit',month:'2-digit',year:'numeric'})||'';}
function setInitial(name){const x=(name||'?').trim().charAt(0).toUpperCase();$('navbar-avatar-initial').textContent=x;$('modal-avatar-initial').textContent=x;}
function statusLabel(s){return ({reservada:'RESERVADA',trabajando:'TRABAJANDO',recibida:'RECIBIDA',finalizada:'FINALIZADA',cancelada:'CANCELADA'})[s]||String(s||'').toUpperCase();}

async function setPresence(extra={}){
  await setDoc(doc(db,'presence',currentUser.uid),{online:true,username:currentProfile.username||currentUser.email?.split('@')[0]||'BARBERO',lastSeen:serverTimestamp(),...extra},{merge:true});
}
async function stopPresence(){await setDoc(doc(db,'presence',currentUser.uid),{online:false,working:false,lastSeen:serverTimestamp()},{merge:true});}

function renderAgenda(citas){
  citas.sort((a,b)=>(parseAppointmentDate(a)?.getTime()||Infinity)-(parseAppointmentDate(b)?.getTime()||Infinity));
  const today=citas.filter(c=>c.fecha===todayKey() && c.estado!=='cancelada');
  const next=citas.find(c=>parseAppointmentDate(c)>=new Date() && c.estado!=='cancelada');
  $('agenda-count').textContent=citas.filter(c=>c.estado!=='cancelada').length;
  $('stat-today').textContent=today.length;
  $('stat-next').textContent=next?.hora||'—';
  $('stat-done').textContent=citas.filter(c=>c.fecha===todayKey()&&c.estadoPago==='pagado').length;
  if(!citas.length){$('agenda-grid').innerHTML='<p class="empty-message">AÚN NO TIENES CITAS ASIGNADAS</p>';return;}
  $('agenda-grid').innerHTML=citas.map(c=>`<div class="appointment-item ${c.estado==='trabajando'?'working':''}">
    <span class="badge">${statusLabel(c.estado)}</span>
    <div class="appointment-row"><span class="appointment-label">FECHA</span><span class="appointment-value">${escapeHtml(c.fecha)}</span></div>
    <div class="appointment-row"><span class="appointment-label">HORA</span><span class="appointment-value">${escapeHtml(c.hora)}</span></div>
    <div class="appointment-row"><span class="appointment-label">CLIENTE</span><span class="appointment-value">${escapeHtml(c.cliente||'CLIENTE')}</span></div>
    <div class="appointment-row"><span class="appointment-label">SERVICIO</span><span class="appointment-value">${escapeHtml(c.servicio||'CORTE')}</span></div>
    <div class="appointment-row"><span class="appointment-label">TOTAL</span><span class="appointment-value">${money(c.total)}${c.descuentoPct?` (-${c.descuentoPct}%)`:''}</span></div>
    <div class="barber-appointment-actions">
      ${c.estado==='reservada'?`<button class="mini-btn" data-work="${c.id}">EMPEZAR SERVICIO</button>`:''}
      ${c.estado==='trabajando'?`<button class="mini-btn" data-finish="${c.id}">FINALIZAR / RECIBIR</button>`:''}
      ${['reservada','trabajando'].includes(c.estado)?`<button class="mini-btn reject" data-cancel="${c.id}">CLIENTE NO LLEGÓ</button>`:''}
    </div>
  </div>`).join('');
}

function subscribeAppointments(){
  if(unsubCitas)unsubCitas();
  const q=query(collection(db,'citas'),where('barberoId','==',currentUser.uid));
  unsubCitas=onSnapshot(q,snap=>{
    const citas=snap.docs.map(d=>({id:d.id,...d.data()}));
    workingAppointmentId=citas.find(c=>c.estado==='trabajando')?.id||null;
    setPresence({working:!!workingAppointmentId,workingCitaId:workingAppointmentId||null});
    renderAgenda(citas);
  });
}

async function updateAppointment(id,status){
  const ref=doc(db,'citas',id);
  const snap=await getDoc(ref);if(!snap.exists())return;
  const cita=snap.data();
  const data={estado:status,updatedAt:serverTimestamp()};
  if(status==='trabajando'){data.startedAt=serverTimestamp();await setPresence({working:true,workingCitaId:id});}
  if(status==='finalizada'||status==='recibida'){data.finishedAt=serverTimestamp();await setPresence({working:false,workingCitaId:null});}
  if(status==='cancelada'){data.cancelledAt=serverTimestamp();await setPresence({working:false,workingCitaId:null});}
  await updateDoc(ref,data);
}

$('agenda-grid').addEventListener('click',async e=>{
  const w=e.target.closest('[data-work]'), f=e.target.closest('[data-finish]'), c=e.target.closest('[data-cancel]');
  try{if(w)await updateAppointment(w.dataset.work,'trabajando');if(f)await updateAppointment(f.dataset.finish,'finalizada');if(c)await updateAppointment(c.dataset.cancel,'cancelada');}catch(err){console.error(err);alert('No se pudo actualizar la cita.');}
});

function renderNotes(items){
  $('notes-count').textContent=items.length;
  $('notes-list').innerHTML=items.length?items.map(n=>`<div class="note-item"><span class="note-date">${formatDate(n.createdAt?.toDate?.()||new Date())}</span><p class="note-text">${escapeHtml(n.texto)}</p></div>`).join(''):'<p class="empty-message">NO TIENES NOTAS NUEVAS</p>';
}
function subscribeNotes(){
  if(unsubNotes)unsubNotes();
  const q=query(collection(db,'notas'),where('barberoId','==',currentUser.uid));
  unsubNotes=onSnapshot(q,s=>renderNotes(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))));
}

async function savePayments(){
  await setDoc(doc(db,'metodosPago',currentUser.uid),{nequi:$('pay-nequi').value.trim(),daviplata:$('pay-daviplata').value.trim(),breb:$('pay-breb').value.trim(),updatedAt:serverTimestamp()},{merge:true});
  $('payment-status').textContent='MÉTODOS DE PAGO GUARDADOS.';
}
async function loadPayments(){const s=await getDoc(doc(db,'metodosPago',currentUser.uid));if(!s.exists())return;const p=s.data();$('pay-nequi').value=p.nequi||'';$('pay-daviplata').value=p.daviplata||'';$('pay-breb').value=p.breb||'';}
$('payment-form').addEventListener('submit',e=>{e.preventDefault();savePayments().catch(err=>{console.error(err);$('payment-status').textContent='NO SE PUDO GUARDAR.';});});

$('user-profile-trigger').addEventListener('click',()=>{$('profile-modal').style.display='flex';});
$('modal-close-btn').addEventListener('click',()=>{$('profile-modal').style.display='none';});
$('btn-logout').addEventListener('click',async()=>{await stopPresence();await signOut(auth);location.href='home.html';});

onAuthStateChanged(auth,async user=>{
  if(!user)return location.href='login.html';
  try{
    currentUser=user;currentProfile=await getCurrentProfile(user);
    if(!currentProfile || currentProfile.role!=='barbero' || currentProfile.status!=='approved'){alert('Tu cuenta de barbero no está aprobada.');return signOut(auth);}
    const name=currentProfile.username||user.displayName||user.email?.split('@')[0]||'BARBERO';
    $('user-name-display').textContent=name.toUpperCase();$('hero-username').textContent=name.toUpperCase();$('hero-greeting').textContent=greeting();$('hero-date').textContent=new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();$('modal-username').value=name.toUpperCase();$('modal-email').value=user.email||'';setInitial(name);
    await setPresence({working:false,workingCitaId:null});
    setInterval(()=>setPresence({working:!!workingAppointmentId,workingCitaId:workingAppointmentId||null}),30000);
    subscribeAppointments();subscribeNotes();await loadPayments();
  }catch(err){console.error(err);alert('No se pudo cargar tu dashboard.');}
});
