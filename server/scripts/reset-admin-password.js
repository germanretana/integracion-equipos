import bcrypt from "bcryptjs";
import { readDb, writeDb } from "../lib/db.js";

/**
 * RESET ADMIN PASSWORD SCRIPT
 *
 * Purpose:
 *   Resets the password of an existing admin user.
 *
 * Usage:
 *   node server/scripts/reset-admin-password.js "name@example.com" "newPassword123"
 *
 * Example:
 *   node server/scripts/reset-admin-password.js "gretana@pricesmart.com" "NuevaClaveSegura456"
 *
 * What it does:
 *   1. Reads server/data/db.json
 *   2. Finds the admin by email
 *   3. Replaces passwordHash with a new bcrypt hash
 *
 * Notes:
 *   - Email is normalized to lowercase.
 *   - If the admin does not exist, the script stops without changing anything.
 *   - Run this from the project root.
 */

function normalizeEmail(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

async function main() {
  const [, , emailArg, passwordArg] = process.argv;

  const email = normalizeEmail(emailArg);
  const password = String(passwordArg || "");

  if (!email || !password) {
    console.log("");
    console.log("Uso:");
    console.log(
      '  node server/scripts/reset-admin-password.js "correo@dominio.com" "nuevoPassword"',
    );
    console.log("");
    console.log("Ejemplo:");
    console.log(
      '  node server/scripts/reset-admin-password.js "gretana@pricesmart.com" "NuevaClaveSegura456"',
    );
    console.log("");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("La contraseña debe tener al menos 6 caracteres.");
    process.exit(1);
  }

  const db = readDb();
  db.admins = Array.isArray(db.admins) ? db.admins : [];

  const admin = db.admins.find((a) => normalizeEmail(a.email) === email);
  if (!admin) {
    console.error(`No existe un admin con el correo: ${email}`);
    process.exit(1);
  }

  admin.passwordHash = await bcrypt.hash(password, 10);

  writeDb(db);

  console.log("");
  console.log("Contraseña actualizada correctamente.");
  console.log(`Email: ${email}`);
  console.log("");
}

main().catch((err) => {
  console.error("Error reseteando contraseña:", err);
  process.exit(1);
});
