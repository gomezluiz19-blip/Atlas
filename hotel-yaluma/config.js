/*
 * Hotel Yaluma: datos del hotel.
 *
 * Este es el ÚNICO archivo que hace falta editar para cambiar precios,
 * habitaciones, teléfono u horarios. Las líneas marcadas con "EDITAR"
 * son valores de ejemplo que hay que confirmar.
 */
window.HOTEL = {
  name: "Hotel Yaluma",

  // Número de WhatsApp / teléfono, solo dígitos con código de país (1 = RD).
  whatsapp: "18296551435",
  phoneDisplay: "829-655-1435",
  email: "", // EDITAR: correo del hotel (opcional). Si está vacío no se muestra.

  address: "Calle Fredy Rojas N/A, Duarte 31000, República Dominicana",
  mapsQuery: "Hotel Yaluma, Calle Fredy Rojas, Duarte, República Dominicana",

  // Calificación pública en Google.
  googleRating: 5.0,
  googleReviews: 3,

  checkIn: "3:00 PM", // EDITAR
  checkOut: "12:00 PM", // EDITAR
  checkOutHour: 12, // la misma hora de salida, en formato de 24 horas (para el panel)
  currency: "RD$",
  acceptsCards: false, // EDITAR: true si también aceptan tarjeta en recepción.

  // Pase por horas (descanso sin pasar la noche).
  pass: {
    hours: 4,
    firstStart: 8, // EDITAR: primera hora de entrada (8 = 8:00 AM)
    lastStart: 22, // EDITAR: última hora de entrada (22 = 10:00 PM)
  },

  // Tipos de habitación, de menor a mayor precio.
  // price = precio por noche y passPrice = precio del paso de 4 horas, en pesos dominicanos (RD$).
  // passPrice: null = esa habitación se cobra solo por noche.
  // numbers = números de las habitaciones de ese tipo (se usan en el panel del personal).
  rooms: [
    {
      id: "estandar",
      short: "REG",
      price: 1000, // "Amanecida" en la lista de precios
      passPrice: 500, // "Pasos (máximo 4 horas)"
      maxGuests: 2, // EDITAR
      floor: 2,
      numbers: ["8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "19"],
      image: "img/estandar.svg", // EDITAR: foto real de una habitación estándar
      name: { es: "Habitación Regular", en: "Regular Room" },
      bed: { es: "Segundo nivel", en: "Second floor" },
      description: {
        es: "Compacta y acogedora, con todo lo necesario para descansar.",
        en: "Compact and cozy, with everything you need to rest.",
      },
      features: ["ac", "wifi", "tv", "bath"],
    },
    {
      id: "premium",
      short: "PREM 1Q",
      price: 1200, // "Amanecida" en la lista de precios
      passPrice: 700, // "Pasos (máximo 4 horas)"
      maxGuests: 2,
      floor: 1,
      numbers: ["1", "2", "3", "4"],
      image: "img/premium.svg", // EDITAR: foto real
      name: { es: "Premium · 1 cama queen", en: "Premium · 1 queen bed" },
      bed: { es: "Primer nivel", en: "First floor" },
      description: {
        es: "Más amplia, con una cama queen y sofá para relajarse.",
        en: "More spacious, with one queen bed and a sofa to relax.",
      },
      features: ["queen", "ac", "wifi", "tv", "bath", "sofa"],
    },
    {
      id: "premium2",
      short: "PREM 2Q",
      price: 2500, // "Amanecida" en la lista de precios
      passPrice: null, // pasos: confirmar si esta habitación los ofrece
      maxGuests: 4,
      floor: 1,
      numbers: ["5", "6", "7"],
      image: "img/premium.svg", // EDITAR: foto real
      name: { es: "Premium · 2 camas queen", en: "Premium · 2 queen beds" },
      bed: { es: "Primer nivel", en: "First floor" },
      description: {
        es: "Más amplia, con dos camas queen y sofá. Ideal para familias.",
        en: "More spacious, with two queen beds and a sofa. Great for families.",
      },
      features: ["queen2", "ac", "wifi", "tv", "bath", "sofa"],
    },
  ],

  // Servicios que se muestran en la sección "Servicios". EDITAR: quitar lo que no aplique.
  amenities: ["ac", "wifi", "tv", "parking", "bath", "crib", "security"],

  // Base de datos para las reservas y el panel del personal (Supabase, gratis).
  // Mientras esté vacío, el panel funciona en MODO DEMOSTRACIÓN: los datos se
  // guardan solo en el navegador. Ver README.md para configurarlo.
  supabase: {
    url: "", // ej.: "https://abcdefgh.supabase.co"
    anonKey: "", // la clave "anon public" del proyecto
  },
  // Los usuarios del personal entran con un nombre de usuario (luis, fanny...).
  // Por dentro se convierte en un correo con este dominio. No se envían correos.
  staffEmailDomain: "personal.hotelyaluma.com",
};
