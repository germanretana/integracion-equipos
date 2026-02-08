const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:3001";

const SESSION_KEY = "app_session_v1";

function readSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
  } catch {
    return null;
  }
}

function writeSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export const auth = {
  isMock: false,

  getSession() {
    return readSession();
  },

  clearSession() {
    localStorage.removeItem(SESSION_KEY);
  },

  async login(email, password) {
    const res = await fetch(`${API_BASE}/api/app/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data?.error || "No se pudo iniciar sesión.");
    }

    const session = {
      token: data.token,
      participant: data.participant,
      process: data.process
    };

    writeSession(session);
    return session;
  },

  async fetch(path, options = {}) {
    const session = readSession();
    const token = session?.token;

    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      }
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Error de servidor.");
    return data;
  }
};
