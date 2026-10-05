# Hotel Yaluma: sitio web

Sitio para Hotel Yaluma (provincia Duarte, República Dominicana), en español primero, con un botón para cambiar a inglés.

- **Dos tipos de reserva:** por noche, o paso de 4 horas (descanso sin pasar la noche) eligiendo el día y la hora de entrada.
- **Reservas sin servidor:** el huésped elige fechas, huéspedes y habitación, escribe sus datos y ve el total. Al confirmar, se abre WhatsApp con la solicitud ya escrita (en español) para el número del hotel. El hotel confirma respondiendo por WhatsApp.
- **Pago en efectivo al llegar:** no se cobra nada en línea.
- **Panel del personal** en `/admin/`: tablero de las 19 habitaciones por colores (12 Estándar, 6 Premium y 1 Deluxe), reservas, turnos, efectivo cobrado por turno y cuentas para el personal.
- **Sin compilar nada:** HTML, CSS y JavaScript simples.

## Panel del personal (`/admin/`)

Ábralo en `https://su-sitio/admin/`. Funciona en el teléfono y en la computadora.

| Sección | Para qué sirve |
| --- | --- |
| **Habitaciones** | Los 19 cuadros por colores. Toque uno para registrar una entrada (paso o noche), la salida, extender, marcar limpieza o fuera de servicio. Arriba: libres, ocupadas, efectivo cobrado hoy, y alertas de tiempo vencido y solicitudes nuevas. |
| **Reservas** | Solicitudes del sitio web (Pendientes), reservas confirmadas (Próximas), En curso e Historial. Confirmar o rechazar abre un mensaje de WhatsApp ya escrito para el huésped. "Nueva reserva" sirve para las que llegan por teléfono. |
| **Turnos** | Iniciar y terminar turno, quién está trabajando ahora, y horas y efectivo cobrado por turno (7 días). |
| **Equipo** | Crear cuentas, activar o desactivar, cambiar roles, cambiar la contraseña propia, y el historial de actividad (quién hizo qué y cuándo). |

Colores del tablero: **verde** libre · **naranja** ocupada por noche · **morado** paso por horas · **azul** reservada, llega hoy · **amarillo** limpieza · **gris** fuera de servicio · **borde rojo** tiempo vencido.

### Modo demostración

Mientras `supabase` esté vacío en `config.js`, el panel usa datos de ejemplo guardados solo en ese navegador. Usuarios: `lg` y `fg` (administradores), `luis` y `fanny` (personal). La primera vez que alguien entra con su usuario elige su contraseña; desde ahí se pide siempre. Las contraseñas no están en el código: se guardan cifradas (PBKDF2) solo en ese navegador.

Sirve para probarlo, **no** para usarlo de verdad: cada teléfono tiene sus propios datos, y quien tenga el enlace puede entrar en su propio navegador con cualquiera de esos usuarios (con datos de ejemplo, no los del hotel). La seguridad real llega con Supabase.

### Conectarlo de verdad (Supabase, gratis, unos 15 minutos)

1. Cree una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo (región: *East US*).
2. En **SQL Editor**, pegue todo `supabase/schema.sql` y presione **Run**. Crea las tablas, las 19 habitaciones y los permisos.
3. En **Authentication → Sign In / Providers → Email**, **desactive "Confirm email"**. El personal entra con usuario y contraseña, sin correo.
4. En **Project Settings → API**, copie la *Project URL* y la clave *anon public* dentro de `supabase` en `config.js`.
5. Cree la primera cuenta de administrador enseguida (la primera cuenta que exista queda como administrador): en **Authentication → Users → Add user → Create new user**, correo `lg@personal.hotelyaluma.com`, su contraseña, y marque *Auto Confirm User*. El usuario para entrar será `lg`. Para el nombre que muestra el panel, ejecute en **SQL Editor**: `update profiles set name = 'LG' where username = 'lg';`
6. Entre al panel como `lg`, vaya a **Equipo → Crear cuenta** y cree `fg` (rol Administrador), `luis` y `fanny` (rol Personal).

Use contraseñas que no sean fechas de nacimiento ni se usen en otros sitios. Nunca las escriba en `config.js` ni en otro archivo del sitio.

La clave *anon public* puede estar en la página: los permisos de la base de datos solo dejan que el público **envíe** solicitudes; no puede leer nada. Las cuentas nuevas no ven nada hasta que el administrador las active.

Si alguien olvida su contraseña (los correos del personal no existen, así que no sirve "recuperar contraseña"), el administrador la cambia en **SQL Editor**, poniendo el usuario y la nueva contraseña:

```sql
update auth.users set encrypted_password = extensions.crypt('NuevaClave123', extensions.gen_salt('bf'))
where email = 'luis@personal.hotelyaluma.com';
```

## Editar precios, habitaciones y datos

Todo está en **`config.js`**. Las líneas marcadas con `EDITAR` son valores de ejemplo que hay que confirmar:

- precios por noche de cada habitación (`price`)
- precio del paso de 4 horas de cada habitación (`passPrice`; ponga `null` si esa habitación no se ofrece por horas)
- horario de los pasos (`pass.firstStart` y `pass.lastStart`: primera y última hora de entrada, en formato de 24 horas)
- tipos de habitación y sus números (`numbers`). Si cambia los números, cámbielos también en `supabase/schema.sql`
- horario de entrada y salida
- `acceptsCards`: `true` si también aceptan tarjeta en recepción
- servicios que se muestran (`amenities`)

## Fotos

Las fotos de `img/` salieron de capturas de pantalla de Google, así que tienen poca resolución. Reemplácelas con fotos originales del teléfono, usando los mismos nombres:

| Archivo | Dónde se usa |
| --- | --- |
| `img/fachada.jpg` | portada (computadora), galería |
| `img/letrero.jpg` | portada (celular), galería |
| `img/habitacion.jpg` | galería |
| `img/estandar.svg`, `img/premium.svg`, `img/deluxe.svg` | tarjetas de habitaciones (imágenes provisionales: cambie `image` en `config.js` por la foto real, ej. `img/premium.jpg`) |


## Verlo en la computadora

```bash
cd hotel-yaluma
python3 -m http.server 8000   # abrir http://localhost:8000
```

## Publicarlo

Es un sitio estático: sirve en cualquier hosting gratuito (Netlify, Cloudflare Pages, GitHub Pages). Suba la carpeta `hotel-yaluma/` completa.
