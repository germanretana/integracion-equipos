import bcrypt from "bcryptjs";
import { readDb, writeDb } from "../lib/db.js";

/**
 * CREATE ADMIN SCRIPT
 *
 * Purpose:
 *   Creates a new admin user directly in the local JSON database.
 *
 * Usage:
 *   node server/scripts/create-admin.js "name@example.com" "Admin Name" "temporaryPassword123"
 *
 * Example:
 *   node server/scripts/create-admin.js "gretana@pricesmart.com" "German Retana" "MiClaveSegura123"
 *
 * What it does:
 *   1. Reads server/data/db.json
 *   2. Checks whether the admin email already exists
 *   3. Hashes the password with bcrypt
 *   4. Inserts the admin into db.admins
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

  const db = readDb();
  db.admins = Array.isArray(db.admins) ? db.admins : [];

  const exists = db.admins.some((a) => normalizeEmail(a.email) === email);
  if (exists) {
    console.error(`Ya existe un admin con el correo: ${email}`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  db.admins.push({
    email,
    name,
    passwordHash,
    createdAt: new Date().toISOString(),
  });

  writeDb(db);

  console.log("");
  console.log("Admin creado correctamente.");
  console.log(`Email: ${email}`);
  console.log(`Nombre: ${name}`);
  console.log("");
  console.log("Ya puede iniciar sesión en /admin/login");
  console.log("");
}

main().catch((err) => {
  console.error("Error creando admin:", err);
  process.exit(1);
});