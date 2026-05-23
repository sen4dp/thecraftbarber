// js/auth.js
import { auth } from './firebase-config.js';
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword,
    sendEmailVerification,
    sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

// Registrar usuario
export async function registerUser(email, password) {
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        // Opcional: Enviar correo de verificación
        await sendEmailVerification(userCredential.user);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Iniciar sesión
export async function loginUser(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        return { success: true, user: userCredential.user };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Restablecer contraseña
export async function resetPassword(email) {
    try {
        await sendPasswordResetEmail(auth, email);
        return { success: true, message: "Correo de restablecimiento enviado" };
    } catch (error) {
        return { success: false, error: error.message };
    }
}