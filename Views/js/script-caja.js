import {auth,db,onAuthStateChanged,collection,doc,getDoc,runTransaction,getCurrentProfile,escapeHtml,money,serverTimestamp} from './firebase-core.js';
const $=id=>document.getElementById(id);
let profile=null;

function showCita(cita){
  const desc=cita.descuentoPct?`<p><strong>DESCUENTO</strong><br>${cita.descuentoPct}% (${escapeHtml(cita.descuentoCodigo||'')}) · subtotal ${money(cita.subtotal)}</p>`:'';
  $('cash-result').innerHTML=`<div class="cash-box"><p><strong>CLIENTE</strong><br>${escapeHtml(cita.cliente||'CLIENTE')}</p><p><strong>SERVICIO</strong><br>${escapeHtml(cita.servicio||'')}</p>${desc}<p><strong>TOTAL EN EFECTIVO</strong><br>${money(cita.total)}</p><p><strong>ESTADO CITA</strong><br>${escapeHtml(cita.estado||'')}</p><button id="btn-redeem" class="btn-primary">CONFIRMAR PAGO / CANJEAR</button></div>`;
  $('btn-redeem').onclick=()=>redeem(cita);
}

async function lookup(){
  const code=$('cash-code').value.trim().toUpperCase();
  if(code.length!==5){$('cash-result').textContent='EL RADICADO DEBE TENER 5 CARACTERES.';return;}
  try{
    const r=await getDoc(doc(db,'radicados',code));
    if(!r.exists()){$('cash-result').textContent='RADICADO NO ENCONTRADO.';return;}
    const rad=r.data();
    if(rad.estado!=='activo'){$('cash-result').textContent='ESTE RADICADO YA FUE UTILIZADO O ESTÁ INACTIVO.';return;}
    const c=await getDoc(doc(db,'citas',rad.citaId));
    if(!c.exists()){$('cash-result').textContent='LA CITA ASOCIADA YA NO EXISTE.';return;}
    showCita({id:c.id,...c.data(),radicado:code});
  }catch(e){
    console.error(e);
    // Las reglas solo dejan a un barbero leer los radicados de sus propias citas.
    $('cash-result').textContent=profile?.role==='barbero'?'RADICADO NO ENCONTRADO O NO CORRESPONDE A UNA DE TUS CITAS.':'NO SE PUDO CONSULTAR EL RADICADO.';
  }
}

async function redeem(cita){
  const code=cita.radicado;
  const radRef=doc(db,'radicados',code), citaRef=doc(db,'citas',cita.id), txRef=doc(db,'transacciones',cita.id), cobroRef=doc(db,'cobros',cita.id);
  const me=auth.currentUser.uid;
  try{
    await runTransaction(db,async tx=>{
      const rad=await tx.get(radRef);const c=await tx.get(citaRef);
      if(!rad.exists()||rad.data().estado!=='activo')throw new Error('El radicado ya no está disponible.');
      if(!c.exists())throw new Error('La cita no existe.');
      const d=c.data();
      if(profile.role==='barbero'&&d.barberoId!==me)throw new Error('Esta cita pertenece a otro barbero.');
      if(!['reservada','trabajando'].includes(d.estado))throw new Error('La cita no puede cobrarse en este estado.');
      const finalState=d.estado==='trabajando'?'finalizada':'recibida';
      tx.update(radRef,{estado:'usado',usedAt:serverTimestamp(),usedBy:me});
      tx.set(txRef,{citaId:cita.id,radicado:code,metodo:'efectivo',total:d.total||0,estado:'Pago realizado con éxito',processedBy:me,createdAt:serverTimestamp()});
      tx.update(citaRef,{estado:finalState,estadoPago:'pagado',paidAt:serverTimestamp(),updatedAt:serverTimestamp()});
      // Aviso para el admin: qué barbero cobró qué servicio.
      if(profile.role==='barbero'){
        tx.set(cobroRef,{
          citaId:cita.id,radicado:code,metodo:'efectivo',
          cobradoPor:me,barbero:profile.username||auth.currentUser.email?.split('@')[0]||'BARBERO',
          cliente:d.cliente||'CLIENTE',servicio:d.servicio||'',
          subtotal:d.subtotal??d.total??0,descuentoPct:d.descuentoPct||0,total:d.total||0,
          leido:false,createdAt:serverTimestamp()
        });
      }
    });
    $('cash-result').innerHTML='<div class="success-box"><strong>✓ PAGO REALIZADO CON ÉXITO</strong><p>El radicado quedó inutilizado y la cita fue actualizada.'+(profile.role==='barbero'?' El administrador fue notificado del cobro.':'')+'</p></div>';
    $('cash-code').value='';
  }catch(e){console.error(e);$('cash-result').textContent=e.message||'No se pudo canjear el radicado.';}
}

$('lookup-btn').addEventListener('click',lookup);
$('cash-code').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();lookup();}});
onAuthStateChanged(auth,async user=>{
  if(!user)return location.href='login.html';
  profile=await getCurrentProfile(user);
  const ok=profile&&(['dueno','admin'].includes(profile.role)||(profile.role==='barbero'&&profile.status==='approved'));
  if(!ok){alert('No tienes acceso a Caja.');return location.href='home.html';}
  $('back-link').href=profile.role==='barbero'?'/Views/dashboard-barbero.html':'/Views/dashboard-admin.html';
});
