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
  currency: "RD$",
  acceptsCards: false, // EDITAR: true si también aceptan tarjeta en recepción.

  // Pase por horas (descanso sin pasar la noche).
  pass: {
    hours: 4,
    firstStart: 8, // EDITAR: primera hora de entrada (8 = 8:00 AM)
    lastStart: 22, // EDITAR: última hora de entrada (22 = 10:00 PM)
  },

  // Habitaciones. price = precio por noche en pesos dominicanos.
  rooms: [
    {
      id: "estandar",
      price: 2000, // EDITAR: precio por noche
      passPrice: 800, // EDITAR: precio del pase de 4 horas (null si no aplica)
      maxGuests: 2,
      image: "img/habitacion.jpg",
      name: { es: "Habitación Estándar", en: "Standard Room" },
      bed: { es: "1 cama matrimonial", en: "1 double bed" },
      description: {
        es: "Cómoda, limpia y fresca. Ideal para parejas o viajeros de trabajo.",
        en: "Comfortable, clean and cool. Ideal for couples or business travelers.",
      },
      features: ["ac", "wifi", "tv", "bath"],
    },
    {
      id: "doble",
      price: 2800, // EDITAR: precio por noche
      passPrice: 1000, // EDITAR: precio del pase de 4 horas (null si no aplica)
      maxGuests: 4,
      image: "img/habitacion.jpg", // EDITAR: foto propia de esta habitación
      name: { es: "Habitación Doble", en: "Double Room" },
      bed: { es: "2 camas", en: "2 beds" },
      description: {
        es: "Más espacio para familias o amigos que viajan juntos.",
        en: "More room for families or friends traveling together.",
      },
      features: ["ac", "wifi", "tv", "bath"],
    },
  ],

  // Servicios que se muestran en la sección "Servicios". EDITAR: quitar lo que no aplique.
  amenities: ["ac", "wifi", "tv", "parking", "bath", "security"],
};
