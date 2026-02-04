const USE_MOCK = (import.meta.env.VITE_USE_MOCK || "true") === "true";
const API_BASE = import.meta.env.VITE_API_BASE || "";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getSession() {
  try {
    const raw = localStorage.getItem("auth_session");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setSession(session) {
  localStorage.setItem("auth_session", JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem("auth_session");
}

/** MOCK: email/password */
async function loginWithMock(email, password) {
  await sleep(500);

  const e = (email || "").trim();
  const p = (password || "").trim();

  if (!e.includes("@")) throw new Error("Ingrese un correo válido.");
  if (p.length < 6) throw new Error("Contraseña inválida (mínimo 6 caracteres).");

  // Opciones de mock:
  // - cualquier email válido + password >= 6 funciona
  // - si querés “demo” fijo: demo@germanretana.com / demo123
  if (e === "demo@germanretana.com" && p !== "demo123") {
    throw new Error("Credenciales inválidas.");
  }

  const session = {
    user: { name: "Usuario", email: e },
    token: "mock-token",
    createdAt: new Date().toISOString(),
  };

  setSession(session);
  return session;
}

/** REAL: email/password */
async function loginWithBackend(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    let msg = "No se pudo iniciar sesión.";
    try {
      const data = await res.json();
      msg = data?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  const session = await res.json(); // { user: {...}, token: "..." }
  setSession(session);
  return session;
}

async function requestResetWithMock(email) {
  await sleep(600);

  const e = (email || "").trim();
  if (!e.includes("@")) throw new Error("Ingrese un correo válido.");

  return { ok: true };
}

async function requestResetWithBackend(email) {
  const res = await fetch(`${API_BASE}/auth/forgot-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  if (!res.ok) {
    let msg = "No se pudo procesar la solicitud.";
    try {
      const data = await res.json();
      msg = data?.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return await res.json();
}

export const auth = {
  isMock: USE_MOCK,
  getSession,
  clearSession,

  login: async (email, password) => {
    return USE_MOCK ? loginWithMock(email, password) : loginWithBackend(email, password);
  },

  requestPasswordReset: async (email) => {
    return USE_MOCK ? requestResetWithMock(email) : requestResetWithBackend(email);
  },
};
