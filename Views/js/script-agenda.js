import {
  auth, db, onAuthStateChanged, collection, doc, getDoc, getDocs, query, where,
  onSnapshot, runTransaction, serverTimestamp, escapeHtml, money, scheduleForDate,
  getCurrentProfile
} from './firebase-core.js';

const $ = id => document.getElementById(id);
let currentUser = null;
let currentProfile = null;
let barbers = [];
let selectedBarber = null;
let selectedDate = '';
let selectedTime = '';
let selectedPayment = '';
let portfolio = [];
let unsubscribeAppointments = null;

function notify(text, ok=false) {
  const el=$('agenda-status'); if (!el) return;
  el.textContent=text; el.className=`agenda-status ${ok?'ok':'error'}`;
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}

function renderBarbers() {
  $('barber-list').innerHTML = barbers.length ? barbers.map(b => `
    <button class="barber-card ${selectedBarber?.id===b.id?'selected':''}" data-barber="${b.id}">
      <div class="barber-card-name">${escapeHtml(b.username || b.email || 'BARBERO')}</div>
      <div class="barber-card-meta">${b.status==='approved'?'DISPONIBLE PARA RESERVAS':'NO DISPONIBLE'}</div>
    </button>`).join('') : '<p class="empty-message">NO HAY BARBEROS DISPONIBLES.</p>';
}

async function loadBarbers() {
  const snap = await getDocs(query(collection(db,'users'), where('role','==','barbero'), where('status','==','approved')));
  barbers = snap.docs.map(d=>({id:d.id,...d.data()}));
  renderBarbers();
}

async function loadPortfolio(barberId) {
  const snap=await getDocs(query(collection(db,'barberPortfolio'), where('barberId','==',barberId)));
  portfolio=snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(a.position||0)-(b.position||0));
  $('portfolio').innerHTML=portfolio.length ? portfolio.map((p,i)=>`<img src="${p.dataUrl}" alt="Trabajo ${i+1}" loading="lazy">`).join('') : '<p class="empty-message">ESTE BARBERO AÚN NO HA SUBIDO PORTAFOLIO.</p>';
}

function appointmentId() {
  return `${selectedBarber.id}_${selectedDate}_${selectedTime.replace(':','')}`;
}

function renderTimes(citas=[]) {
  if (!selectedDate || !selectedBarber) { $('time-list').innerHTML='<p class="empty-message">ELIGE BARBERO Y FECHA.</p>'; return; }
  const busy=new Set(citas.map(c=>c.hora));
  const slots=scheduleForDate(new Date(`${selectedDate}T12:00:00`));
  $('time-list').innerHTML=slots.map(t=>{
    const isBusy=busy.has(t);
    return `<button class="time-slot ${selectedTime===t?'selected':''}" ${isBusy?'disabled':''} data-time="${t}">${t}${isBusy?' · OCUPADO':''}</button>`;
  }).join('');
}

function subscribeAvailability() {
  if (unsubscribeAppointments) unsubscribeAppointments();
  if (!selectedBarber || !selectedDate) return renderTimes([]);
  const q=query(collection(db,'citas'), where('barberoId','==',selectedBarber.id), where('fecha','==',selectedDate));
  unsubscribeAppointments=onSnapshot(q,snap=>{
    const citas=snap.docs.map(d=>({id:d.id,...d.data()})).filter(c=>!['cancelada'].includes(c.estado));
    const working=citas.some(c=>c.estado==='trabajando');
    // Si está trabajando, el bloque correspondiente queda ocupado igual que una cita.
    renderTimes(citas);
    if (working) $('barber-live-state').textContent='EN SERVICIO';
  });
}

function validateStep() {
  if (!selectedBarber) return 'Selecciona un barbero.';
  if (!selectedDate) return 'Selecciona un día.';
  if (!selectedTime) return 'Selecciona una hora.';
  if (!selectedPayment) return 'Selecciona un método de pago.';
  return '';
}

function generateCode() {
  const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result='';
  for(let i=0;i<5;i++) result += chars[Math.floor(Math.random()*chars.length)];
  return result;
}

async function createAppointment() {
  const error=validateStep(); if(error) return notify(error);
  const citaRef=doc(db,'citas',appointmentId());
  const barberRef=doc(db,'users',selectedBarber.id);
  const userRef=doc(db,'users',currentUser.uid);
  try {
    const result=await runTransaction(db, async tx=>{
      const existing=await tx.get(citaRef);
      if(existing.exists() && existing.data().estado!=='cancelada') throw new Error('Ese horario acaba de ser reservado por otra persona.');
      const barberSnap=await tx.get(barberRef);
      const clientSnap=await tx.get(userRef);
      const barber=barberSnap.data()||{};
      const client=clientSnap.data()||{};
      const cita={
        userId:currentUser.uid,
        cliente:client.username || currentUser.email?.split('@')[0] || 'CLIENTE',
        barberoId:selectedBarber.id,
        barbero:barber.username || selectedBarber.username || 'BARBERO',
        fecha:selectedDate, hora:selectedTime,
        servicio:$('service').value.trim() || 'CORTE',
        total:Number($('total').value)||0,
        metodoPago:selectedPayment,
        estado:'reservada',
        estadoPago:'pendiente',
        createdAt:serverTimestamp(), updatedAt:serverTimestamp()
      };
      let radicado=null;
      if(selectedPayment==='efectivo') {
        radicado=generateCode();
        tx.set(doc(db,'radicados',radicado), {codigo:radicado,citaId:citaRef.id,userId:currentUser.uid,barberoId:selectedBarber.id,total:cita.total,estado:'activo',createdAt:serverTimestamp()});
        cita.radicado=radicado;
      }
      tx.set(citaRef,cita);
      return {radicado};
    });
    $('booking-summary').innerHTML=`<div class="success-box"><strong>¡CITA RESERVADA!</strong><p>${escapeHtml(selectedDate)} · ${escapeHtml(selectedTime)}</p>${result.radicado?`<p>RADICADO EN EFECTIVO: <strong>${result.radicado}</strong></p><small>Guárdalo para presentarlo en caja.</small>`:'<p>PAGO DIGITAL: ${escapeHtml(selectedPayment.toUpperCase())}</p>'}</div>`;
    notify('Reserva creada correctamente.',true);
  } catch(e) { console.error(e); notify(e.message || 'No se pudo crear la reserva.'); }
}

$('barber-list').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-barber]'); if(!btn)return;
  selectedBarber=barbers.find(b=>b.id===btn.dataset.barber); selectedTime=''; renderBarbers();
  $('selected-barber').textContent=selectedBarber.username||selectedBarber.email||'BARBERO';
  await loadPortfolio(selectedBarber.id); subscribeAvailability();
});
$('booking-date').addEventListener('change',()=>{selectedDate=$('booking-date').value;selectedTime='';subscribeAvailability();});
$('time-list').addEventListener('click',e=>{const btn=e.target.closest('[data-time]');if(!btn)return;selectedTime=btn.dataset.time;renderTimes(Array.from(document.querySelectorAll('.time-slot[disabled]')).map(x=>({hora:x.dataset.time})));});
document.querySelectorAll('[data-payment]').forEach(btn=>btn.addEventListener('click',()=>{selectedPayment=btn.dataset.payment;document.querySelectorAll('[data-payment]').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');loadPaymentInfo();}));
$('booking-form').addEventListener('submit',e=>{e.preventDefault();createAppointment();});

async function loadPaymentInfo(){
  const box=$('payment-info');
  if(!selectedBarber || !selectedPayment || selectedPayment==='efectivo'){box.textContent=selectedPayment==='efectivo'?'Se generará un radicado único de 5 caracteres.':'Selecciona un método.';return;}
  const snap=await getDoc(doc(db,'metodosPago',selectedBarber.id)); const p=snap.exists()?snap.data():{};
  const key=selectedPayment==='nequi'?'nequi':selectedPayment==='daviplata'?'daviplata':'breb';
  box.textContent=p[key] ? `PAGA POR ${selectedPayment.toUpperCase()}: ${p[key]}` : 'El barbero aún no ha configurado este método de pago.';
}

onAuthStateChanged(auth, async user=>{
  if(!user)return location.href='login.html';
  currentUser=user; currentProfile=await getCurrentProfile(user);
  if(!currentProfile || currentProfile.role!=='usuario'){alert('Esta agenda es para clientes.');return location.href='home.html';}
  const today=new Date(); const min=dateKey(today); $('booking-date').min=min;
  await loadBarbers();
  const preset=new URLSearchParams(location.search).get('barber');
  if(preset){const btn=document.querySelector(`[data-barber="${preset}"]`);if(btn)btn.click();}
});
