/**
 * Shared email-format validation — single source of truth so the login screen
 * and the admin participant form never drift. Mirrors the original login check:
 * a non-empty local part, an "@", and a domain with a dot.
 */
export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}
