/* Hotel Yaluma: sitio y sistema de reservas (sin servidor).
 *
 * La reserva se arma en el navegador y se envía al hotel por WhatsApp.
 * El pago es en efectivo al llegar, así que no se procesa ningún pago aquí.
 */
(() => {
  "use strict";

  const H = window.HOTEL;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  // ---------------------------------------------------------------- textos
  const PH = H.pass.hours;
  const STRINGS = {
    es: {
      skip: "Saltar al contenido",
      "nav.rooms": "Habitaciones", "nav.amenities": "Servicios", "nav.how": "Cómo reservar", "nav.location": "Ubicación",
      "cta.book": "Reservar", "cta.bookNow": "Reservar ahora",
      "hero.alt": "Hotel Yaluma al atardecer",
      "hero.eyebrow": "Provincia Duarte · República Dominicana",
      "hero.title": "Descanse tranquilo, <em>como en casa.</em>",
      "hero.lead": "Habitaciones limpias y frescas, atención familiar y estacionamiento privado. Reserve en minutos y pague al llegar.",
      rating: (r, n) => `${r.toFixed(1)} en Google · ${n} ${n === 1 ? "reseña" : "reseñas"}`,
      "quick.label": "Buscar disponibilidad", "quick.checkin": "Llegada", "quick.checkout": "Salida", "quick.guests": "Huéspedes",
      "quick.pick": "Elegir fecha", "quick.go": "Ver disponibilidad",
      "q.date": "Fecha", "q.time": "Hora", "q.pickTime": "Elegir hora", until: "hasta",
      "stay.label": "Tipo de estadía", "stay.night": "Por noche", "stay.nightSub": "Pase la noche",
      "stay.pass": `Pase de ${PH} horas`, "stay.passSub": "Descanso sin pasar la noche",
      "stay.pickTime": "¿A qué hora llega?", passUnit: "1 pase", perPass: "por pase", noPass: "No disponible por horas",
      pickDay: "Elija el día", pickTime: "Ahora elija la hora",
      "sum.type": "Tipo", "sum.date": "Fecha", "sum.time": "Horario",
      "cash.title": "Sin tarjeta, sin pagos por adelantado.", "cash.text": "Usted reserva aquí y paga en efectivo cuando llega al hotel.",
      "rooms.kicker": "Habitaciones", "rooms.title": "Elija su habitación", "rooms.sub": `Todas con aire acondicionado, WiFi, TV y baño privado. Por noche o con pase de ${PH} horas.`,
      "rooms.upTo": (n) => `Hasta ${n} personas`, "rooms.night": "/ noche", "rooms.book": "Reservar",
      "gallery.label": "Fotos", "gallery.sign": "Letrero iluminado del Hotel Yaluma", "gallery.room": "Habitación con cama, TV y aire acondicionado", "gallery.front": "Entrada y estacionamiento del hotel",
      "amen.kicker": "Servicios", "amen.title": "Todo lo necesario para descansar",
      "a.ac": "Aire acondicionado", "a.wifi": "WiFi gratis", "a.tv": "TV por cable", "a.parking": "Estacionamiento privado", "a.bath": "Baño privado", "a.security": "Ambiente seguro y tranquilo", "a.sofa": "Sofá",
      "rooms.count": (n) => `${n} habitaciones`,
      "how.kicker": "Cómo reservar", "how.title": "Reservar es fácil",
      "how.1t": "Elija fechas y habitación", "how.1p": "Vea el precio total al instante, sin sorpresas.",
      "how.2t": "Envíe su solicitud", "how.2p": "Le llega a nuestro WhatsApp con todos los detalles.",
      "how.3t": "Le confirmamos", "how.3p": "Respondemos por WhatsApp para confirmar su reserva.",
      "how.4t": "Pague al llegar", "how.4p": "En efectivo, en la recepción del hotel.",
      "loc.kicker": "Ubicación", "loc.title": "Cómo llegar", "loc.directions": "Cómo llegar",
      hours: (i, o) => `Entrada desde las ${i} · Salida hasta las ${o}`,
      "sheet.dates": "Fechas y huéspedes", "sheet.room": "Habitación", "sheet.details": "Sus datos", "sheet.review": "Confirmar reserva", "sheet.sent": "Reserva",
      back: "Atrás", close: "Cerrar",
      "g.adults": "Adultos", "g.adultsSub": "13 años o más", "g.kids": "Niños", "g.kidsSub": "0 a 12 años",
      adults: (n) => `${n} ${n === 1 ? "adulto" : "adultos"}`, kids: (n) => `${n} ${n === 1 ? "niño" : "niños"}`,
      nights: (n) => `${n} ${n === 1 ? "noche" : "noches"}`,
      "next.dates": "Continuar", "next.room": "Continuar", "next.details": "Revisar", "next.review": "Enviar por WhatsApp", "next.sent": "Listo",
      pickIn: "Elija su fecha de llegada", pickOut: "Ahora elija la salida",
      roomHint: (g, n, a, b) => `${g} · ${n} · ${a} – ${b}`,
      tooSmall: (n) => `Máximo ${n} personas`,
      total: "Total estimado", perNight: "por noche", payAtHotel: "Se paga al llegar",
      "f.name": "Nombre completo", "f.nameErr": "Escriba su nombre.",
      "f.phone": "Teléfono / WhatsApp", "f.phoneErr": "Escriba un número válido.",
      "f.email": "Correo electrónico", "f.optional": "(opcional)", "f.emailErr": "Revise el correo.",
      "f.arrival": "Hora estimada de llegada", "f.notes": "Comentarios", "f.notesPh": "Ej.: llegamos tarde, necesitamos una cuna…",
      arrivalUnknown: "Todavía no sé", arrivalLate: "Después de medianoche",
      "pay.title": "Pago al llegar",
      payText: (cards) => cards
        ? "No cobramos nada por adelantado. Pague en efectivo o con tarjeta en la recepción."
        : "No cobramos nada por adelantado. Pague en efectivo en la recepción.",
      "sum.code": "Código", "sum.in": "Llegada", "sum.out": "Salida", "sum.guests": "Huéspedes", "sum.name": "Nombre", "sum.phone": "Teléfono", "sum.arrival": "Hora de llegada", "sum.notes": "Comentarios",
      "sum.calc": (p, n) => `${p} × ${n}`,
      "rev.note": "Al tocar el botón se abre WhatsApp con su solicitud lista para enviar. Su reserva queda confirmada cuando le respondamos.",
      "sent.title": "¡Solicitud lista!", "sent.text": "Si WhatsApp no se abrió, llámenos o escríbanos con su código de reserva:",
      "sent.again": "Abrir WhatsApp otra vez", "sent.call": "Llamar",
      waHello: "Hola, me gustaría información sobre el Hotel Yaluma.",
      langBtn: "EN", langLabel: "Change language to English", staff: "Acceso del personal",
    },
    en: {
      skip: "Skip to content",
      "nav.rooms": "Rooms", "nav.amenities": "Amenities", "nav.how": "How to book", "nav.location": "Location",
      "cta.book": "Book", "cta.bookNow": "Book now",
      "hero.alt": "Hotel Yaluma at sunset",
      "hero.eyebrow": "Duarte Province · Dominican Republic",
      "hero.title": "Rest easy, <em>feel at home.</em>",
      "hero.lead": "Clean, cool rooms, family service and private parking. Book in minutes and pay when you arrive.",
      rating: (r, n) => `${r.toFixed(1)} on Google · ${n} ${n === 1 ? "review" : "reviews"}`,
      "quick.label": "Check availability", "quick.checkin": "Check-in", "quick.checkout": "Check-out", "quick.guests": "Guests",
      "quick.pick": "Pick a date", "quick.go": "Check availability",
      "q.date": "Date", "q.time": "Time", "q.pickTime": "Pick a time", until: "until",
      "stay.label": "Type of stay", "stay.night": "Overnight", "stay.nightSub": "Stay the night",
      "stay.pass": `${PH}-hour pass`, "stay.passSub": "Rest without staying the night",
      "stay.pickTime": "What time will you arrive?", passUnit: "1 pass", perPass: "per pass", noPass: "Not available by the hour",
      pickDay: "Choose the day", pickTime: "Now choose the time",
      "sum.type": "Type", "sum.date": "Date", "sum.time": "Time",
      "cash.title": "No card, no prepayment.", "cash.text": "Book here and pay in cash when you arrive at the hotel.",
      "rooms.kicker": "Rooms", "rooms.title": "Choose your room", "rooms.sub": `All with air conditioning, WiFi, TV and private bathroom. Overnight or with a ${PH}-hour pass.`,
      "rooms.upTo": (n) => `Up to ${n} guests`, "rooms.night": "/ night", "rooms.book": "Book",
      "gallery.label": "Photos", "gallery.sign": "Hotel Yaluma illuminated sign", "gallery.room": "Room with bed, TV and air conditioning", "gallery.front": "Hotel entrance and parking",
      "amen.kicker": "Amenities", "amen.title": "Everything you need to rest",
      "a.ac": "Air conditioning", "a.wifi": "Free WiFi", "a.tv": "Cable TV", "a.parking": "Private parking", "a.bath": "Private bathroom", "a.security": "Safe, quiet setting", "a.sofa": "Sofa",
      "rooms.count": (n) => `${n} rooms`,
      "how.kicker": "How to book", "how.title": "Booking is easy",
      "how.1t": "Pick dates and a room", "how.1p": "See the full price right away, no surprises.",
      "how.2t": "Send your request", "how.2p": "It reaches our WhatsApp with every detail.",
      "how.3t": "We confirm", "how.3p": "We reply on WhatsApp to confirm your booking.",
      "how.4t": "Pay on arrival", "how.4p": "In cash, at the hotel front desk.",
      "loc.kicker": "Location", "loc.title": "Getting here", "loc.directions": "Get directions",
      hours: (i, o) => `Check-in from ${i} · Check-out by ${o}`,
      "sheet.dates": "Dates and guests", "sheet.room": "Room", "sheet.details": "Your details", "sheet.review": "Confirm booking", "sheet.sent": "Booking",
      back: "Back", close: "Close",
      "g.adults": "Adults", "g.adultsSub": "Age 13 or older", "g.kids": "Children", "g.kidsSub": "Age 0 to 12",
      adults: (n) => `${n} ${n === 1 ? "adult" : "adults"}`, kids: (n) => `${n} ${n === 1 ? "child" : "children"}`,
      nights: (n) => `${n} ${n === 1 ? "night" : "nights"}`,
      "next.dates": "Continue", "next.room": "Continue", "next.details": "Review", "next.review": "Send via WhatsApp", "next.sent": "Done",
      pickIn: "Choose your check-in date", pickOut: "Now choose check-out",
      roomHint: (g, n, a, b) => `${g} · ${n} · ${a} – ${b}`,
      tooSmall: (n) => `Max ${n} guests`,
      total: "Estimated total", perNight: "per night", payAtHotel: "Paid on arrival",
      "f.name": "Full name", "f.nameErr": "Please enter your name.",
      "f.phone": "Phone / WhatsApp", "f.phoneErr": "Please enter a valid number.",
      "f.email": "Email", "f.optional": "(optional)", "f.emailErr": "Please check the email.",
      "f.arrival": "Estimated arrival time", "f.notes": "Comments", "f.notesPh": "E.g. arriving late, need a crib…",
      arrivalUnknown: "Not sure yet", arrivalLate: "After midnight",
      "pay.title": "Pay on arrival",
      payText: (cards) => cards
        ? "Nothing is charged in advance. Pay in cash or by card at the front desk."
        : "Nothing is charged in advance. Pay in cash at the front desk.",
      "sum.code": "Code", "sum.in": "Check-in", "sum.out": "Check-out", "sum.guests": "Guests", "sum.name": "Name", "sum.phone": "Phone", "sum.arrival": "Arrival time", "sum.notes": "Comments",
      "sum.calc": (p, n) => `${p} × ${n}`,
      "rev.note": "Tapping the button opens WhatsApp with your request ready to send. Your booking is confirmed once we reply.",
      "sent.title": "Request ready!", "sent.text": "If WhatsApp didn't open, call or message us with your booking code:",
      "sent.again": "Open WhatsApp again", "sent.call": "Call",
      waHello: "Hi, I'd like information about Hotel Yaluma.",
      langBtn: "ES", langLabel: "Cambiar idioma a español", staff: "Staff login",
    },
  };

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
  };

  let lang = store.get("yaluma.lang") === "en" ? "en" : "es";
  const t = (key, ...args) => {
    const v = STRINGS[lang][key] ?? STRINGS.es[key] ?? key;
    return typeof v === "function" ? v(...args) : v;
  };
  const locale = () => (lang === "es" ? "es-DO" : "en-US");

  // ---------------------------------------------------------------- utilidades
  const money = (n) => `${H.currency}${Math.round(n).toLocaleString("en-US")}`;
  const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const sameDay = (a, b) => a && b && a.getTime() === b.getTime();
  const nightsBetween = (a, b) => Math.round((b - a) / 86400000);
  const fmtShort = (d) => d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" });
  const fmtLong = (d, loc = locale()) => d.toLocaleDateString(loc, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const waLink = (text) => `https://wa.me/${H.whatsapp}?text=${encodeURIComponent(text)}`;
  const icon = (id, cls = "ico") => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const roomById = (id) => H.rooms.find((r) => r.id === id);

  const newCode = () => {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return `YAL-${s}`;
  };

  // ---------------------------------------------------------------- estado
  const STEPS = ["dates", "room", "details", "review", "sent"];
  const state = {
    step: "dates",
    checkIn: null,
    checkOut: null,
    stay: "night", // "night" = por noche, "pass" = pase por horas
    passTime: null, // hora de entrada del pase (0-23)
    editing: "in",
    adults: 2,
    kids: 0,
    roomId: null,
    month: (() => { const d = today(); d.setDate(1); return d; })(),
    details: { name: store.get("yaluma.name") || "", phone: store.get("yaluma.phone") || "", email: "", arrival: "", notes: "" },
    code: null,
  };
  const guests = () => state.adults + state.kids;
  const nights = () => (state.checkIn && state.checkOut ? nightsBetween(state.checkIn, state.checkOut) : 0);
  const isPass = () => state.stay === "pass";
  const passToday = () => sameDay(state.checkIn, today());
  // Horas de entrada que ya pasaron hoy no se pueden elegir.
  const slotOpen = (h) => !passToday() || h > new Date().getHours();
  const units = () => (isPass() ? (state.checkIn && state.passTime != null ? 1 : 0) : nights());
  const unitPrice = (r) => (isPass() ? r.passPrice : r.price);
  const unitsLabel = () => (isPass() ? t("passUnit") : t("nights", nights()));
  const roomFits = (r) => r.maxGuests >= guests() && (!isPass() || r.passPrice != null);
  const fmtHour = (h, loc = locale()) => new Date(2000, 0, 1, h % 24).toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" });
  const passRange = (loc = locale()) => `${fmtHour(state.passTime, loc)} – ${fmtHour(state.passTime + PH, loc)}`;
  const guestLabel = () => t("adults", state.adults) + (state.kids ? `, ${t("kids", state.kids)}` : "");

  // ---------------------------------------------------------------- página
  function applyStrings() {
    document.documentElement.lang = lang;
    $$("[data-i18n]").forEach((el) => {
      const v = t(el.dataset.i18n);
      if (v.includes("<")) el.innerHTML = v; else el.textContent = v;
    });
    $$("[data-i18n-alt]").forEach((el) => { el.alt = t(el.dataset.i18nAlt); });
    $$("[data-i18n-aria]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    $$("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
    const lb = $("#lang-toggle");
    lb.textContent = t("langBtn");
    lb.setAttribute("aria-label", t("langLabel"));
    $("#sheet-back").setAttribute("aria-label", t("back"));
    $("#sheet-close").setAttribute("aria-label", t("close"));
    $("#rating-text").textContent = t("rating", H.googleRating, H.googleReviews);
    $("#hours").textContent = t("hours", H.checkIn, H.checkOut);
    $("#wa-general").href = $("#wa-float").href = waLink(t("waHello"));
    renderRooms();
    renderAmenities();
    renderArrivalOptions();
    $("#pay-text").textContent = t("payText", H.acceptsCards);
    updateQuickbook();
    if (!$("#sheet").hidden) renderStep();
  }

  function renderRooms() {
    $("#rooms").innerHTML = H.rooms.map((r) => `
      <article class="room">
        <div class="room-img">
          <img src="${esc(r.image)}" alt="${esc(r.name[lang])}" loading="lazy" />
          <span class="room-tag">${icon("user")}${esc(t("rooms.upTo", r.maxGuests))}</span>
        </div>
        <div class="room-body">
          <h3>${esc(r.name[lang])}</h3>
          <p class="room-floor">${esc(r.bed[lang])} · ${esc(t("rooms.count", r.numbers.length))}</p>
          <p class="room-meta">${esc(r.description[lang])}</p>
          <ul class="feat">${r.features.map((f) => `<li>${icon(f)}${esc(t("a." + f))}</li>`).join("")}</ul>
          <div class="room-foot">
            <div>
              <p class="price">${money(r.price)} <small>${esc(t("rooms.night"))}</small></p>
              ${r.passPrice != null ? `<p class="price-alt">${esc(t("stay.pass"))}: <strong>${money(r.passPrice)}</strong></p>` : ""}
            </div>
            <button class="btn btn-primary btn-sm" type="button" data-book-room="${esc(r.id)}">${esc(t("rooms.book"))}</button>
          </div>
        </div>
      </article>`).join("");
  }

  function renderAmenities() {
    $("#amenities").innerHTML = H.amenities
      .map((a) => `<li><span class="amen-ico">${icon(a, "")}</span>${esc(t("a." + a))}</li>`)
      .join("");
  }

  function renderArrivalOptions() {
    const sel = $("#arrival");
    const hours = [];
    for (let h = 12; h <= 23; h++) hours.push(h);
    const label = (h) => new Date(2000, 0, 1, h).toLocaleTimeString(locale(), { hour: "numeric", minute: "2-digit" });
    sel.innerHTML = [`<option value="">${esc(t("arrivalUnknown"))}</option>`]
      .concat(hours.map((h) => `<option value="${h}">${esc(label(h))}</option>`))
      .concat(`<option value="late">${esc(t("arrivalLate"))}</option>`)
      .join("");
    sel.value = state.details.arrival;
  }

  function updateQuickbook() {
    $$("[data-stay]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.stay === state.stay)));
    $("#qb-in-label").textContent = isPass() ? t("q.date") : t("quick.checkin");
    $("#qb-out-label").textContent = isPass() ? t("q.time") : t("quick.checkout");
    $("#qb-in").textContent = state.checkIn ? fmtShort(state.checkIn) : t("quick.pick");
    $("#qb-out").textContent = isPass()
      ? (state.passTime != null ? passRange() : t("q.pickTime"))
      : (state.checkOut ? fmtShort(state.checkOut) : t("quick.pick"));
    $("#qb-guests").textContent = guestLabel();
  }

  function setupStatic() {
    $("#addr").textContent = H.address;
    $("#footer-addr").textContent = H.address;
    $("#year").textContent = new Date().getFullYear();
    const tel = `tel:+${H.whatsapp}`;
    $("#tel-link").href = tel;
    $("#tel-link").textContent = H.phoneDisplay;
    $("#sent-call").href = tel;
    const q = encodeURIComponent(H.mapsQuery);
    $("#directions").href = `https://www.google.com/maps/search/?api=1&query=${q}`;
    $("#map").src = `https://maps.google.com/maps?q=${q}&z=15&output=embed`;
  }

  // ---------------------------------------------------------------- hoja de reserva
  const sheet = $("#sheet");
  const backdrop = $("#backdrop");
  let lastFocus = null;

  function openSheet(step = "dates") {
    lastFocus = document.activeElement;
    state.step = step;
    sheet.hidden = backdrop.hidden = false;
    document.body.classList.add("locked");
    if (!history.state || !history.state.sheet) history.pushState({ sheet: true }, "");
    renderStep();
    $("#sheet-close").focus();
  }

  function closeSheet(fromHistory = false) {
    if (sheet.hidden) return;
    sheet.hidden = backdrop.hidden = true;
    document.body.classList.remove("locked");
    if (state.step === "sent") resetBooking();
    if (!fromHistory && history.state && history.state.sheet) history.back();
    if (lastFocus) lastFocus.focus();
  }

  function setStay(stay) {
    if (stay === state.stay) return;
    state.stay = stay;
    state.checkOut = null;
    state.passTime = null;
    state.editing = stay === "night" && state.checkIn ? "out" : "in";
    updateQuickbook();
    if (!sheet.hidden && state.step === "dates") { renderDates(); renderFoot(); }
  }

  function resetBooking() {
    state.checkIn = state.checkOut = state.roomId = state.code = state.passTime = null;
    state.month = today();
    state.month.setDate(1);
    state.editing = "in";
    state.details.notes = "";
    state.step = "dates";
    $("#details-form").reset();
    updateQuickbook();
  }

  function go(step) {
    state.step = step;
    renderStep();
    $("#sheet-body").scrollTop = 0;
  }

  function renderStep() {
    const i = STEPS.indexOf(state.step);
    $$(".step", sheet).forEach((s) => { s.hidden = s.dataset.step !== state.step; });
    $("#sheet-title").textContent = t("sheet." + state.step);
    $$("#progress li").forEach((li, n) => li.classList.toggle("on", n <= Math.min(i, 3)));
    const back = $("#sheet-back");
    const noBack = i === 0 || state.step === "sent";
    back.setAttribute("aria-hidden", String(noBack));
    back.tabIndex = noBack ? -1 : 0;
    // En el resumen el botón es un enlace real a WhatsApp: abre en otra pestaña en cualquier navegador.
    const nextBtn = $("#sheet-next");
    nextBtn.hidden = state.step === "review";
    $("#sheet-wa").hidden = state.step !== "review";
    nextBtn.textContent = t("next." + state.step);
    $("#sheet-foot").classList.toggle("full", state.step === "review" || state.step === "sent");

    if (state.step === "dates") renderDates();
    if (state.step === "room") renderRoomOptions();
    if (state.step === "details") fillDetails();
    if (state.step === "review") renderSummary();
    if (state.step === "sent") renderSent();
    renderFoot();
  }

  function canContinue() {
    switch (state.step) {
      case "dates": return units() > 0;
      case "room": { const r = roomById(state.roomId); return !!r && roomFits(r); }
      default: return true;
    }
  }

  function renderFoot() {
    const room = roomById(state.roomId);
    const n = units();
    let html = "";
    if (state.step === "sent") {
      html = "";
    } else if (room && n && roomFits(room)) {
      html = `<strong>${money(unitPrice(room) * n)}</strong><small>${esc(unitsLabel())} · ${esc(t("payAtHotel"))}</small>`;
    } else if (n) {
      html = `<strong>${esc(isPass() ? passRange() : unitsLabel())}</strong><small>${esc(guestLabel())}</small>`;
    } else if (state.step === "dates") {
      const hint = isPass()
        ? (state.checkIn ? t("pickTime") : t("pickDay"))
        : (state.editing === "out" && state.checkIn ? t("pickOut") : t("pickIn"));
      html = `<small>${esc(hint)}</small>`;
    }
    $("#foot-total").innerHTML = html;
    $("#sheet-next").disabled = !canContinue();
  }

  // Calendario ---------------------------------------------------------
  function renderDates() {
    const pass = isPass();
    $("#ds-in-label").textContent = pass ? t("q.date") : t("quick.checkin");
    $("#ds-out-label").textContent = pass ? t("q.time") : t("quick.checkout");
    $("#ds-in").textContent = state.checkIn ? fmtShort(state.checkIn) : "—";
    $("#ds-out").textContent = pass
      ? (state.passTime != null ? passRange() : "—")
      : (state.checkOut ? fmtShort(state.checkOut) : "—");
    $("#ds-nights").textContent = pass ? `${PH} h` : (nights() ? t("nights", nights()) : "");
    const active = pass ? (state.checkIn ? "out" : "in") : state.editing;
    $$(".ds-box").forEach((b) => b.classList.toggle("active", b.dataset.edge === active));
    $("#slots-wrap").hidden = !pass;
    if (pass) renderSlots();
    $("#g-adults").textContent = state.adults;
    $("#g-kids").textContent = state.kids;
    $('[data-g="adults"][data-d="-1"]').disabled = state.adults <= 1;
    $('[data-g="adults"][data-d="1"]').disabled = guests() >= maxCapacity();
    $('[data-g="kids"][data-d="-1"]').disabled = state.kids <= 0;
    $('[data-g="kids"][data-d="1"]').disabled = guests() >= maxCapacity();
    renderCalendar();
  }

  const maxCapacity = () => Math.max(...H.rooms.map((r) => r.maxGuests));

  function renderCalendar() {
    const m = state.month;
    const first = today(); first.setDate(1);
    const canPrev = m > first;
    const raw = m.toLocaleDateString(locale(), { month: "long", year: "numeric" });
    const title = raw.charAt(0).toUpperCase() + raw.slice(1);
    const dow = [];
    for (let i = 0; i < 7; i++) {
      // Semana de domingo a sábado, como en RD.
      dow.push(new Date(2023, 0, 1 + i).toLocaleDateString(locale(), { weekday: "narrow" }));
    }
    const startPad = m.getDay();
    const days = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const now = today();
    const { checkIn: a, checkOut: b } = state;
    let cells = "";
    for (let i = 0; i < startPad; i++) cells += "<span></span>";
    for (let d = 1; d <= days; d++) {
      const date = new Date(m.getFullYear(), m.getMonth(), d);
      const past = date < now;
      const cls = [
        "cal-day",
        sameDay(date, now) && "today",
        sameDay(date, a) && "start",
        sameDay(date, a) && b && "has-end",
        sameDay(date, b) && "end",
        a && b && date > a && date < b && "in-range",
      ].filter(Boolean).join(" ");
      const label = fmtLong(date);
      cells += `<button type="button" class="${cls}" data-date="${iso(date)}" ${past ? "disabled" : ""} aria-label="${esc(label)}" aria-pressed="${sameDay(date, a) || sameDay(date, b)}"><span>${d}</span></button>`;
    }
    $("#calendar").innerHTML = `
      <div class="cal-head">
        <button type="button" class="icon-btn" data-cal="-1" ${canPrev ? "" : "disabled"} aria-label="‹">${icon("left")}</button>
        <strong aria-live="polite">${esc(title)}</strong>
        <button type="button" class="icon-btn" data-cal="1" aria-label="›">${icon("right")}</button>
      </div>
      <div class="cal-grid">${dow.map((x) => `<span class="cal-dow">${esc(x)}</span>`).join("")}${cells}</div>`;
  }

  function renderSlots() {
    const hours = [];
    for (let h = H.pass.firstStart; h <= H.pass.lastStart; h++) hours.push(h);
    $("#slots").innerHTML = hours.map((h) => `
      <button type="button" class="slot" role="radio" data-hour="${h}" aria-checked="${h === state.passTime}" ${slotOpen(h) ? "" : "disabled"}>
        ${esc(fmtHour(h))}<small>${esc(t("until"))} ${esc(fmtHour(h + PH))}</small>
      </button>`).join("");
  }

  function pickDate(date) {
    if (isPass()) {
      state.checkIn = date;
      if (state.passTime != null && !slotOpen(state.passTime)) state.passTime = null;
      updateQuickbook();
      renderDates();
      renderFoot();
      return;
    }
    const { checkIn: a, checkOut: b } = state;
    if (state.editing === "in" || !a || (a && b && state.editing !== "out")) {
      state.checkIn = date;
      if (!b || date >= b) state.checkOut = null;
      state.editing = state.checkOut ? "in" : "out";
    } else if (date <= a) {
      state.checkIn = date;
      state.checkOut = null;
      state.editing = "out";
    } else {
      state.checkOut = date;
      state.editing = "in";
    }
    updateQuickbook();
    renderDates();
    renderFoot();
  }

  // Habitación ---------------------------------------------------------
  function renderRoomOptions() {
    const n = units();
    $("#room-hint").textContent = isPass()
      ? `${guestLabel()} · ${t("stay.pass")} · ${fmtShort(state.checkIn)}, ${passRange()}`
      : t("roomHint", guestLabel(), t("nights", n), fmtShort(state.checkIn), fmtShort(state.checkOut));
    const fits = H.rooms.filter(roomFits);
    if (!roomById(state.roomId) || !roomFits(roomById(state.roomId))) state.roomId = fits.length ? fits[0].id : null;
    $("#room-options").innerHTML = H.rooms.map((r) => {
      const ok = roomFits(r);
      const why = r.maxGuests < guests() ? t("tooSmall", r.maxGuests) : t("noPass");
      return `
      <button type="button" class="room-opt" role="radio" aria-checked="${r.id === state.roomId}" data-room="${esc(r.id)}" ${ok ? "" : "disabled"}>
        <img src="${esc(r.image)}" alt="" />
        <div>
          <h3>${esc(r.name[lang])}</h3>
          <p class="room-meta">${esc(r.bed[lang])} · ${esc(t("rooms.upTo", r.maxGuests))}</p>
          ${ok
            ? (isPass()
              ? `<p class="opt-price">${money(r.passPrice)} <small>· ${esc(t("stay.pass"))}</small></p>`
              : `<p class="opt-price">${money(r.price * n)} <small>· ${money(r.price)} ${esc(t("perNight"))}</small></p>`)
            : `<p class="warn">${esc(why)}</p>`}
        </div>
      </button>`;
    }).join("");
  }

  // Datos --------------------------------------------------------------
  function fillDetails() {
    const f = $("#details-form");
    ["name", "phone", "email", "notes"].forEach((k) => { f.elements[k].value = state.details[k]; });
    f.elements.arrival.value = state.details.arrival;
    // En el pase la hora de llegada ya se eligió en el primer paso.
    $("#arrival-field").hidden = isPass();
  }

  function readDetails() {
    const f = $("#details-form");
    ["name", "phone", "email", "arrival", "notes"].forEach((k) => { state.details[k] = f.elements[k].value.trim(); });
  }

  function validateDetails() {
    readDetails();
    const f = $("#details-form");
    const d = state.details;
    const checks = {
      name: d.name.length >= 2,
      phone: d.phone.replace(/\D/g, "").length >= 10,
      email: !d.email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email),
    };
    let firstBad = null;
    for (const [k, ok] of Object.entries(checks)) {
      f.elements[k].closest(".field").classList.toggle("invalid", !ok);
      f.elements[k].setAttribute("aria-invalid", String(!ok));
      if (!ok && !firstBad) firstBad = f.elements[k];
    }
    if (firstBad) { firstBad.focus(); return false; }
    store.set("yaluma.name", d.name);
    store.set("yaluma.phone", d.phone);
    return true;
  }

  function arrivalText(loc) {
    const a = state.details.arrival;
    const L = loc === "es-DO" ? STRINGS.es : STRINGS[lang];
    if (!a) return L.arrivalUnknown;
    if (a === "late") return L.arrivalLate;
    return new Date(2000, 0, 1, Number(a)).toLocaleTimeString(loc, { hour: "numeric", minute: "2-digit" });
  }

  // Resumen ------------------------------------------------------------
  function renderSummary() {
    if (!state.code) state.code = newCode();
    const r = roomById(state.roomId);
    const n = units();
    const d = state.details;
    const rows = isPass()
      ? [
        [t("sum.type"), t("stay.pass")],
        [t("sum.date"), fmtShort(state.checkIn)],
        [t("sum.time"), passRange()],
        [t("sum.guests"), guestLabel()],
        [t("sum.name"), d.name],
        [t("sum.phone"), d.phone],
      ]
      : [
        [t("sum.in"), `${fmtShort(state.checkIn)} · ${H.checkIn}`],
        [t("sum.out"), `${fmtShort(state.checkOut)} · ${H.checkOut}`],
        [t("sum.guests"), guestLabel()],
        [t("sum.name"), d.name],
        [t("sum.phone"), d.phone],
        [t("sum.arrival"), arrivalText(locale())],
      ];
    if (d.notes) rows.push([t("sum.notes"), d.notes]);
    rows.push([t("sum.calc", money(unitPrice(r)), unitsLabel()), money(unitPrice(r) * n)]);
    $("#summary").innerHTML = `
      <div class="sum-top">
        <img src="${esc(r.image)}" alt="" />
        <div><h3>${esc(r.name[lang])}</h3><span class="sum-code">${esc(t("sum.code"))}: ${esc(state.code)}</span></div>
      </div>
      <ul class="sum-rows">${rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${esc(v)}</span></li>`).join("")}</ul>
      <div class="sum-total"><div>${esc(t("total"))}<small>${esc(t("payAtHotel"))}</small></div><strong>${money(unitPrice(r) * n)}</strong></div>`;
    $("#sheet-wa").href = waLink(whatsappMessage());
  }

  // El mensaje al hotel siempre va en español, lo lea quien lo lea.
  function whatsappMessage() {
    const r = roomById(state.roomId);
    const n = units();
    const d = state.details;
    const guestsEs = STRINGS.es.adults(state.adults) + (state.kids ? `, ${STRINGS.es.kids(state.kids)}` : "");
    const stay = isPass()
      ? [
        `*Tipo:* ${STRINGS.es["stay.pass"]}`,
        `*Habitación:* ${r.name.es}`,
        `*Fecha:* ${fmtLong(state.checkIn, "es-DO")}`,
        `*Horario:* ${passRange("es-DO")}`,
      ]
      : [
        `*Tipo:* Por noche`,
        `*Habitación:* ${r.name.es}`,
        `*Llegada:* ${fmtLong(state.checkIn, "es-DO")}`,
        `*Salida:* ${fmtLong(state.checkOut, "es-DO")}`,
        `*Noches:* ${n}`,
      ];
    const lines = [
      "Hola, quiero reservar en el Hotel Yaluma.",
      "",
      `*Código:* ${state.code}`,
      ...stay,
      `*Huéspedes:* ${guestsEs}`,
      `*Total estimado:* ${money(unitPrice(r) * n)} (pago en efectivo al llegar)`,
      "",
      `*Nombre:* ${d.name}`,
      `*Teléfono:* ${d.phone}`,
    ];
    if (d.email) lines.push(`*Correo:* ${d.email}`);
    if (!isPass()) lines.push(`*Hora de llegada:* ${arrivalText("es-DO")}`);
    if (d.notes) lines.push(`*Comentarios:* ${d.notes}`);
    if (lang === "en") lines.push("", "(El cliente usó la página en inglés.)");
    return lines.join("\n");
  }

  // Guarda la solicitud para el panel del personal. Si falla, el WhatsApp ya salió.
  function saveReservation() {
    if (!window.YalumaStore) return;
    const r = roomById(state.roomId);
    const d = state.details;
    const passStart = isPass() ? new Date(state.checkIn.getFullYear(), state.checkIn.getMonth(), state.checkIn.getDate(), state.passTime) : null;
    const row = {
      code: state.code,
      source: "web",
      stay_type: isPass() ? "pase" : "noche",
      room_tier: r.id,
      guest_name: d.name,
      guest_phone: d.phone,
      guest_email: d.email || null,
      adults: state.adults,
      kids: state.kids,
      check_in: iso(state.checkIn),
      check_out: isPass() ? null : iso(state.checkOut),
      pass_start: passStart ? passStart.toISOString() : null,
      pass_end: passStart ? new Date(passStart.getTime() + PH * 3600000).toISOString() : null,
      arrival: isPass() ? null : arrivalText("es-DO"),
      notes: d.notes || null,
      total: unitPrice(r) * units(),
      lang,
    };
    YalumaStore.get().then((db) => db.submitWebReservation(row)).catch((e) => console.warn("No se guardó la reserva:", e));
  }

  function renderSent() {
    $("#sent-code").textContent = state.code;
    $("#sent-wa").href = waLink(whatsappMessage());
  }

  function next() {
    if (!canContinue()) return;
    switch (state.step) {
      case "dates": go("room"); break;
      case "room": go("details"); break;
      case "details": if (validateDetails()) go("review"); break;
      case "review": break; // lo maneja el enlace #sheet-wa
      case "sent": closeSheet(); break;
    }
  }

  function back() {
    const i = STEPS.indexOf(state.step);
    if (state.step === "details") readDetails();
    if (i > 0 && state.step !== "sent") go(STEPS[i - 1]);
  }

  // ---------------------------------------------------------------- eventos
  function bind() {
    document.addEventListener("click", (e) => {
      const el = e.target.closest("[data-book], [data-book-step], [data-book-room]");
      if (!el) return;
      e.preventDefault();
      if (el.dataset.bookRoom) {
        state.roomId = el.dataset.bookRoom;
        const r = roomById(state.roomId);
        if (guests() > r.maxGuests) { state.adults = Math.min(state.adults, r.maxGuests); state.kids = 0; }
      }
      openSheet(units() && state.roomId && !el.dataset.bookStep ? "room" : "dates");
    });

    $("#quickbook").addEventListener("submit", (e) => { e.preventDefault(); openSheet(units() ? "room" : "dates"); });

    $$("[data-stay]").forEach((b) => b.addEventListener("click", () => setStay(b.dataset.stay)));

    $("#slots").addEventListener("click", (e) => {
      const slot = e.target.closest("[data-hour]");
      if (!slot || slot.disabled) return;
      state.passTime = Number(slot.dataset.hour);
      updateQuickbook();
      renderDates();
      renderFoot();
    });

    $("#lang-toggle").addEventListener("click", () => {
      if (state.step === "details" && !sheet.hidden) readDetails();
      lang = lang === "es" ? "en" : "es";
      store.set("yaluma.lang", lang);
      applyStrings();
    });

    $("#sheet-next").addEventListener("click", next);
    $("#sheet-wa").addEventListener("click", () => {
      saveReservation();
      setTimeout(() => go("sent"), 0);
    });
    $("#sheet-back").addEventListener("click", back);
    $("#sheet-close").addEventListener("click", () => closeSheet());
    backdrop.addEventListener("click", () => closeSheet());
    window.addEventListener("popstate", () => closeSheet(true));

    sheet.addEventListener("keydown", (e) => {
      if (e.key === "Escape") { closeSheet(); return; }
      if (e.key === "Tab") {
        const f = $$("button:not([disabled]), a[href], input, select, textarea", sheet)
          .filter((x) => x.offsetParent !== null && x.tabIndex !== -1);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      if (e.key === "Enter" && state.step === "details" && e.target.tagName === "INPUT") { e.preventDefault(); next(); }
    });

    $("#calendar").addEventListener("click", (e) => {
      const nav = e.target.closest("[data-cal]");
      if (nav && !nav.disabled) {
        const m = new Date(state.month);
        m.setMonth(m.getMonth() + Number(nav.dataset.cal));
        state.month = m;
        renderCalendar();
        return;
      }
      const day = e.target.closest("[data-date]");
      if (day && !day.disabled) {
        const [y, mo, d] = day.dataset.date.split("-").map(Number);
        pickDate(new Date(y, mo - 1, d));
      }
    });

    $$(".ds-box").forEach((b) => b.addEventListener("click", () => {
      state.editing = b.dataset.edge === "out" && !state.checkIn ? "in" : b.dataset.edge;
      renderDates();
      renderFoot();
    }));

    $$("[data-g]").forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.g;
      const v = state[k] + Number(b.dataset.d);
      if (v < (k === "adults" ? 1 : 0) || (Number(b.dataset.d) > 0 && guests() >= maxCapacity())) return;
      state[k] = v;
      updateQuickbook();
      renderDates();
      renderFoot();
    }));

    $("#room-options").addEventListener("click", (e) => {
      const opt = e.target.closest("[data-room]");
      if (!opt || opt.disabled) return;
      state.roomId = opt.dataset.room;
      renderRoomOptions();
      renderFoot();
    });

    $("#details-form").addEventListener("input", (e) => {
      const field = e.target.closest(".field");
      if (field) field.classList.remove("invalid");
    });

    // Barra superior y botón móvil según el desplazamiento.
    const nav = $("#nav");
    const bar = $(".mobile-bar");
    const onScroll = () => {
      const y = window.scrollY;
      nav.classList.toggle("solid", y > 40);
      bar.classList.toggle("show", y > window.innerHeight * 0.7);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  setupStatic();
  bind();
  applyStrings();
})();
