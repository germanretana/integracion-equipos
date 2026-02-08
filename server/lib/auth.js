import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

export function signAdminToken(admin) {
  return jwt.sign(
    { sub: admin.email, role: "admin", name: admin.name || admin.email },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

export function requireAdmin(req, res, next) {
  const hdr = req.headers.authorization || "";
  const token = hdr.startsWith("Bearer ") ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autorizado." });

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== "admin") return res.status(403).json({ error: "Prohibido." });
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Sesión inválida o expirada." });
  }
}
