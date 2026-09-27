/* Hotel Yaluma: panel del personal.
 *
 * Habitaciones (tablero de 19 cuadros por colores), reservas, turnos y equipo.
 * Los datos vienen de store.js (Supabase o modo demostración).
 */
(() => {
  "use strict";

  const H = window.HOTEL;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (n) => `${H.currency}${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
  const PH = H.pass.hours;
  const LOC = "es-DO";

  let db = null;
  let me = null;
  let view = "rooms";
  let resFilter = "pendiente";
  let resQuery = "";
  const data = { profiles: [], rooms: [], reservations: [], payments: [], shifts: [], activity: [] };

  // ---------------------------------------------------------------- fechas
  const pad = (n) => String(n).padStart(2, "0");
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = () => isoDay(new Date());
  const addDaysIso = (iso, n) => { const d = parseDay(iso); d.setDate(d.getDate() + n); return isoDay(d); };
  const parseDay = (iso) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };
  const nightsBetween = (a, b) => Math.round((parseDay(b) - parseDay(a)) / 864e5);
  const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
  const fmtDay = (iso) => parseDay(iso).toLocaleDateString(LOC, { weekday: "short", day: "numeric", month: "short" });
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString(LOC, { hour: "numeric", minute: "2-digit" });
  const fmtHour = (h) => new Date(2000, 0, 1, h % 24).toLocaleTimeString(LOC, { hour: "numeric", minute: "2-digit" });
  const fmtWhen = (ts) => {
    const d = new Date(ts);
    return isoDay(d) === todayIso() ? fmtTime(ts) : `${d.toLocaleDateString(LOC, { weekday: "short", day: "numeric" })}, ${fmtTime(ts)}`;
  };
  const fmtDurShort = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${pad(m % 60)}m`;
  };
  const fmtDur = (ms) => {
    const m = Math.max(0, Math.round(ms / 60000));
    return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${pad(m % 60)} min`;
  };

  // ---------------------------------------------------------------- datos derivados
  const tier = (id) => H.rooms.find((t) => t.id === id) || H.rooms[0];
  const tierName = (id) => tier(id).name.es.replace("Habitación ", "");
  const person = (id) => data.profiles.find((p) => p.id === id);
  const personName = (id) => (person(id) ? person(id).name : "—");
  const initials = (name) => (name || "?").trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  const paidFor = (resId) => data.payments.filter((p) => p.reservation_id === resId).reduce((s, p) => s + Number(p.amount), 0);
  const stayIn = (number) => data.reservations.find((r) => r.status === "en_curso" && r.room_number === number);
  const stayEnd = (r) => {
    if (r.stay_type === "pase") return new Date(r.pass_end);
    const d = parseDay(r.check_out);
    d.setHours(H.checkOutHour || 12, 0, 0, 0);
    return d;
  };
  const arrivingToday = () => data.reservations.filter((r) => r.status === "confirmada" && r.check_in <= todayIso());
  const myShift = () => data.shifts.find((s) => s.user_id === me.id && !s.ended_at);
  const openShifts = () => data.shifts.filter((s) => !s.ended_at);
  const newCode = () => {
    const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let s = "";
    for (let i = 0; i < 4; i++) s += abc[Math.floor(Math.random() * abc.length)];
    return `YAL-${s}`;
  };

  function roomView(room) {
    const stay = stayIn(room.number);
    if (room.state === "fuera") return { cls: "out", label: "Fuera de servicio", when: room.note || "" };
    if (stay) {
      const end = stayEnd(stay);
      const late = Date.now() > end.getTime();
      const pass = stay.stay_type === "pase";
      let when;
      // Textos cortos: tienen que caber en el cuadro del teléfono.
      if (late) when = `Vencido ${fmtDurShort(Date.now() - end)}`;
      else if (pass) when = `Hasta ${fmtTime(end)}`;
      else if (stay.check_out === todayIso()) when = `Sale hoy ${fmtHour(H.checkOutHour || 12)}`;
      else when = `Sale ${parseDay(stay.check_out).toLocaleDateString(LOC, { weekday: "short", day: "numeric" }).replace(",", "")}`;
      return { cls: pass ? "pass" : "night", label: pass ? "Pase" : "Noche", who: stay.guest_name, when, late, stay };
    }
    if (room.state === "limpieza") return { cls: "clean", label: "Limpieza", when: "" };
    const arriving = arrivingToday().find((r) => r.room_number === room.number);
    if (arriving) return { cls: "arrive", label: "Llega hoy", who: arriving.guest_name, when: arriving.arrival || "", arriving };
    return { cls: "free", label: "Libre", when: "" };
  }

  // Cuántas habitaciones de un tipo ya están tomadas en la noche más llena del rango.
  function tierLoad(tierId, checkIn, checkOut, excludeId) {
    let worst = 0;
    for (let d = checkIn; d < checkOut; d = addDaysIso(d, 1)) {
      const n = data.reservations.filter((r) => r.id !== excludeId && r.room_tier === tierId && r.stay_type === "noche"
        && (r.status === "confirmada" || r.status === "en_curso") && r.check_in <= d && d < r.check_out).length;
      worst = Math.max(worst, n);
    }
    return { taken: worst, total: tier(tierId).numbers.length };
  }

  function stayText(r) {
    if (r.stay_type === "pase") {
      const range = r.pass_start ? `${fmtTime(r.pass_start)} – ${fmtTime(r.pass_end)}` : "";
      return `Pase de ${PH} horas · ${fmtDay(r.check_in)}${range ? ", " + range : ""}`;
    }
    const n = nightsBetween(r.check_in, r.check_out);
    return `${fmtDay(r.check_in)} → ${fmtDay(r.check_out)} · ${n} ${n === 1 ? "noche" : "noches"}`;
  }

  // ---------------------------------------------------------------- WhatsApp al huésped
  function waPhone(phone) {
    let d = String(phone || "").replace(/\D/g, "");
    if (d.length === 10) d = "1" + d; // números de RD: 809, 829, 849
    return d.length >= 11 ? d : null;
  }
  function guestMessage(r, kind) {
    const first = (r.guest_name || "").split(" ")[0];
    const en = r.lang === "en";
    const detail = r.stay_type === "pase"
      ? (en ? `a ${PH}-hour pass on ${fmtDay(r.check_in)}` : `un pase de ${PH} horas el ${fmtDay(r.check_in)}`)
        + (r.pass_start ? `, ${fmtTime(r.pass_start)} – ${fmtTime(r.pass_end)}` : "")
      : (en ? `from ${fmtDay(r.check_in)} to ${fmtDay(r.check_out)}` : `del ${fmtDay(r.check_in)} al ${fmtDay(r.check_out)}`);
    const room = en ? tier(r.room_tier).name.en : tier(r.room_tier).name.es;
    if (kind === "confirm") {
      return en
        ? `Hello ${first}, this is Hotel Yaluma. Your booking ${r.code} is confirmed: ${room}, ${detail}. Total ${money(r.total)}, paid in cash on arrival. See you soon!`
        : `Hola ${first}, le saluda Hotel Yaluma. Su reserva ${r.code} está confirmada: ${room}, ${detail}. Total ${money(r.total)}, a pagar en efectivo al llegar. ¡Le esperamos!`;
    }
    return en
      ? `Hello ${first}, this is Hotel Yaluma. We're sorry, we don't have availability for your request ${r.code} (${detail}). Please call us at ${H.phoneDisplay} to find another option.`
      : `Hola ${first}, le saluda Hotel Yaluma. Lamentamos no tener disponibilidad para su solicitud ${r.code} (${detail}). Llámenos al ${H.phoneDisplay} y buscamos otra opción.`;
  }
  const waLink = (r, kind) => {
    const p = waPhone(r.guest_phone);
    return p ? `https://wa.me/${p}?text=${encodeURIComponent(guestMessage(r, kind))}` : null;
  };

  // ---------------------------------------------------------------- utilidades de interfaz
  let toastTimer = null;
  function toast(msg, error = false) {
    const t = $("#toast");
    t.textContent = msg;
    t.classList.toggle("error", error);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  let modalOnClose = null;
  function openModal(title, html, onClose) {
    $("#modal-title").textContent = title;
    // Contenedor nuevo en cada ventana, para que no se acumulen los eventos.
    $("#modal-body").innerHTML = `<div class="modal-inner">${html}</div>`;
    $("#modal").hidden = $("#modal-backdrop").hidden = false;
    document.body.classList.add("locked");
    modalOnClose = onClose || null;
    const inner = $("#modal-body .modal-inner");
    const first = $("input, select, button", inner);
    if (first && window.matchMedia("(min-width: 760px)").matches) first.focus();
    return inner;
  }
  function closeModal() {
    $("#modal").hidden = $("#modal-backdrop").hidden = true;
    document.body.classList.remove("locked");
    if (modalOnClose) { const f = modalOnClose; modalOnClose = null; f(); }
  }

  // Ejecuta una acción, registra la actividad y recarga. Muestra errores sin romper nada.
  async function act(fn, done) {
    try {
      await fn();
      await refresh();
      if (done) toast(done);
      return true;
    } catch (e) {
      console.error(e);
      toast(e.message || "No se pudo guardar. Revise la conexión.", true);
      return false;
    }
  }

  const factsHtml = (rows) => `<dl class="facts">${rows.filter(Boolean).map(([k, v]) => `<dt>${esc(k)}</dt><dd>${v}</dd>`).join("")}</dl>`;
  const chipColors = {
    free: ["--free", "--free-bg"], night: ["--night-st", "--night-bg"], pass: ["--pass", "--pass-bg"],
    arrive: ["--arrive", "--arrive-bg"], clean: ["--clean", "--clean-bg"], out: ["--out", "--out-bg"],
    late: ["--danger", "--late-bg"],
  };
  const chip = (cls, label) => `<span class="status-chip" style="background:var(${chipColors[cls][1]});color:var(${chipColors[cls][0]})">${esc(label)}</span>`;

  // ---------------------------------------------------------------- carga
  async function refresh() {
    const since = new Date(Date.now() - 60 * 864e5).toISOString();
    const week = new Date(Date.now() - 8 * 864e5).toISOString();
    const [profiles, rooms, reservations, payments, shifts, activity] = await Promise.all([
      db.profiles(), db.rooms(), db.reservations(), db.payments(since), db.shifts(week), db.activity(80),
    ]);
    Object.assign(data, { profiles, rooms, reservations, payments, shifts, activity });
    const fresh = profiles.find((p) => p.id === me.id);
    if (!fresh || !fresh.active) { await logout("Su cuenta fue desactivada."); return; }
    me = fresh;
    render();
  }

  function render() {
    if (!me) return;
    const today = new Date().toLocaleDateString(LOC, { weekday: "short", day: "numeric", month: "short" });
    $("#today-label").textContent = today.charAt(0).toUpperCase() + today.slice(1);
    $("#me-avatar").textContent = initials(me.name);
    $("#me-avatar").title = `${me.name} (${me.role === "admin" ? "administrador" : "personal"})`;
    const s = myShift();
    const pill = $("#shift-pill");
    pill.classList.toggle("on", !!s);
    pill.innerHTML = s ? `<span class="pill-label">En turno · </span>${esc(fmtDurShort(Date.now() - new Date(s.started_at)))}` : "Iniciar turno";
    const pending = data.reservations.filter((r) => r.status === "pendiente").length;
    const badge = $("#pending-badge");
    badge.hidden = !pending;
    badge.textContent = pending;
    $$(".tabs button").forEach((b) => b.toggleAttribute("aria-current", b.dataset.view === view));
    $$(".tabs button[aria-current]").forEach((b) => b.setAttribute("aria-current", "page"));
    ({ rooms: renderRooms, reservations: renderReservations, shifts: renderShifts, team: renderTeam })[view]();
  }

  // ================================================================ HABITACIONES
  function renderRooms() {
    const views = data.rooms.map((r) => ({ room: r, v: roomView(r) }));
    const count = (c) => views.filter((x) => x.v.cls === c).length;
    const cashToday = data.payments.filter((p) => new Date(p.at) >= startOfToday()).reduce((s, p) => s + Number(p.amount), 0);
    const late = views.filter((x) => x.v.late);
    const pending = data.reservations.filter((r) => r.status === "pendiente").length;
    const arriving = arrivingToday().filter((r) => !r.room_number);
    const stat = (n, label, color) => `<div class="stat"><b>${n}</b><span><i style="background:var(${color})"></i>${label}</span></div>`;

    const floors = [...new Set(H.rooms.map((t) => t.floor))].sort();
    $("#view").innerHTML = `
      <div class="stats">
        ${stat(count("free"), "Libres", "--free")}
        ${stat(count("night"), "Noche", "--night-st")}
        ${stat(count("pass"), "Pase", "--pass")}
        ${stat(count("arrive"), "Llegan hoy", "--arrive")}
        ${stat(count("clean"), "Limpieza", "--clean")}
        ${stat(count("out"), "Fuera", "--out")}
        <div class="stat cash"><b>${money(cashToday)}</b><span>Cobrado hoy</span></div>
      </div>
      ${!myShift() ? `<div class="alert warn"><span>No ha iniciado su turno.</span><button class="btn btn-sm btn-dark" data-act="shift">Iniciar turno</button></div>` : ""}
      ${late.length ? `<div class="alert warn"><span><b>Tiempo vencido:</b> ${late.map((x) => esc(x.room.number)).join(", ")}</span></div>` : ""}
      ${pending ? `<div class="alert pending"><span><b>${pending}</b> ${pending === 1 ? "solicitud nueva" : "solicitudes nuevas"} del sitio web</span><button class="btn btn-sm btn-primary" data-goto="pendiente">Ver</button></div>` : ""}
      ${arriving.length ? `<div class="alert"><span><b>Llegan hoy sin habitación asignada:</b> ${arriving.map((r) => `${esc(r.guest_name)} (${esc(tierName(r.room_tier))})`).join(", ")}</span><button class="btn btn-sm btn-ghost" data-goto="confirmada">Ver</button></div>` : ""}
      <div class="legend">
        <span><i style="background:var(--free)"></i>Libre</span>
        <span><i style="background:var(--night-st)"></i>Ocupada (noche)</span>
        <span><i style="background:var(--pass)"></i>Pase por horas</span>
        <span><i style="background:var(--arrive)"></i>Reservada, llega hoy</span>
        <span><i style="background:var(--clean)"></i>Limpieza</span>
        <span><i style="background:var(--out)"></i>Fuera de servicio</span>
      </div>
      ${floors.map((f) => {
        const tiers = H.rooms.filter((t) => t.floor === f);
        const list = views.filter((x) => tiers.some((t) => t.id === x.room.tier));
        return `<section class="floor">
          <div class="floor-head"><h2>${f === 1 ? "Primer nivel" : f === 2 ? "Segundo nivel" : `Nivel ${f}`}</h2>
          <span class="muted small">${tiers.map((t) => esc(tierName(t.id))).join(", ")} · ${list.filter((x) => x.v.cls === "free").length} de ${list.length} libres</span></div>
          <div class="board">${list.map(({ room, v }) => `
            <button type="button" class="room s-${v.cls}${v.late ? " late" : ""}" data-room="${esc(room.number)}" aria-label="Habitación ${esc(room.number)}: ${esc(v.label)}">
              <span class="tier">${room.tier === "premium" ? "PREM" : "EST"}</span>
              <span class="num">${esc(room.number)}</span>
              <span class="st">${esc(v.label)}</span>
              ${v.who ? `<span class="who">${esc(v.who)}</span>` : ""}
              ${v.when ? `<span class="when">${esc(v.when)}</span>` : ""}
            </button>`).join("")}
          </div></section>`;
      }).join("")}`;
  }

  function roomModal(number) {
    const room = data.rooms.find((r) => r.number === number);
    const v = roomView(room);
    const title = `Habitación ${room.number} · ${tierName(room.tier)}`;
    let html = v.late ? chip("late", "Tiempo vencido") : chip(v.cls, v.label);

    if (v.stay) {
      const r = v.stay;
      const paid = paidFor(r.id);
      html += factsHtml([
        ["Huésped", esc(r.guest_name)],
        r.guest_phone && ["Teléfono", `<a href="tel:${esc(r.guest_phone)}">${esc(r.guest_phone)}</a>`],
        ["Tipo", esc(stayText(r))],
        ["Entró", `${esc(fmtWhen(r.checked_in_at))} · ${esc(personName(r.checked_in_by))}`],
        [r.stay_type === "pase" ? "Termina" : "Sale", `${esc(fmtWhen(stayEnd(r)))}${v.late ? ` <span class="warn-text">(vencido)</span>` : ""}`],
        ["Total", money(r.total)],
        ["Pagado", paid >= r.total ? `<span class="ok-text">${money(paid)}</span>` : `${money(paid)} <span class="warn-text">· falta ${money(r.total - paid)}</span>`],
        r.notes && ["Notas", esc(r.notes)],
      ]);
      html += `<div class="modal-actions">
        <button class="btn btn-primary" data-m="checkout">Registrar salida</button>
        <button class="btn btn-ghost" data-m="extend">${r.stay_type === "pase" ? `Extender ${PH} horas más` : "Extender una noche"}</button>
        ${waPhone(r.guest_phone) ? `<a class="btn btn-ghost" href="https://wa.me/${waPhone(r.guest_phone)}" target="_blank" rel="noopener"><svg><use href="#i-whatsapp"/></svg>WhatsApp</a>` : ""}
      </div>`;
    } else if (room.state === "limpieza") {
      html += `<p class="muted" style="margin-bottom:12px">Marque la habitación como lista cuando esté limpia.</p>
        <div class="modal-actions">
          <button class="btn btn-primary" data-m="ready">Lista, marcar libre</button>
          <button class="btn btn-ghost" data-m="out">Fuera de servicio</button>
        </div>`;
    } else if (room.state === "fuera") {
      html += factsHtml([["Motivo", esc(room.note || "—")]]);
      html += `<div class="modal-actions"><button class="btn btn-primary" data-m="ready">Volver a servicio</button></div>`;
    } else {
      if (v.arriving) {
        html += factsHtml([["Reservada para", esc(v.arriving.guest_name)], ["Detalle", esc(stayText(v.arriving))], ["Llegada", esc(v.arriving.arrival || "—")]]);
      }
      html += `<div class="modal-actions">
        ${v.arriving ? `<button class="btn btn-primary" data-m="arrive">Registrar llegada de ${esc(v.arriving.guest_name.split(" ")[0])}</button>` : ""}
        <button class="btn ${v.arriving ? "btn-ghost" : "btn-primary"}" data-m="walkin">Nueva entrada (sin reserva)</button>
        <button class="btn btn-ghost" data-m="clean">Marcar en limpieza</button>
        <button class="btn btn-ghost" data-m="out">Fuera de servicio</button>
      </div>`;
    }

    const body = openModal(title, html);
    body.addEventListener("click", (e) => {
      const b = e.target.closest("[data-m]");
      if (!b) return;
      const m = b.dataset.m;
      if (m === "checkout") checkoutModal(v.stay);
      if (m === "extend") extendModal(v.stay);
      if (m === "walkin") walkInModal(room);
      if (m === "arrive") checkInModal(v.arriving, room.number);
      if (m === "ready") act(async () => { await db.updateRoom(room.number, { state: "ok", note: null }); await db.log(`Marcó la ${room.number} como lista`); }, `Habitación ${room.number} lista`).then(closeModal);
      if (m === "clean") act(async () => { await db.updateRoom(room.number, { state: "limpieza" }); await db.log(`Puso la ${room.number} en limpieza`); }, `Habitación ${room.number} en limpieza`).then(closeModal);
      if (m === "out") outModal(room);
    });
  }

  function outModal(room) {
    const body = openModal(`Habitación ${room.number} fuera de servicio`, `
      <form id="f">
        <label class="field"><span>Motivo</span><input name="note" placeholder="Ej.: aire dañado, pintura…" required /></label>
        <button class="btn btn-dark btn-block" type="submit">Marcar fuera de servicio</button>
      </form>`);
    $("#f", body).addEventListener("submit", (e) => {
      e.preventDefault();
      const note = e.target.note.value.trim() || "Sin motivo";
      act(async () => { await db.updateRoom(room.number, { state: "fuera", note }); await db.log(`Puso la ${room.number} fuera de servicio: ${note}`); }, "Guardado").then(closeModal);
    });
  }

  // Entrada sin reserva (cliente que llega directo).
  function walkInModal(room) {
    const t = tier(room.tier);
    const body = openModal(`Entrada · Habitación ${room.number}`, `
      <form id="f">
        <div class="seg" role="group" aria-label="Tipo">
          <button type="button" data-type="pase" aria-pressed="true">Pase ${PH} h</button>
          <button type="button" data-type="noche" aria-pressed="false">Por noche</button>
        </div>
        <div class="field-row">
          <label class="field"><span id="qty-label">Pases</span><input name="qty" type="number" min="1" max="30" value="1" inputmode="numeric" /></label>
          <label class="field"><span>Personas</span><select name="adults">${Array.from({ length: t.maxGuests }, (_, i) => `<option ${i === 1 || t.maxGuests === 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Nombre del huésped <small class="muted">(opcional)</small></span><input name="name" autocomplete="off" /></label>
        <label class="field"><span>Teléfono <small class="muted">(opcional)</small></span><input name="phone" type="tel" inputmode="tel" /></label>
        <div class="total-line"><span id="calc"></span><b id="total"></b></div>
        <label class="field"><span>Cobrado ahora (efectivo)</span><input name="paid" type="number" min="0" step="50" inputmode="numeric" /></label>
        <button class="btn btn-primary btn-block" type="submit">Registrar entrada</button>
      </form>`);
    const f = $("#f", body);
    let type = "pase";
    const calc = () => {
      const q = Math.max(1, Number(f.qty.value) || 1);
      const unit = type === "pase" ? t.passPrice : t.price;
      const total = unit * q;
      $("#qty-label", body).textContent = type === "pase" ? `Pases (${PH} h c/u)` : "Noches";
      $("#calc", body).textContent = `${money(unit)} × ${q} ${type === "pase" ? (q === 1 ? "pase" : "pases") : (q === 1 ? "noche" : "noches")}`;
      $("#total", body).textContent = money(total);
      f.paid.value = total;
      return { q, total };
    };
    if (t.passPrice == null) { type = "noche"; $('[data-type="pase"]', body).disabled = true; }
    $$("[data-type]", body).forEach((b) => b.addEventListener("click", () => {
      type = b.dataset.type;
      $$("[data-type]", body).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      calc();
    }));
    $$("[data-type]", body).forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.type === type)));
    f.qty.addEventListener("input", calc);
    calc();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const { q, total } = calc();
      const paid = Math.max(0, Number(f.paid.value) || 0);
      const now = new Date();
      const name = f.name.value.trim() || "Cliente";
      const row = {
        code: newCode(), source: "llegada", stay_type: type, room_tier: room.tier, room_number: room.number,
        guest_name: name, guest_phone: f.phone.value.trim() || null, adults: Number(f.adults.value), kids: 0,
        check_in: todayIso(), check_out: type === "noche" ? addDaysIso(todayIso(), q) : null,
        pass_start: type === "pase" ? now.toISOString() : null,
        pass_end: type === "pase" ? new Date(now.getTime() + q * PH * 3600000).toISOString() : null,
        total, status: "en_curso", checked_in_at: now.toISOString(), checked_in_by: me.id, lang: "es",
      };
      act(async () => {
        const r = await db.addReservation(row);
        if (paid > 0) await db.addPayment(r.id, paid);
        await db.log(`Registró entrada en la ${room.number} (${type === "pase" ? `pase ${q * PH} h` : `${q} ${q === 1 ? "noche" : "noches"}`}${name !== "Cliente" ? `, ${name}` : ""}) · cobró ${money(paid)}`);
      }, `Entrada registrada en la ${room.number}`).then((ok) => ok && closeModal());
    });
  }

  // Llegada de una reserva: elegir habitación y cobrar.
  function checkInModal(r, preferRoom) {
    const busy = new Set(data.reservations.filter((x) => x.status === "en_curso").map((x) => x.room_number));
    const free = data.rooms.filter((x) => x.state === "ok" && !busy.has(x.number));
    free.sort((a, b) => (a.tier === r.room_tier ? 0 : 1) - (b.tier === r.room_tier ? 0 : 1) || a.number.localeCompare(b.number));
    const pick = preferRoom || (r.room_number && free.some((x) => x.number === r.room_number) ? r.room_number : (free.find((x) => x.tier === r.room_tier) || {}).number);
    const due = Math.max(0, r.total - paidFor(r.id));
    const body = openModal(`Llegada · ${r.guest_name}`, `
      ${factsHtml([["Reserva", `${esc(r.code)} · ${esc(tierName(r.room_tier))}`], ["Detalle", esc(stayText(r))], ["Total", money(r.total)]])}
      <form id="f">
        ${free.length ? `<label class="field"><span>Habitación</span><select name="room">${free.map((x) => `<option value="${esc(x.number)}" ${x.number === pick ? "selected" : ""}>${esc(x.number)} · ${esc(tierName(x.tier))}${x.tier !== r.room_tier ? " (otro tipo)" : ""}</option>`).join("")}</select></label>`
          : `<p class="warn-text" style="margin-bottom:12px">No hay habitaciones libres. Libere o limpie una primero.</p>`}
        <label class="field"><span>Cobrado ahora (efectivo)</span><input name="paid" type="number" min="0" step="50" value="${due}" inputmode="numeric" /></label>
        ${r.stay_type === "pase" ? `<p class="muted small" style="margin-bottom:12px">El pase de ${PH} horas empieza a contar desde ahora.</p>` : ""}
        <button class="btn btn-primary btn-block" type="submit" ${free.length ? "" : "disabled"}>Registrar llegada</button>
      </form>`);
    $("#f", body).addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const paid = Math.max(0, Number(f.paid.value) || 0);
      const now = new Date();
      const patch = { status: "en_curso", room_number: f.room.value, checked_in_at: now.toISOString(), checked_in_by: me.id };
      if (r.stay_type === "pase") {
        const hours = r.pass_start && r.pass_end ? (new Date(r.pass_end) - new Date(r.pass_start)) / 3600000 : PH;
        patch.pass_start = now.toISOString();
        patch.pass_end = new Date(now.getTime() + hours * 3600000).toISOString();
      }
      act(async () => {
        await db.updateReservation(r.id, patch);
        if (paid > 0) await db.addPayment(r.id, paid);
        await db.log(`Registró llegada de ${r.guest_name} en la ${f.room.value} · cobró ${money(paid)}`);
      }, `${r.guest_name} en la ${f.room.value}`).then((ok) => ok && closeModal());
    });
  }

  function checkoutModal(r) {
    const due = Math.max(0, r.total - paidFor(r.id));
    const body = openModal(`Salida · Habitación ${r.room_number}`, `
      ${factsHtml([["Huésped", esc(r.guest_name)], ["Total", money(r.total)], ["Pagado", money(paidFor(r.id))]])}
      <form id="f">
        ${due > 0 ? `<p class="warn-text" style="margin-bottom:8px">Falta cobrar ${money(due)}</p>` : `<p class="ok-text" style="margin-bottom:12px">Todo pagado.</p>`}
        ${due > 0 ? `<label class="field"><span>Cobrado ahora (efectivo)</span><input name="paid" type="number" min="0" step="50" value="${due}" inputmode="numeric" /></label>` : ""}
        <p class="muted small" style="margin-bottom:12px">La habitación pasará a limpieza.</p>
        <button class="btn btn-primary btn-block" type="submit">Registrar salida</button>
      </form>`);
    $("#f", body).addEventListener("submit", (e) => {
      e.preventDefault();
      const paid = e.target.paid ? Math.max(0, Number(e.target.paid.value) || 0) : 0;
      act(async () => {
        if (paid > 0) await db.addPayment(r.id, paid);
        await db.updateReservation(r.id, { status: "completada", checked_out_at: new Date().toISOString(), checked_out_by: me.id });
        await db.updateRoom(r.room_number, { state: "limpieza" });
        await db.log(`Registró salida de la ${r.room_number} (${r.guest_name})${paid ? ` · cobró ${money(paid)}` : ""}`);
      }, `Salida registrada. ${r.room_number} en limpieza`).then((ok) => ok && closeModal());
    });
  }

  function extendModal(r) {
    const t = tier(r.room_tier);
    const pass = r.stay_type === "pase";
    const add = pass ? t.passPrice : t.price;
    const body = openModal(`Extender · Habitación ${r.room_number}`, `
      ${factsHtml([["Ahora", esc(pass ? `Hasta ${fmtWhen(stayEnd(r))}` : `Sale ${fmtDay(r.check_out)}`)], ["Nuevo", esc(pass ? `Hasta ${fmtWhen(new Date(stayEnd(r).getTime() + PH * 3600000))}` : `Sale ${fmtDay(addDaysIso(r.check_out, 1))}`)], ["Costo", money(add)]])}
      <form id="f">
        <label class="field"><span>Cobrado ahora (efectivo)</span><input name="paid" type="number" min="0" step="50" value="${add}" inputmode="numeric" /></label>
        <button class="btn btn-primary btn-block" type="submit">Extender</button>
      </form>`);
    $("#f", body).addEventListener("submit", (e) => {
      e.preventDefault();
      const paid = Math.max(0, Number(e.target.paid.value) || 0);
      const patch = pass
        ? { pass_end: new Date(new Date(r.pass_end).getTime() + PH * 3600000).toISOString(), total: Number(r.total) + add }
        : { check_out: addDaysIso(r.check_out, 1), total: Number(r.total) + add };
      act(async () => {
        await db.updateReservation(r.id, patch);
        if (paid > 0) await db.addPayment(r.id, paid);
        await db.log(`Extendió la ${r.room_number} (${pass ? `+${PH} h` : "+1 noche"}) · cobró ${money(paid)}`);
      }, "Estancia extendida").then((ok) => ok && closeModal());
    });
  }

  // ================================================================ RESERVAS
  function renderReservations() {
    const groups = {
      pendiente: (r) => r.status === "pendiente",
      confirmada: (r) => r.status === "confirmada",
      en_curso: (r) => r.status === "en_curso",
      historial: (r) => ["completada", "cancelada", "no_llego"].includes(r.status),
    };
    const labels = { pendiente: "Pendientes", confirmada: "Próximas", en_curso: "En curso", historial: "Historial" };
    const q = resQuery.trim().toLowerCase();
    let list = data.reservations.filter(groups[resFilter])
      .filter((r) => !q || [r.guest_name, r.guest_phone, r.code, r.room_number].some((x) => String(x || "").toLowerCase().includes(q)));
    list = resFilter === "historial"
      ? list.sort((a, b) => String(b.checked_out_at || b.created_at).localeCompare(String(a.checked_out_at || a.created_at)))
      : list.sort((a, b) => a.check_in.localeCompare(b.check_in) || String(a.pass_start || "").localeCompare(String(b.pass_start || "")));

    $("#view").innerHTML = `
      <div class="view-head"><h1>Reservas</h1><button class="btn btn-primary btn-sm" data-act="new-res"><svg><use href="#i-plus"/></svg>Nueva reserva</button></div>
      <div class="seg seg-scroll" role="group" aria-label="Filtro">
        ${Object.keys(groups).map((k) => {
          const n = data.reservations.filter(groups[k]).length;
          return `<button type="button" data-filter="${k}" aria-pressed="${k === resFilter}">${labels[k]}${k !== "historial" && n ? ` (${n})` : ""}</button>`;
        }).join("")}
      </div>
      <input class="search" id="res-search" type="search" placeholder="Buscar nombre, teléfono o código" value="${esc(resQuery)}" />
      ${list.length ? `<div class="cards">${list.map(resCard).join("")}</div>`
        : `<div class="empty">${resFilter === "pendiente" ? "No hay solicitudes nuevas. Las reservas del sitio web aparecen aquí." : "No hay reservas aquí."}</div>`}`;
  }

  const statusLabel = { pendiente: "Pendiente", confirmada: "Confirmada", en_curso: "En curso", completada: "Completada", cancelada: "Cancelada", no_llego: "No llegó" };
  const sourceLabel = { web: "Sitio web", telefono: "Teléfono", llegada: "En persona" };

  function resCard(r) {
    const load = r.stay_type === "noche" && r.status === "pendiente" ? tierLoad(r.room_tier, r.check_in, r.check_out, r.id) : null;
    const wa = waPhone(r.guest_phone);
    const canArrive = r.status === "confirmada" && r.check_in <= todayIso();
    let actions = "";
    if (r.status === "pendiente") {
      actions = `<button class="btn btn-sm btn-primary" data-r="confirm" data-id="${r.id}">Confirmar</button>
        <button class="btn btn-sm btn-ghost" data-r="decline" data-id="${r.id}">Rechazar</button>`;
    } else if (r.status === "confirmada") {
      actions = `<button class="btn btn-sm btn-primary" data-r="arrive" data-id="${r.id}" ${canArrive ? "" : "disabled title=\"Todavía no es el día de llegada\""}>Registrar llegada</button>
        <button class="btn btn-sm btn-ghost" data-r="noshow" data-id="${r.id}">No llegó</button>
        <button class="btn btn-sm btn-ghost" data-r="cancel" data-id="${r.id}">Cancelar</button>`;
    } else if (r.status === "en_curso") {
      actions = `<button class="btn btn-sm btn-primary" data-room="${esc(r.room_number)}">Ver habitación ${esc(r.room_number)}</button>`;
    }
    if (wa && ["pendiente", "confirmada", "en_curso"].includes(r.status)) {
      actions += `<a class="btn btn-sm btn-ghost" href="https://wa.me/${wa}" target="_blank" rel="noopener" aria-label="WhatsApp"><svg><use href="#i-whatsapp"/></svg></a>`;
    }
    return `<article class="card">
      <div class="card-top">
        <div><h3>${esc(r.guest_name)}</h3><p class="meta">${esc(r.code)} · ${esc(sourceLabel[r.source] || r.source)}${r.created_by ? ` · ${esc(personName(r.created_by))}` : ""}</p></div>
        <span class="tag ${r.status}">${statusLabel[r.status]}</span>
      </div>
      <div class="btn-row"><span class="tag ${r.stay_type}">${r.stay_type === "pase" ? `Pase ${PH} h` : "Noche"}</span><span class="tag">${esc(tierName(r.room_tier))}${r.room_number ? ` · ${esc(r.room_number)}` : ""}</span>${r.source === "web" ? `<span class="tag web">Web</span>` : ""}</div>
      <dl class="facts">
        <dt>Fechas</dt><dd>${esc(stayText(r))}</dd>
        <dt>Personas</dt><dd>${r.adults} ${r.adults === 1 ? "adulto" : "adultos"}${r.kids ? `, ${r.kids} ${r.kids === 1 ? "niño" : "niños"}` : ""}</dd>
        ${r.guest_phone ? `<dt>Teléfono</dt><dd><a href="tel:${esc(r.guest_phone)}">${esc(r.guest_phone)}</a></dd>` : ""}
        ${r.arrival ? `<dt>Llegada</dt><dd>${esc(r.arrival)}</dd>` : ""}
        <dt>Total</dt><dd>${money(r.total)}${paidFor(r.id) ? ` · pagado ${money(paidFor(r.id))}` : ""}</dd>
        ${r.notes ? `<dt>Notas</dt><dd>${esc(r.notes)}</dd>` : ""}
        ${r.lang === "en" ? `<dt>Idioma</dt><dd>Inglés</dd>` : ""}
      </dl>
      ${load ? `<p class="${load.taken >= load.total ? "warn-text" : "muted small"}">${esc(tierName(r.room_tier))}: ${load.taken} de ${load.total} ya reservadas${load.taken >= load.total ? " · ¡sin cupo esas noches!" : ""}</p>` : ""}
      ${actions ? `<div class="btn-row">${actions}</div>` : ""}
    </article>`;
  }

  function confirmModal(r) {
    const load = r.stay_type === "noche" ? tierLoad(r.room_tier, r.check_in, r.check_out, r.id) : null;
    const rooms = data.rooms.filter((x) => x.tier === r.room_tier && x.state !== "fuera");
    const body = openModal(`Confirmar · ${r.guest_name}`, `
      ${factsHtml([["Reserva", `${esc(r.code)} · ${esc(tierName(r.room_tier))}`], ["Detalle", esc(stayText(r))], ["Total", money(r.total)], r.guest_phone && ["Teléfono", esc(r.guest_phone)]])}
      ${load ? `<p class="${load.taken >= load.total ? "warn-text" : "muted small"}" style="margin-bottom:12px">${load.taken} de ${load.total} habitaciones ${esc(tierName(r.room_tier).toLowerCase())} ya reservadas esas noches.</p>` : ""}
      <form id="f">
        <label class="field"><span>Habitación</span><select name="room"><option value="">Asignar al llegar</option>${rooms.map((x) => `<option value="${esc(x.number)}">${esc(x.number)}</option>`).join("")}</select></label>
        <button class="btn btn-primary btn-block" type="submit">Confirmar reserva</button>
      </form>`);
    $("#f", body).addEventListener("submit", async (e) => {
      e.preventDefault();
      const room = e.target.room.value || null;
      const ok = await act(async () => {
        await db.updateReservation(r.id, { status: "confirmada", room_number: room });
        await db.log(`Confirmó la reserva ${r.code} de ${r.guest_name}`);
      }, "Reserva confirmada");
      if (ok) afterStatusModal(r, "confirm");
    });
  }

  // Después de confirmar o rechazar: botón para avisarle al huésped por WhatsApp.
  function afterStatusModal(r, kind) {
    const link = waLink(r, kind);
    openModal(kind === "confirm" ? "Reserva confirmada" : "Solicitud rechazada", `
      <p style="margin-bottom:14px">${kind === "confirm" ? "Ahora avísele al huésped:" : "Avísele al huésped que no hay disponibilidad:"}</p>
      ${link ? `<a class="btn btn-wa btn-block" href="${esc(link)}" target="_blank" rel="noopener"><svg><use href="#i-whatsapp"/></svg>Enviar mensaje por WhatsApp</a>
        <p class="muted small" style="margin-top:10px">El mensaje ya va escrito${r.lang === "en" ? " en inglés" : ""}; solo tiene que enviarlo.</p>`
        : `<p class="muted">Este huésped no dejó un número de WhatsApp válido.</p>`}
      <button class="btn btn-ghost btn-block" style="margin-top:10px" data-close>Listo</button>`);
  }

  function newReservationModal() {
    const passSlots = [];
    for (let h = H.pass.firstStart; h <= H.pass.lastStart; h++) passSlots.push(h);
    const body = openModal("Nueva reserva (por teléfono)", `
      <form id="f">
        <div class="seg" role="group" aria-label="Tipo">
          <button type="button" data-type="noche" aria-pressed="true">Por noche</button>
          <button type="button" data-type="pase" aria-pressed="false">Pase ${PH} h</button>
        </div>
        <label class="field"><span>Tipo de habitación</span><select name="tier">${H.rooms.map((t) => `<option value="${t.id}">${esc(tierName(t.id))} (${t.numbers.length})</option>`).join("")}</select></label>
        <div class="field-row">
          <label class="field"><span>Fecha</span><input name="date" type="date" min="${todayIso()}" value="${todayIso()}" required /></label>
          <label class="field" data-for="noche"><span>Noches</span><input name="nights" type="number" min="1" max="30" value="1" inputmode="numeric" /></label>
          <label class="field" data-for="pase" hidden><span>Hora</span><select name="hour">${passSlots.map((h) => `<option value="${h}">${fmtHour(h)}</option>`).join("")}</select></label>
        </div>
        <label class="field"><span>Nombre</span><input name="name" required autocomplete="off" /></label>
        <div class="field-row">
          <label class="field"><span>Teléfono</span><input name="phone" type="tel" inputmode="tel" /></label>
          <label class="field"><span>Personas</span><input name="adults" type="number" min="1" max="8" value="2" inputmode="numeric" /></label>
        </div>
        <label class="field"><span>Notas <small class="muted">(opcional)</small></span><input name="notes" /></label>
        <p class="small" id="load" style="margin-bottom:8px"></p>
        <div class="total-line"><span id="calc"></span><b id="total"></b></div>
        <p class="form-error" id="err"></p>
        <button class="btn btn-primary btn-block" type="submit">Guardar reserva confirmada</button>
      </form>`);
    const f = $("#f", body);
    let type = "noche";
    const calc = () => {
      const t = tier(f.tier.value);
      const n = Math.max(1, Number(f.nights.value) || 1);
      const unit = type === "pase" ? t.passPrice : t.price;
      const total = type === "pase" ? unit : unit * n;
      $$("[data-for]", body).forEach((el) => { el.hidden = el.dataset.for !== type; });
      $("#calc", body).textContent = type === "pase" ? `Pase de ${PH} horas` : `${money(unit)} × ${n} ${n === 1 ? "noche" : "noches"}`;
      $("#total", body).textContent = unit == null ? "No disponible" : money(total);
      const el = $("#load", body);
      if (type === "noche" && f.date.value) {
        const load = tierLoad(t.id, f.date.value, addDaysIso(f.date.value, n));
        el.className = `small ${load.taken >= load.total ? "warn-text" : "muted"}`;
        el.textContent = `${load.taken} de ${load.total} ${tierName(t.id).toLowerCase()} ya reservadas esas noches.`;
      } else el.textContent = "";
      return { t, n, total, unit };
    };
    $$("[data-type]", body).forEach((b) => b.addEventListener("click", () => {
      type = b.dataset.type;
      $$("[data-type]", body).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      calc();
    }));
    f.addEventListener("input", calc);
    calc();
    f.addEventListener("submit", (e) => {
      e.preventDefault();
      const { t, n, total, unit } = calc();
      const name = f.name.value.trim();
      if (!name) { $("#err", body).textContent = "Escriba el nombre."; return; }
      if (unit == null) { $("#err", body).textContent = "Esa habitación no se ofrece por horas."; return; }
      const start = type === "pase" ? parseDay(f.date.value) : null;
      if (start) start.setHours(Number(f.hour.value), 0, 0, 0);
      const row = {
        code: newCode(), source: "telefono", stay_type: type, room_tier: t.id, room_number: null,
        guest_name: name, guest_phone: f.phone.value.trim() || null, adults: Math.max(1, Number(f.adults.value) || 1), kids: 0,
        check_in: f.date.value, check_out: type === "noche" ? addDaysIso(f.date.value, n) : null,
        pass_start: start ? start.toISOString() : null, pass_end: start ? new Date(start.getTime() + PH * 3600000).toISOString() : null,
        notes: f.notes.value.trim() || null, total, status: "confirmada", lang: "es",
      };
      act(async () => {
        await db.addReservation(row);
        await db.log(`Creó la reserva ${row.code} de ${name} (${type === "pase" ? "pase" : `${n} ${n === 1 ? "noche" : "noches"}`})`);
      }, "Reserva guardada").then((ok) => { if (ok) { resFilter = "confirmada"; closeModal(); render(); } });
    });
  }

  function setStatus(r, status, text) {
    return act(async () => {
      await db.updateReservation(r.id, { status });
      await db.log(`${text} ${r.code} de ${r.guest_name}`);
    }, "Guardado");
  }

  // ================================================================ TURNOS
  function renderShifts() {
    const s = myShift();
    const isAdmin = me.role === "admin";
    const cashIn = (userId, from, to) => data.payments
      .filter((p) => p.user_id === userId && new Date(p.at) >= new Date(from) && (!to || new Date(p.at) <= new Date(to)))
      .reduce((sum, p) => sum + Number(p.amount), 0);
    const history = data.shifts.filter((x) => isAdmin || x.user_id === me.id);
    const open = openShifts();

    $("#view").innerHTML = `
      <div class="view-head"><h1>Turnos</h1></div>
      <section class="panel">
        <div class="my-shift">
          <div>
            <span class="muted small">${s ? `En turno desde ${esc(fmtTime(s.started_at))}` : "Usted está fuera de turno"}</span>
            <b>${s ? esc(fmtDur(Date.now() - new Date(s.started_at))) : "—"}</b>
            ${s ? `<span class="small">Cobrado en este turno: <b style="display:inline;font-size:1rem">${money(cashIn(me.id, s.started_at))}</b></span>` : ""}
          </div>
          <button class="btn ${s ? "btn-dark" : "btn-primary"}" data-act="shift">${s ? "Terminar turno" : "Iniciar turno"}</button>
        </div>
      </section>
      <section class="panel">
        <h2>Quién está trabajando</h2>
        <div class="people">${data.profiles.filter((p) => p.active).map((p) => {
          const o = open.find((x) => x.user_id === p.id);
          return `<div class="person"><span class="dot ${o ? "on" : ""}"></span><span class="avatar">${esc(initials(p.name))}</span>
            <div class="grow"><b>${esc(p.name)}</b><div class="muted small">${o ? `Desde ${esc(fmtWhen(o.started_at))} · ${esc(fmtDur(Date.now() - new Date(o.started_at)))}` : "Fuera de turno"}</div></div>
            ${o && isAdmin && p.id !== me.id ? `<button class="btn btn-sm btn-ghost" data-endshift="${o.id}">Cerrar turno</button>` : ""}</div>`;
        }).join("")}</div>
      </section>
      <section class="panel">
        <h2>${isAdmin ? "Turnos de los últimos 7 días" : "Mis turnos de los últimos 7 días"}</h2>
        ${history.length ? `<div class="table-wrap"><table>
          <thead><tr><th>Persona</th><th>Día</th><th>Entrada</th><th>Salida</th><th class="num">Horas</th><th class="num">Cobrado</th></tr></thead>
          <tbody>${history.map((x) => `<tr>
            <td>${esc(personName(x.user_id))}</td>
            <td>${esc(new Date(x.started_at).toLocaleDateString(LOC, { weekday: "short", day: "numeric", month: "short" }))}</td>
            <td>${esc(fmtTime(x.started_at))}</td>
            <td>${x.ended_at ? esc(fmtWhen(x.ended_at)) : `<span class="ok-text">En turno</span>`}</td>
            <td class="num">${((new Date(x.ended_at || Date.now()) - new Date(x.started_at)) / 3600000).toFixed(1)}</td>
            <td class="num">${money(cashIn(x.user_id, x.started_at, x.ended_at))}</td></tr>`).join("")}
          </tbody></table></div>` : `<p class="muted">Todavía no hay turnos.</p>`}
      </section>`;
  }

  async function toggleShift() {
    const s = myShift();
    if (s) {
      if (!confirm(`¿Terminar su turno? Duración: ${fmtDur(Date.now() - new Date(s.started_at))}.`)) return;
      await act(async () => { await db.endShift(s.id); await db.log("Terminó su turno"); }, "Turno terminado");
    } else {
      await act(async () => { await db.startShift(); await db.log("Inició su turno"); }, "Turno iniciado");
    }
  }

  // ================================================================ EQUIPO
  function renderTeam() {
    const isAdmin = me.role === "admin";
    $("#view").innerHTML = `
      <div class="view-head"><h1>Equipo</h1>${isAdmin ? `<button class="btn btn-primary btn-sm" data-act="new-user"><svg><use href="#i-plus"/></svg>Crear cuenta</button>` : ""}</div>
      <section class="panel">
        <h2>Personal</h2>
        <div class="people">${data.profiles.map((p) => `
          <div class="person"><span class="avatar">${esc(initials(p.name))}</span>
            <div class="grow"><b>${esc(p.name)}</b>${p.id === me.id ? ` <span class="muted small">(usted)</span>` : ""}
              <div class="muted small">Usuario: ${esc(p.username)} · ${p.role === "admin" ? "Administrador" : "Personal"}${p.active ? "" : " · <b>inactiva</b>"}</div></div>
            ${isAdmin && p.id !== me.id ? `<div class="person-ctl">
              <select class="btn btn-sm btn-ghost" data-role="${p.id}" aria-label="Rol de ${esc(p.name)}">
                <option value="staff" ${p.role === "staff" ? "selected" : ""}>Personal</option>
                <option value="admin" ${p.role === "admin" ? "selected" : ""}>Administrador</option>
              </select>
              <button class="switch" role="switch" aria-checked="${p.active}" data-active="${p.id}" aria-label="Cuenta activa de ${esc(p.name)}" title="${p.active ? "Activa" : "Inactiva"}"></button></div>` : ""}
          </div>`).join("")}
        </div>
        ${isAdmin ? `<p class="muted small" style="margin-top:10px">Desactive una cuenta para quitarle el acceso sin borrar su historial.</p>` : ""}
      </section>
      <section class="panel">
        <h2>Mi cuenta</h2>
        <p class="muted small" style="margin-bottom:10px">${esc(me.name)} · usuario <b>${esc(me.username)}</b></p>
        <button class="btn btn-ghost btn-sm" data-act="password">Cambiar mi contraseña</button>
      </section>
      <section class="panel">
        <h2>Actividad reciente</h2>
        ${data.activity.length ? `<ul class="feed">${data.activity.map((a) => `<li><time>${esc(fmtWhen(a.at))}</time><span><b>${esc(personName(a.user_id))}</b> ${esc(a.text.charAt(0).toLowerCase() + a.text.slice(1))}</span></li>`).join("")}</ul>` : `<p class="muted">Sin actividad todavía.</p>`}
      </section>`;
  }

  function newUserModal() {
    const body = openModal("Crear cuenta", `
      <form id="f" autocomplete="off">
        <label class="field"><span>Nombre</span><input name="name" placeholder="Luis" required /></label>
        <label class="field"><span>Usuario (para entrar)</span><input name="username" placeholder="luis" autocapitalize="none" required /></label>
        <label class="field"><span>Contraseña (mínimo 6)</span><input name="password" type="text" minlength="6" required /></label>
        <label class="field"><span>Rol</span><select name="role"><option value="staff">Personal</option><option value="admin">Administrador</option></select></label>
        <p class="form-error" id="err"></p>
        <button class="btn btn-primary btn-block" type="submit">Crear cuenta</button>
        <p class="muted small" style="margin-top:10px">Entréguele el usuario y la contraseña a la persona. Puede cambiar la contraseña después en "Mi cuenta".</p>
      </form>`);
    $("#f", body).addEventListener("submit", (e) => {
      e.preventDefault();
      const f = e.target;
      const name = f.name.value.trim();
      const username = f.username.value.trim().toLowerCase().replace(/\s+/g, "");
      const password = f.password.value;
      if (!name || !/^[a-z0-9._-]{2,}$/.test(username)) { $("#err", body).textContent = "Use un usuario sin espacios ni acentos (ej.: luis)."; return; }
      if (password.length < 6) { $("#err", body).textContent = "La contraseña necesita al menos 6 caracteres."; return; }
      act(async () => {
        await db.createAccount({ username, name, password, role: f.role.value });
        await db.log(`Creó la cuenta de ${name} (${username})`);
      }, `Cuenta de ${name} creada`).then((ok) => ok && closeModal());
    });
  }

  function passwordModal() {
    const body = openModal("Cambiar contraseña", `
      <form id="f">
        <label class="field"><span>Nueva contraseña (mínimo 6)</span><input name="p1" type="password" autocomplete="new-password" required /></label>
        <label class="field"><span>Repítala</span><input name="p2" type="password" autocomplete="new-password" required /></label>
        <p class="form-error" id="err"></p>
        <button class="btn btn-primary btn-block" type="submit">Guardar</button>
      </form>`);
    $("#f", body).addEventListener("submit", (e) => {
      e.preventDefault();
      const { p1, p2 } = e.target;
      if (p1.value.length < 6) { $("#err", body).textContent = "Mínimo 6 caracteres."; return; }
      if (p1.value !== p2.value) { $("#err", body).textContent = "Las contraseñas no coinciden."; return; }
      act(() => db.changePassword(p1.value), "Contraseña cambiada").then((ok) => ok && closeModal());
    });
  }

  // ================================================================ sesión y eventos
  function showLogin() {
    $("#app").hidden = true;
    $("#login").hidden = false;
    $("#demo-hint").hidden = !db.demo;
  }

  async function showApp() {
    view = "rooms";
    resFilter = "pendiente";
    resQuery = "";
    $("#login").hidden = true;
    $("#app").hidden = false;
    $("#demo-bar").hidden = !db.demo;
    await refresh();
  }

  async function logout(msg) {
    await db.signOut();
    me = null;
    closeModal();
    showLogin();
    if (msg) $("#login-error").textContent = msg;
  }

  function bind() {
    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      const btn = $("button[type=submit]", f);
      btn.disabled = true;
      $("#login-error").textContent = "";
      try {
        me = await db.signIn(f.username.value, f.password.value);
        f.reset();
        await showApp();
      } catch (err) {
        $("#login-error").textContent = err.message;
      } finally {
        btn.disabled = false;
      }
    });

    $("#logout").addEventListener("click", () => logout());
    $("#shift-pill").addEventListener("click", toggleShift);
    $("#demo-reset").addEventListener("click", () => {
      if (confirm("¿Borrar los cambios y volver a los datos de ejemplo?")) { db.reset(); refresh(); }
    });

    $$(".tabs button").forEach((b) => b.addEventListener("click", () => { view = b.dataset.view; render(); window.scrollTo(0, 0); }));

    $("#modal-close").addEventListener("click", closeModal);
    $("#modal-backdrop").addEventListener("click", closeModal);
    $("#modal-body").addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal").hidden) closeModal(); });

    $("#view").addEventListener("click", (e) => {
      const el = e.target.closest("[data-room], [data-act], [data-goto], [data-filter], [data-r], [data-endshift], [data-active]");
      if (!el) return;
      if (el.dataset.room) return roomModal(el.dataset.room);
      if (el.dataset.goto) { view = "reservations"; resFilter = el.dataset.goto; return render(); }
      if (el.dataset.filter) { resFilter = el.dataset.filter; return render(); }
      if (el.dataset.endshift) {
        const s = data.shifts.find((x) => String(x.id) === el.dataset.endshift);
        if (s && confirm(`¿Cerrar el turno de ${personName(s.user_id)}?`)) {
          act(async () => { await db.endShift(s.id); await db.log(`Cerró el turno de ${personName(s.user_id)}`); }, "Turno cerrado");
        }
        return;
      }
      if (el.dataset.active) {
        const p = person(el.dataset.active);
        const on = !p.active;
        return act(async () => { await db.updateProfile(p.id, { active: on }); await db.log(`${on ? "Activó" : "Desactivó"} la cuenta de ${p.name}`); }, on ? "Cuenta activada" : "Cuenta desactivada");
      }
      if (el.dataset.r) {
        const r = data.reservations.find((x) => String(x.id) === el.dataset.id);
        const a = el.dataset.r;
        if (a === "confirm") return confirmModal(r);
        if (a === "arrive") return checkInModal(r);
        if (a === "decline" && confirm(`¿Rechazar la solicitud de ${r.guest_name}?`)) {
          return setStatus(r, "cancelada", "Rechazó la solicitud").then((ok) => ok && afterStatusModal(r, "decline"));
        }
        if (a === "cancel" && confirm(`¿Cancelar la reserva de ${r.guest_name}?`)) return setStatus(r, "cancelada", "Canceló la reserva");
        if (a === "noshow" && confirm(`¿Marcar que ${r.guest_name} no llegó?`)) return setStatus(r, "no_llego", "Marcó como no llegó la reserva");
        return;
      }
      const a = el.dataset.act;
      if (a === "shift") return toggleShift();
      if (a === "new-res") return newReservationModal();
      if (a === "new-user") return newUserModal();
      if (a === "password") return passwordModal();
    });

    $("#view").addEventListener("input", (e) => {
      if (e.target.id === "res-search") {
        resQuery = e.target.value;
        const pos = e.target.selectionStart;
        render();
        const s = $("#res-search");
        s.focus();
        s.setSelectionRange(pos, pos);
      }
    });

    $("#view").addEventListener("change", (e) => {
      const sel = e.target.closest("[data-role]");
      if (!sel) return;
      const p = person(sel.dataset.role);
      act(async () => { await db.updateProfile(p.id, { role: sel.value }); await db.log(`Cambió el rol de ${p.name} a ${sel.value === "admin" ? "administrador" : "personal"}`); }, "Rol actualizado");
    });
  }

  async function boot() {
    bind();
    try {
      db = await YalumaStore.get();
    } catch (e) {
      console.error(e);
      $("#login").hidden = false;
      $("#login-error").textContent = "No se pudo conectar con la base de datos. Revise la conexión a internet.";
      return;
    }
    let refreshing = null;
    const soon = () => { clearTimeout(refreshing); refreshing = setTimeout(() => { if (me) refresh().catch(console.error); }, 300); };
    db.onChange(soon);
    setInterval(() => { if (me && $("#modal").hidden) render(); }, 30000); // relojes y tiempos vencidos
    setInterval(() => { if (me) refresh().catch(console.error); }, 90000); // respaldo por si falla el tiempo real

    try { me = await db.session(); } catch { me = null; }
    if (me && me.active) await showApp(); else showLogin();
  }

  boot();
})();
