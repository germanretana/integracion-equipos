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
  if (typeof url === "string" && url.includes("/api/admin/")) {
    return localStorage.getItem(KEYS.adminToken);
  }
  return localStorage.getItem(KEYS.participantToken);
}

async function fetchJson(url, options = {}) {
  const token = getTokenForUrl(url);

  let res;
  try {
    res = await fetch(`${API_BASE}${url}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (e) {
    const err = new Error(
      "No se pudo conectar con el servidor. Verifique que el backend esté corriendo.",
    );
    err.cause = e;
    err.status = 0;
    throw err;
  }

  if (!res.ok) {
    let msg = "Error de red.";
    let data = null;
    try {
      const text = await res.text();
      data = safeJsonParse(text) ?? null;
      msg = data?.error || msg;
    } catch {
      // ignore
    }
    const err = new Error(msg);
    err.status = res.status;
    err.data = data; // <-- clave: missingIds, percent, etc.
    throw err;
  }

  const text = await res.text();
  if (!text) return null;
  return safeJsonParse(text) ?? text;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  logoutParticipant() {
    this.clearSession();
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

  logoutAdmin() {
    this.clearAdminSession();
  },

  /* ========= Logins ========= */
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

  /* ========= Forgot password ========= */
  async requestPasswordReset(email) {
    const emailNorm = String(email || "").trim().toLowerCase();
    if (!emailNorm) throw new Error("Debe ingresar un correo electrónico.");

    const USE_BACKEND_FORGOT =
      String(import.meta.env.VITE_USE_BACKEND_FORGOT).toLowerCase() === "true";

    if (USE_BACKEND_FORGOT) {
      return fetchJson("/api/app/request-password-reset", {
        method: "POST",
        body: JSON.stringify({ email: emailNorm }),
      });
    }

    await sleep(350);
    return { ok: true };
  },

  /* ========= Fetch wrapper ========= */
  fetch(url, options) {
    return fetchJson(url, options);
  },
};
