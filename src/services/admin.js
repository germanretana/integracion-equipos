const ADMIN_TOKEN_KEY = "itss_admin_token_v1";
const ADMIN_USER_KEY = "itss_admin_user_v1";

function loadJson(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveJson(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

export const adminAuth = {
  getToken() {
    return localStorage.getItem(ADMIN_TOKEN_KEY);
  },

  getAdmin() {
    return loadJson(ADMIN_USER_KEY);
  },

  isLoggedIn() {
    return Boolean(localStorage.getItem(ADMIN_TOKEN_KEY));
  },

  async login(email, password) {
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "No se pudo iniciar sesión.");

    localStorage.setItem(ADMIN_TOKEN_KEY, data.token);
    saveJson(ADMIN_USER_KEY, data.admin);
    return data;
  },

  logout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    localStorage.removeItem(ADMIN_USER_KEY);
  }
};

export async function adminFetch(path, { method = "GET", body } = {}) {
  const token = adminAuth.getToken();
  const res = await fetch(path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

  // Si la sesión expiró, limpiamos token para forzar re-login
  if (res.status === 401) {
    adminAuth.logout();
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Error de servidor.");
  return data;
}
