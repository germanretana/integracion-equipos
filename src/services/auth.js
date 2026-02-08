const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

const KEYS = {
  participantToken: "integracion.participant.token",
  participantSession: "integracion.participant.session",
  adminToken: "integracion.admin.token",
  adminSession: "integracion.admin.session",
};

function safeJsonParse(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function getTokenForUrl(url) {
  // Decide qué token usar en función del endpoint.
  // /api/admin/* -> admin token
  // /api/app/*   -> participant token
  if (typeof url === "string" && url.includes("/api/admin/")) {
    return localStorage.getItem(KEYS.adminToken);
  }
  return localStorage.getItem(KEYS.participantToken);
}

async function fetchJson(url, options = {}) {
  const token = getTokenForUrl(url);

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  // Manejo estándar de errores
  if (!res.ok) {
    let msg = "Error de red.";
    try {
      const data = await res.json();
      msg = data?.error || msg;
    } catch {
      // ignore
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }

  // Si no hay body JSON, devolver null
  const text = await res.text();
  if (!text) return null;
  return safeJsonParse(text) ?? text;
}

export const auth = {
  get isMock() {
    return String(import.meta.env.VITE_USE_MOCK).toLowerCase() === "true";
  },

  /* ========= Participant session ========= */
  getSession() {
    const raw = localStorage.getItem(KEYS.participantSession);
    return raw ? safeJsonParse(raw) : null;
  },

  setSession(session) {
    localStorage.setItem(KEYS.participantSession, JSON.stringify(session));
  },

  clearSession() {
    localStorage.removeItem(KEYS.participantToken);
    localStorage.removeItem(KEYS.participantSession);
  },

  /* ========= Admin session ========= */
  getAdminSession() {
    const raw = localStorage.getItem(KEYS.adminSession);
    return raw ? safeJsonParse(raw) : null;
  },

  setAdminSession(session) {
    localStorage.setItem(KEYS.adminSession, JSON.stringify(session));
  },

  clearAdminSession() {
    localStorage.removeItem(KEYS.adminToken);
    localStorage.removeItem(KEYS.adminSession);
  },

  /* ========= Logins ========= */

  // Mantengo auth.login() para no romper Login.jsx existente: esto es PARTICIPANTE.
  async login(email, password) {
    return this.loginParticipant(email, password);
  },

  async loginParticipant(email, password) {
    const data = await fetchJson("/api/app/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem(KEYS.participantToken, data.token);
    this.setSession({ participant: data.participant, process: data.process });

    return data;
  },

  // Alias por si ya existe en tu código
  async adminLogin(email, password) {
    return this.loginAdmin(email, password);
  },

  async loginAdmin(email, password) {
    const data = await fetchJson("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    localStorage.setItem(KEYS.adminToken, data.token);
    this.setAdminSession({ admin: data.admin });

    return data;
  },

  /* ========= Fetch wrapper ========= */
  fetch(url, options) {
    return fetchJson(url, options);
  },
};
