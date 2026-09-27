# Hotel Yaluma: sitio web

Sitio para Hotel Yaluma (provincia Duarte, República Dominicana), en español primero, con un botón para cambiar a inglés.

- **Dos tipos de reserva:** por noche, o pase de 4 horas (descanso sin pasar la noche) eligiendo el día y la hora de entrada.
- **Reservas sin servidor:** el huésped elige fechas, huéspedes y habitación, escribe sus datos y ve el total. Al confirmar, se abre WhatsApp con la solicitud ya escrita (en español) para el número del hotel. El hotel confirma respondiendo por WhatsApp.
- **Pago en efectivo al llegar:** no se cobra nada en línea.
- **Sin dependencias:** HTML, CSS y JavaScript simples. No hay que compilar nada.

## Editar precios, habitaciones y datos

Todo está en **`config.js`**. Las líneas marcadas con `EDITAR` son valores de ejemplo que hay que confirmar:

- precios por noche de cada habitación (`price`)
- precio del pase de 4 horas de cada habitación (`passPrice`; ponga `null` si esa habitación no se ofrece por horas)
- horario de los pases (`pass.firstStart` y `pass.lastStart`: primera y última hora de entrada, en formato de 24 horas)
- cantidad y tipos de habitación (copie un bloque `{ ... }` para añadir otra)
- horario de entrada y salida
- `acceptsCards`: `true` si también aceptan tarjeta en recepción
- servicios que se muestran (`amenities`)

## Fotos

Las fotos de `img/` salieron de capturas de pantalla de Google, así que tienen poca resolución. Reemplácelas con fotos originales del teléfono, usando los mismos nombres:

| Archivo | Dónde se usa |
| --- | --- |
| `img/fachada.jpg` | portada (computadora), galería |
| `img/letrero.jpg` | portada (celular), galería |
| `img/habitacion.jpg` | tarjetas de habitaciones, galería |

Para usar una foto distinta en cada habitación, cambie `image` en `config.js`.

## Verlo en la computadora

```bash
cd hotel-yaluma
python3 -m http.server 8000   # abrir http://localhost:8000
```

## Publicarlo

Es un sitio estático: sirve en cualquier hosting gratuito (Netlify, Cloudflare Pages, GitHub Pages). Suba la carpeta `hotel-yaluma/` completa.
