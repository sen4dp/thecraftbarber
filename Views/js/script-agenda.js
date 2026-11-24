import {
  auth, db, onAuthStateChanged, collection, doc, getDoc, getDocs, query, where,
  onSnapshot, writeBatch, serverTimestamp, escapeHtml, money, scheduleForDate, randomCode,
  getCurrentProfile, SERVICES, servicePrice, discountedTotal
} from './firebase-core.js';

const $ = id => document.getElementById(id);
let currentUser = null;
let currentProfile = null;
let barbers = [];
let selectedBarber = null;
let selectedDate = '';
let selectedTime = '';
let selectedPayment = '';
let appliedDiscount = null; // { codigo, porcentaje }
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
  try {
    const snap = await getDocs(query(collection(db,'users'), where('role','==','barbero'), where('status','==','approved')));
    barbers = snap.docs.map(d=>({id:d.id,...d.data()}));
    renderBarbers();
  } catch (e) {
    console.error(e);
    $('barber-list').innerHTML = '<p class="empty-message">NO SE PUDIERON CARGAR LOS BARBEROS.</p>';
  }
}

function renderServices() {
  $('service').innerHTML = '<option value="">SELECCIONA EL SERVICIO</option>' +
    SERVICES.map(x => `<option value="${escapeHtml(x.nombre)}">${escapeHtml(x.nombre)} — ${money(x.precio)}</option>`).join('');
}

function currentPrices() {
  const subtotal = servicePrice($('service').value);
  const pct = appliedDiscount ? appliedDiscount.porcentaje : 0;
  return { subtotal, pct, total: discountedTotal(subtotal, pct) };
}

function renderPrice() {
  const { subtotal, pct, total } = currentPrices();
  if (!subtotal) { $('price-summary').innerHTML = '<p class="empty-message">ELIGE UN SERVICIO PARA VER EL PRECIO.</p>'; return; }
  $('price-summary').innerHTML =
    `<div class="row"><span>SUBTOTAL</span><span>${money(subtotal)}</span></div>` +
    (pct ? `<div class="row disc"><span>DESCUENTO ${pct}% (${escapeHtml(appliedDiscount.codigo)})</span><span>-${money(subtotal - total)}</span></div>` : '') +
    `<div class="row total"><strong>TOTAL A PAGAR</strong><strong>${money(total)}</strong></div>`;
}

function discountMsg(text, ok=false) {
  const el = $('discount-status'); el.textContent = text; el.className = `discount-status ${ok ? 'ok' : 'error'}`;
}

async function applyDiscount() {
  const code = $('discount-code').value.trim().toUpperCase();
  if (!code) { appliedDiscount = null; renderPrice(); return discountMsg('Escribe un código.'); }
  try {
    const snap = await getDoc(doc(db, 'descuentos', code));
    const d = snap.exists() ? snap.data() : null;
    if (!d || d.clienteId !== currentUser.uid) throw new Error('invalid');
    if (d.estado !== 'activo') { appliedDiscount = null; renderPrice(); return discountMsg('Este código ya fue utilizado.'); }
    appliedDiscount = { codigo: code, porcentaje: Number(d.porcentaje) };
    $('discount-code').value = code;
    renderPrice();
    discountMsg(`¡Código aplicado! ${appliedDiscount.porcentaje}% de descuento.`, true);
  } catch (e) {
    appliedDiscount = null; renderPrice();
    discountMsg('Código inválido o no pertenece a tu cuenta.');
  }
}

function appointmentId() {
  return `${selectedBarber.id}_${selectedDate}_${selectedTime.replace(':','')}`;
}

function renderTimes(citas=[]) {
  if (!selectedDate || !selectedBarber) { $('time-list').innerHTML='<p class="empty-message">ELIGE BARBERO Y FECHA.</p>'; return; }
  const busy=new Set(citas.map(c=>c.hora));
  const slots=scheduleForDate(new Date(`${selectedDate}T12:00:00`));
  // Hoy: las horas que ya empezaron no se pueden reservar.
  const now=new Date(), isToday=selectedDate===dateKey(now);
  const past=t=>isToday && Number(t.slice(0,2))<=now.getHours();
  $('time-list').innerHTML=slots.map(t=>{
    const isBusy=busy.has(t), isPast=past(t), off=isBusy||isPast;
    return `<button class="time-slot ${selectedTime===t?'selected':''}" ${off?'disabled':''} data-time="${t}">${t}${isBusy?' · OCUPADO':isPast?' · PASÓ':''}</button>`;
  }).join('');
}

function subscribeAvailability() {
  if (unsubscribeAppointments) unsubscribeAppointments();
  $('barber-live-state').textContent='';
  if (!selectedBarber || !selectedDate) return renderTimes([]);
  // La disponibilidad se lee de `slots` (público y mínimo), no de `citas` (privadas).
  const q=query(collection(db,'slots'), where('barberoId','==',selectedBarber.id), where('fecha','==',selectedDate));
  unsubscribeAppointments=onSnapshot(q,snap=>{
    renderTimes(snap.docs.map(d=>d.data()));
  },err=>{ console.error(err); notify('No se pudo cargar la disponibilidad.'); });
}

function validateStep() {
  if (!selectedBarber) return 'Selecciona un barbero.';
  if (!selectedDate) return 'Selecciona un día.';
  if (!selectedTime) return 'Selecciona una hora.';
  if (!servicePrice($('service').value)) return 'Selecciona un servicio.';
  if (!selectedPayment) return 'Selecciona un método de pago.';
  return '';
}


async function createAppointment() {
  const error=validateStep(); if(error) return notify(error);
  const btn=document.querySelector('#booking-form [type=submit]'); if(btn) btn.disabled=true;
  const { subtotal, pct, total } = currentPrices();
  const slotId=`${selectedBarber.id}_${selectedDate}_${selectedTime.replace(':','')}`;
  const discountRef = appliedDiscount ? doc(db,'descuentos',appliedDiscount.codigo) : null;
  const servicio=$('service').value;
  // Hasta 3 intentos: solo se reintenta si el radicado en efectivo choca con otro existente.
  let lastErr=null;
  for (let attempt=0; attempt<3; attempt++) {
    const citaRef=doc(collection(db,'citas'));            // ID automático
    const radicado = selectedPayment==='efectivo' ? randomCode(5) : null;
    const cita={
      userId:currentUser.uid,
      cliente:currentProfile.username || currentUser.email?.split('@')[0] || 'CLIENTE',
      barberoId:selectedBarber.id,
      barbero:selectedBarber.username || 'BARBERO',
      fecha:selectedDate, hora:selectedTime, servicio,
      subtotal, total, metodoPago:selectedPayment,
      estado:'reservada', estadoPago:'pendiente', slotId,
      createdAt:serverTimestamp(), updatedAt:serverTimestamp()
    };
    if (discountRef) { cita.descuentoCodigo=appliedDiscount.codigo; cita.descuentoPct=pct; }
    if (radicado) cita.radicado=radicado;
    const batch=writeBatch(db);
    batch.set(citaRef,cita);
    // Slot con ID determinista: si ya existe, las reglas rechazan el batch (horario tomado).
    batch.set(doc(db,'slots',slotId),{citaId:citaRef.id,userId:currentUser.uid,barberoId:selectedBarber.id,fecha:selectedDate,hora:selectedTime,createdAt:serverTimestamp()});
    if (radicado) batch.set(doc(db,'radicados',radicado),{codigo:radicado,citaId:citaRef.id,userId:currentUser.uid,barberoId:selectedBarber.id,total,estado:'activo',createdAt:serverTimestamp()});
    if (discountRef) batch.update(discountRef,{estado:'usado',citaId:citaRef.id,usadoAt:serverTimestamp()});
    try {
      await batch.commit();
      $('booking-summary').innerHTML=`<div class="success-box"><strong>¡CITA RESERVADA!</strong><p>${escapeHtml(selectedDate)} · ${escapeHtml(selectedTime)}</p><p>${escapeHtml(servicio)} · TOTAL ${money(total)}${pct?` (${pct}% DESCUENTO)`:''}</p>${radicado?`<p>RADICADO EN EFECTIVO: <strong>${escapeHtml(radicado)}</strong></p><small>Guárdalo para presentarlo en caja.</small>`:`<p>PAGO DIGITAL: ${escapeHtml(selectedPayment.toUpperCase())}</p>`}</div>`;
      notify('Reserva creada correctamente.',true);
      appliedDiscount=null; $('discount-code').value=''; discountMsg(''); renderPrice();
      selectedTime='';
      if(btn) btn.disabled=false;
      return;
    } catch(e) {
      lastErr=e; console.error(e);
      if (!(e.code==='permission-denied' && radicado)) break;   // reintenta solo con efectivo
    }
  }
  notify(lastErr?.code==='permission-denied' ? 'Ese horario ya fue reservado por otra persona o el código ya no es válido.' : (lastErr?.message || 'No se pudo crear la reserva.'));
  if(btn) btn.disabled=false;
}

$('barber-list').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-barber]'); if(!btn)return;
  selectedBarber=barbers.find(b=>b.id===btn.dataset.barber); selectedTime=''; renderBarbers();
  $('selected-barber').textContent=selectedBarber.username||selectedBarber.email||'BARBERO';
  subscribeAvailability();
});
$('booking-date').addEventListener('change',()=>{selectedDate=$('booking-date').value;selectedTime='';subscribeAvailability();});
$('time-list').addEventListener('click',e=>{const btn=e.target.closest('[data-time]');if(!btn)return;selectedTime=btn.dataset.time;document.querySelectorAll('.time-slot').forEach(x=>x.classList.toggle('selected',x.dataset.time===selectedTime));});
document.querySelectorAll('[data-payment]').forEach(btn=>btn.addEventListener('click',()=>{selectedPayment=btn.dataset.payment;document.querySelectorAll('[data-payment]').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');loadPaymentInfo();}));
$('service').addEventListener('change',renderPrice);
$('apply-discount').addEventListener('click',applyDiscount);
$('discount-code').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyDiscount();}});
$('booking-form').addEventListener('submit',e=>{e.preventDefault();createAppointment();});

async function loadPaymentInfo(){
  const box=$('payment-info');
  if(!selectedBarber || !selectedPayment || selectedPayment==='efectivo'){box.textContent=selectedPayment==='efectivo'?'Se generará un radicado único de 5 caracteres.':'Selecciona un método.';return;}
  let p={};
  try{const snap=await getDoc(doc(db,'metodosPago',selectedBarber.id));p=snap.exists()?snap.data():{};}
  catch(e){console.error(e);box.textContent='No se pudieron cargar los datos de pago del barbero.';return;}
  const key=selectedPayment==='nequi'?'nequi':selectedPayment==='daviplata'?'daviplata':'breb';
  box.textContent=p[key] ? `PAGA POR ${selectedPayment.toUpperCase()}: ${p[key]}` : 'El barbero aún no ha configurado este método de pago.';
}

onAuthStateChanged(auth, async user=>{
  if(!user)return location.href='login.html';
  currentUser=user; currentProfile=await getCurrentProfile(user);
  if(!currentProfile || currentProfile.role!=='usuario'){alert('Esta agenda es para clientes.');return location.href='home.html';}
  renderServices(); renderPrice();
  const today=new Date(); const min=dateKey(today); $('booking-date').min=min;
  await loadBarbers();
  const preset=new URLSearchParams(location.search).get('barber');
  if(preset){const btn=document.querySelector(`[data-barber="${preset}"]`);if(btn)btn.click();}
});
