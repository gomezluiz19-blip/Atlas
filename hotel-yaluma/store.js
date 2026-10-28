/* Hotel Yaluma: datos compartidos entre el sitio público y el panel del personal.
 *
 * Si config.js tiene los datos de Supabase, todo se guarda allí (en línea,
 * compartido entre todos los teléfonos). Si no, se usa un MODO DEMOSTRACIÓN
 * que guarda los datos solo en este navegador, con datos de ejemplo.
 *
 * Las dos versiones tienen exactamente las mismas funciones.
 */
window.YalumaStore = (() => {
  "use strict";

  const H = window.HOTEL;
  const configured = !!(H.supabase && H.supabase.url && H.supabase.anonKey);
  let ready = null;

  const allRooms = () => H.rooms.flatMap((t) => t.numbers.map((n) => ({ number: n, tier: t.id, floor: t.floor, state: "ok", note: null })));
  const cleanUser = (u) => String(u || "").trim().toLowerCase().replace(/\s+/g, "");

  // ================================================================ Supabase
  async function supabaseStore() {
    const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
    const sb = createClient(H.supabase.url, H.supabase.anonKey);
    const emailOf = (u) => `${cleanUser(u)}@${H.staffEmailDomain}`;
    const ok = ({ data, error }) => {
      if (error) throw new Error(error.message);
      return data;
    };
    let me = null;

    async function loadMe() {
      const { data } = await sb.auth.getSession();
      if (!data.session) return (me = null);
      me = ok(await sb.from("profiles").select("*").eq("id", data.session.user.id).single());
      return me;
    }

    return {
      demo: false,
      me: () => me,
      async session() { return loadMe(); },
      async signIn(username, password) {
        const { error } = await sb.auth.signInWithPassword({ email: emailOf(username), password });
        if (error) throw new Error("Usuario o contraseña incorrectos.");
        const p = await loadMe();
        if (!p || !p.active) {
          await sb.auth.signOut();
          me = null;
          throw new Error("Su cuenta todavía no está activa. Pídale al administrador que la active.");
        }
        return p;
      },
      async signOut() { await sb.auth.signOut(); me = null; },
      async changePassword(password) { ok(await sb.auth.updateUser({ password })); },
      async createAccount({ username, name, password, role }) {
        // Un cliente aparte, para no cerrar la sesión del administrador.
        const side = createClient(H.supabase.url, H.supabase.anonKey, {
          auth: { persistSession: false, autoRefreshToken: false, storageKey: "yaluma-alta" },
        });
        const { data, error } = await side.auth.signUp({
          email: emailOf(username), password, options: { data: { username: cleanUser(username), name } },
        });
        if (error) throw new Error(error.message.includes("registered") ? "Ese usuario ya existe." : error.message);
        if (!data.user) throw new Error("No se pudo crear la cuenta.");
        ok(await sb.from("profiles").update({ role, active: true }).eq("id", data.user.id));
      },
      async profiles() { return ok(await sb.from("profiles").select("*").order("name")); },
      async updateProfile(id, patch) { ok(await sb.from("profiles").update(patch).eq("id", id)); },

      async rooms() { return ok(await sb.from("rooms").select("*").order("number")); },
      async updateRoom(number, patch) { ok(await sb.from("rooms").update(patch).eq("number", number)); },

      async reservations() {
        const since = new Date(Date.now() - 45 * 864e5).toISOString().slice(0, 10);
        return ok(await sb.from("reservations").select("*")
          .or(`status.in.(pendiente,confirmada,en_curso),check_in.gte.${since}`)
          .order("check_in", { ascending: true }));
      },
      async addReservation(row) {
        return ok(await sb.from("reservations").insert({ ...row, created_by: me.id }).select().single());
      },
      async submitWebReservation(row) {
        ok(await sb.from("reservations").insert({ ...row, source: "web", status: "pendiente" }));
      },
      async updateReservation(id, patch) { ok(await sb.from("reservations").update(patch).eq("id", id)); },

      async payments(sinceIso) { return ok(await sb.from("payments").select("*").gte("at", sinceIso).order("at")); },
      async addPayment(reservation_id, amount) {
        ok(await sb.from("payments").insert({ reservation_id, amount, user_id: me.id }));
      },

      async shifts(sinceIso) {
        return ok(await sb.from("shifts").select("*").or(`ended_at.is.null,started_at.gte.${sinceIso}`).order("started_at", { ascending: false }));
      },
      async startShift() { ok(await sb.from("shifts").insert({ user_id: me.id })); },
      async endShift(id) { ok(await sb.from("shifts").update({ ended_at: new Date().toISOString() }).eq("id", id)); },

      async activity(limit = 80) { return ok(await sb.from("activity").select("*").order("at", { ascending: false }).limit(limit)); },
      async log(text) { ok(await sb.from("activity").insert({ text, user_id: me.id })); },

      onChange(cb) {
        sb.channel("yaluma").on("postgres_changes", { event: "*", schema: "public" }, () => cb()).subscribe();
      },
    };
  }

  // ================================================================ Demostración
  function demoStore() {
    const KEY = "yaluma.demo.v2";
    const SESSION = "yaluma.demo.session";
    let mem = null;
    const read = () => {
      try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* sin almacenamiento */ }
      return mem;
    };
    const write = (db) => {
      mem = db;
      try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* sin almacenamiento */ }
      listeners.forEach((f) => f());
    };
    const listeners = [];
    const now = () => new Date().toISOString();
    // Cambie este número para borrar los datos guardados en los navegadores (se conservan las contraseñas).
    const DATA_VERSION = 2;

    // Empieza vacío: 19 habitaciones libres, sin reservas, cobros, turnos ni actividad.
    function seed() {
      const P = (id, username, name, role) => ({ id, username, name, role, active: true, created_at: now() });
      return {
        version: DATA_VERSION,
        profiles: [P("u1", "lg", "LG", "admin"), P("u4", "fg", "FG", "admin"), P("u2", "luis", "Luis", "staff"), P("u3", "fanny", "Fanny", "staff")],
        // Sin contraseñas: cada persona elige la suya la primera vez que entra (ver setFirstPassword).
        passwords: {},
        rooms: allRooms(),
        reservations: [], payments: [], shifts: [], activity: [],
        seq: { profile: 4, reservation: 0, payment: 0, shift: 0, activity: 0 },
      };
    }

    let db = read();
    // Datos nuevos si no hay, o si cambiaron los números de habitación (se conservan las contraseñas).
    const sameRooms = db && db.rooms && db.rooms.length === allRooms().length
      && allRooms().every((r) => db.rooms.some((x) => x.number === r.number));
    if (!sameRooms || db.version !== DATA_VERSION) {
      const keep = (db && db.passwords) || {};
      const people = db && db.profiles; // cuentas creadas en el panel
      db = seed();
      db.passwords = keep;
      if (people) { db.profiles = people; db.seq.profile = Math.max(4, ...people.map((p) => Number(String(p.id).slice(1)) || 0)); }
      write(db);
    }
    // Si cambian los tipos de habitación en config.js, actualizarlos sin borrar los datos (ni las contraseñas).
    allRooms().forEach((r) => {
      const cur = db.rooms.find((x) => x.number === r.number);
      if (cur && (cur.tier !== r.tier || cur.floor !== r.floor)) { cur.tier = r.tier; cur.floor = r.floor; }
    });
    write(db);
    const load = () => (db = read() || db);
    const save = () => write(db);
    const clone = (x) => JSON.parse(JSON.stringify(x));
    const meId = () => { try { return localStorage.getItem(SESSION); } catch { return null; } };
    const me = () => { load(); return db.profiles.find((p) => p.id === meId()) || null; };

    window.addEventListener("storage", (e) => { if (e.key === KEY) { load(); listeners.forEach((f) => f()); } });

    // Las contraseñas del modo demostración nunca se guardan en texto: solo un
    // resumen PBKDF2 con sal, y solo en este navegador. (En Supabase las guarda el servidor.)
    const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
    async function digest(password, saltB64) {
      if (!window.crypto || !crypto.subtle) throw new Error("Este navegador no permite guardar contraseñas de forma segura.");
      const salt = saltB64 ? Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0)) : crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
      const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" }, key, 256);
      return { salt: b64(salt), hash: b64(bits) };
    }
    async function checkPassword(u, password) {
      const rec = db.passwords[u];
      if (!rec || !rec.salt) return false;
      return (await digest(password, rec.salt)).hash === rec.hash;
    }

    return {
      demo: true,
      me,
      async session() { return me(); },
      async signIn(username, password) {
        load();
        const u = cleanUser(username);
        const p = db.profiles.find((x) => x.username === u);
        if (!p || !(await checkPassword(u, password))) throw new Error("Usuario o contraseña incorrectos.");
        if (!p.active) throw new Error("Su cuenta todavía no está activa. Pídale al administrador que la active.");
        try { localStorage.setItem(SESSION, p.id); } catch { /* sin almacenamiento */ }
        return p;
      },
      async signOut() { try { localStorage.removeItem(SESSION); } catch { /* sin almacenamiento */ } },
      async changePassword(password) { const h = await digest(password); load(); db.passwords[me().username] = h; save(); },
      // Primera vez: la cuenta existe pero todavía no tiene contraseña.
      async needsPassword(username) {
        load();
        const u = cleanUser(username);
        return db.profiles.some((p) => p.username === u) && !db.passwords[u];
      },
      async setFirstPassword(username, password) {
        const u = cleanUser(username);
        const h = await digest(password);
        load();
        if (db.passwords[u]) throw new Error("Esta cuenta ya tiene contraseña.");
        db.passwords[u] = h;
        save();
      },
      async createAccount({ username, name, password, role }) {
        load();
        const u = cleanUser(username);
        if (db.profiles.some((p) => p.username === u)) throw new Error("Ese usuario ya existe.");
        const h = await digest(password);
        db.profiles.push({ id: "u" + ++db.seq.profile, username: u, name, role, active: true, created_at: now() });
        db.passwords[u] = h;
        save();
      },
      async profiles() { load(); return clone(db.profiles); },
      async updateProfile(id, patch) { load(); Object.assign(db.profiles.find((p) => p.id === id), patch); save(); },

      async rooms() { load(); return clone(db.rooms); },
      async updateRoom(number, patch) { load(); Object.assign(db.rooms.find((r) => r.number === number), patch); save(); },

      async reservations() { load(); return clone(db.reservations); },
      async addReservation(row) {
        load();
        const r = { id: ++db.seq.reservation, created_at: now(), created_by: me() && me().id, ...row };
        db.reservations.push(r);
        save();
        return clone(r);
      },
      async submitWebReservation(row) {
        load();
        db.reservations.push({ id: ++db.seq.reservation, created_at: now(), created_by: null, room_number: null, ...row, source: "web", status: "pendiente" });
        save();
      },
      async updateReservation(id, patch) { load(); Object.assign(db.reservations.find((r) => r.id === id), patch); save(); },

      async payments(sinceIso) { load(); return clone(db.payments.filter((p) => p.at >= sinceIso)); },
      async addPayment(reservation_id, amount) {
        load();
        db.payments.push({ id: ++db.seq.payment, reservation_id, amount, at: now(), user_id: me().id });
        save();
      },

      async shifts(sinceIso) {
        load();
        return clone(db.shifts.filter((s) => !s.ended_at || s.started_at >= sinceIso).sort((a, b) => b.started_at.localeCompare(a.started_at)));
      },
      async startShift() { load(); db.shifts.push({ id: ++db.seq.shift, user_id: me().id, started_at: now(), ended_at: null }); save(); },
      async endShift(id) { load(); db.shifts.find((s) => s.id === id).ended_at = now(); save(); },

      async activity(limit = 80) { load(); return clone(db.activity.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit)); },
      async log(text) { load(); db.activity.push({ id: ++db.seq.activity, at: now(), user_id: me().id, text }); save(); },

      onChange(cb) { listeners.push(cb); },
      reset() { const keep = db.passwords, people = db.profiles; db = seed(); db.passwords = keep; db.profiles = people; save(); },
    };
  }

  return {
    configured,
    get() {
      if (!ready) ready = configured ? supabaseStore() : Promise.resolve(demoStore());
      return ready;
    },
  };
})();
