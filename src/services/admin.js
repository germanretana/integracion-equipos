import { auth } from "./auth";

export async function adminLogin(email, password) {
  return auth.loginAdmin(email, password);
}

export async function adminFetch(url, options = {}) {
  return auth.fetch(url, options);
}
