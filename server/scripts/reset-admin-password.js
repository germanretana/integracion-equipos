import "dotenv/config";
import bcrypt from "bcryptjs";
import { getPool, findAdminByEmailFromPg } from "../lib/pg.js";

/**
 * RESET ADMIN PASSWORD SCRIPT
 *
 * Purpose:
 *   Resets the password of an existing admin user in PostgreSQL.
 *
 * Usage:
 *   node server/scripts/reset-admin-password.js "name@example.com" "newPassword123"
 *
 * Example:
 *   node server/scripts/reset-admin-password.js "gretana@pricesmart.com" "NuevaClaveSegura456"
 *
 * What it does:
 *   1. Connects to PostgreSQL using DATABASE_URL
 *   2. Finds the admin by email
 *   3. Replaces password_hash with a new bcrypt hash
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

  const existing = await findAdminByEmailFromPg(email);
  if (!existing) {
    console.error(`No existe un admin con el correo: ${email}`);
    await getPool().end();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await getPool().query(
    `update admins set password_hash = $2 where email = lower($1)`,
    [email, passwordHash],
  );

  console.log("");
  console.log("Contraseña actualizada correctamente.");
  console.log(`Email: ${email}`);
  console.log("");

  await getPool().end();
}

main().catch(async (err) => {
  console.error("Error reseteando contraseña:", err);
  try {
    await getPool().end();
  } catch {}
  process.exit(1);
});
