// ============================================================
// THE CRAFT BARBER - Núcleo Firebase compartido
// Compatible con Firebase Web SDK 10.x / Spark
// ============================================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp, runTransaction, writeBatch
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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

export {
  app, auth, db, onAuthStateChanged, signOut,
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, Timestamp,
  runTransaction, writeBatch
};

export const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[c]));

// ------------------------------------------------------------
// Catálogo de servicios (precio fijo). Si cambias un precio aquí,
// cámbialo también en Models/firestore.rules (función priceFor).
// ------------------------------------------------------------
export const SERVICES = [
  { id:'general',                 nombre:'General',                     precio:18000 },
  { id:'barberia',                nombre:'Barbería',                    precio:10000 },
  { id:'general-diseno',          nombre:'General + Diseño',            precio:20000 },
  { id:'general-barberia',        nombre:'General + Barbería',          precio:28000 },
  { id:'general-diseno-barberia', nombre:'General + Diseño + Barbería', precio:30000 }
];
export const servicePrice = nombre => SERVICES.find(x => x.nombre === nombre)?.precio ?? 0;
export const discountedTotal = (subtotal, pct) => Math.round(subtotal * (100 - pct) / 100);

// Número seguro: úsalo con TODO dato que venga de documentos escritos por clientes (evita XSS).
export const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);

// Código aleatorio criptográfico de n caracteres (sin 0/O/1/I).
export function randomCode(n = 5) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = new Uint32Array(n); crypto.getRandomValues(buf);
  return Array.from(buf, x => chars[x % chars.length]).join('');
}

export function isOwner(profile) {
  return profile?.role === 'dueno' || profile?.role === 'admin';
}

export function isBarber(profile) {
  return profile?.role === 'barbero' && profile?.status === 'approved';
}

export function money(value) {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency', currency: 'COP', maximumFractionDigits: 0
  }).format(Number(value) || 0);
}

export function parseAppointmentDate(cita) {
  if (!cita?.fecha) return null;
  const date = String(cita.fecha).trim();
  const time = String(cita.hora || '00:00').trim();
  let result = new Date(`${date}T${time}`);
  if (!Number.isNaN(result.getTime())) return result;
  const match = date.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const [hh, min] = time.split(':').map(Number);
  result = new Date(Number(yyyy), Number(mm)-1, Number(dd), hh || 0, min || 0);
  return Number.isNaN(result.getTime()) ? null : result;
}

// Festivos colombianos: domingos + Ley Emiliani + Semana Santa.
function easterDate(year) {
  const a=year%19, b=Math.floor(year/100), c=year%100, d=Math.floor(b/4), e=b%4;
  const f=Math.floor((b+8)/25), g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30, i=Math.floor(c/4), k=c%4;
  const l=(32+2*e+2*i-h-k)%7, m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31), day=((h+l-7*m+114)%31)+1;
  return new Date(year, month-1, day);
}
function mondayAfter(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate()+days);
  while (d.getDay() !== 1) d.setDate(d.getDate()+1);
  return d;
}
function keyDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
export function isColombiaHoliday(date) {
  const y = date.getFullYear();
  const H = new Set();
  const add = d => H.add(keyDate(d));
  // Fijos (NO se trasladan al lunes)
  [[1,1],[5,1],[7,20],[8,7],[12,8],[12,25]].forEach(([m,d]) => add(new Date(y,m-1,d)));
  // Ley Emiliani: se pasan al lunes siguiente (incluye Reyes, 6 ene)
  [[1,6],[3,19],[6,29],[8,15],[10,12],[11,1],[11,11]].forEach(([m,d]) => add(mondayAfter(new Date(y,m-1,d),0)));
  // Semana Santa: jueves y viernes santo (el Lunes de Pascua NO es festivo)
  const e = easterDate(y), off = n => { const x = new Date(e); x.setDate(x.getDate()+n); return x; };
  add(off(-3)); add(off(-2));
  // Móviles al lunes: Ascensión (+39), Corpus Christi (+60), Sagrado Corazón (+68)
  [39,60,68].forEach(n => add(mondayAfter(off(n),0)));
  return H.has(keyDate(date));
}

export function scheduleForDate(date) {
  const closedEarly = date.getDay() === 0 || isColombiaHoliday(date);
  const start = 8;
  const end = closedEarly ? 16 : 22;
  const slots = [];
  for (let hour=start; hour<end; hour++) slots.push(`${String(hour).padStart(2,'0')}:00`);
  return slots;
}

export async function getCurrentProfile(user) {
  const snap = await getDoc(doc(db,'users',user.uid));
  return snap.exists() ? { id:snap.id, ...snap.data() } : null;
}

// Comprime la imagen para que cada documento de Firestore quede por debajo del límite práctico.
export function compressImage(file, maxSide=1000, quality=.72) {
  return new Promise((resolve,reject) => {
    if (!file?.type?.startsWith('image/')) return reject(new Error('Solo se permiten imágenes.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('No se pudo leer la imagen.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Imagen inválida.'));
      img.onload = () => {
        const scale = Math.min(1, maxSide / Math.max(img.width,img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(img.width*scale));
        canvas.height = Math.max(1, Math.round(img.height*scale));
        canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg',quality);
        if (dataUrl.length > 850000) return resolve(compressImage(file,800,.58));
        resolve(dataUrl);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
