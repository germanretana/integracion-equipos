import "dotenv/config";
import bcrypt from "bcryptjs";
import { getPool, findAdminByEmailFromPg, insertAdminToPg } from "../lib/pg.js";

/**
 * CREATE ADMIN SCRIPT
 *
 * Purpose:
 *   Creates a new admin user directly in PostgreSQL.
 *
 * Usage:
 *   node server/scripts/create-admin.js "name@example.com" "Admin Name" "temporaryPassword123"
 *
 * Example:
 *   node server/scripts/create-admin.js "gretana@pricesmart.com" "German Retana" "MiClaveSegura123"
 *
 * What it does:
 *   1. Connects to PostgreSQL using DATABASE_URL
 *   2. Checks whether the admin email already exists
 *   3. Hashes the password with bcrypt
 *   4. Inserts the admin into the admins table
 *
 * Notes:
 *   - Email is normalized to lowercase.
 *   - If the admin already exists, the script stops without changing anything.
 *   - Run this from the project root.
 */

function normalizeEmail(v) {
  return String(v || "")
    .trim()
    .toLowerCase();
}

async function main() {
  const [, , emailArg, nameArg, passwordArg] = process.argv;

  const email = normalizeEmail(emailArg);
  const name = String(nameArg || "").trim();
  const password = String(passwordArg || "");

  if (!email || !name || !password) {
    console.log("");
    console.log("Uso:");
    console.log(
      '  node server/scripts/create-admin.js "correo@dominio.com" "Nombre Apellido" "password"',
    );
    console.log("");
    console.log("Ejemplo:");
    console.log(
      '  node server/scripts/create-admin.js "gretana@pricesmart.com" "German Retana" "MiClaveSegura123"',
    );
    console.log("");
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("La contraseña debe tener al menos 6 caracteres.");
    process.exit(1);
  }

  const existing = await findAdminByEmailFromPg(email);
  if (existing) {
    console.error(`Ya existe un admin con el correo: ${email}`);
    await getPool().end();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await insertAdminToPg({
    email,
    name,
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  console.log("");
  console.log("Admin creado correctamente.");
  console.log(`Email: ${email}`);
  console.log(`Nombre: ${name}`);
  console.log("");
  console.log("Ya puede iniciar sesión en /admin/login");
  console.log("");

  await getPool().end();
}

main().catch(async (err) => {
  console.error("Error creando admin:", err);
  try {
    await getPool().end();
  } catch {}
  process.exit(1);
});
