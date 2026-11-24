# Reiniciar la base de datos de The Craft Barber (proyecto `the-craftbarber`)

> ⚠️ Esto BORRA todo: usuarios, citas, productos, pedidos, radicados. No se puede deshacer.
> El plan Spark no ofrece exportación/copia gestionada: si necesitas conservar algo, cópialo a mano antes.

## 0. Requisitos (una sola vez)
```
npm install -g firebase-tools
firebase login
cd Models            # aquí están firebase.json y .firebaserc
firebase use the-craftbarber
```

## 1. Borrar Firestore (todas las colecciones)
```
firebase firestore:delete --all-collections --force --project the-craftbarber
```

## 2. Borrar los usuarios de Authentication
Consola de Firebase → Authentication → Users → marca todos (casilla de la cabecera) → Delete account.
(Hazlo SIEMPRE junto con el paso 1: si quedan usuarios de Auth sin perfil, el login dirá «Tu perfil de aplicación no existe».)

## 3. Publicar las reglas nuevas
```
firebase deploy --only firestore:rules
```

## 4. Crear de nuevo al Dueño
1. Abre `/Views/register.html` y regístrate como USUARIO con el correo del dueño.
2. Consola de Firebase → Firestore → colección `users` → documento con ese UID → cambia
   `role` a `dueno` y `status` a `approved`.
3. Inicia sesión en `/Views/login.html` con la opción DUEÑO.

## 5. Probar con tres cuentas
- Cliente: ver barberos, elegir hora, reservar, cancelar y volver a reservar la misma hora, usar un código de descuento dos veces (la segunda debe fallar).
- Barbero (regístralo y apruébalo desde el panel del Dueño): empezar, finalizar, cobrar un radicado en Caja, cancelar.
- Dueño: informes, eliminar barbero, tienda.
