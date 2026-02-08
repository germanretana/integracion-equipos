import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

/* =========================
   ADMIN
========================= */
export function signAdminToken(admin) {
  return jwt.sign(
    { type: "admin", email: admin.email, name: admin.name || "" },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

export function requireAdmin(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No autorizado." });

    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.type !== "admin") return res.status(401).json({ error: "No autorizado." });

    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "No autorizado." });
  }
}

/* =========================
   PARTICIPANTS
========================= */
export function signParticipantToken({ processSlug, participantId, email, name }) {
  return jwt.sign(
    { type: "participant", processSlug, participantId, email, name: name || "" },
    JWT_SECRET,
    { expiresIn: "12h" }
  );
}

export function requireParticipant(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    if (!token) return res.status(401).json({ error: "No autorizado." });

    const payload = jwt.verify(token, JWT_SECRET);
    if (payload?.type !== "participant") return res.status(401).json({ error: "No autorizado." });

    req.participant = payload;
    next();
  } catch {
    return res.status(401).json({ error: "No autorizado." });
  }
}
