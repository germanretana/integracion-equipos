import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import { readDb, updateDb } from "./lib/db.js";
import { requireAdmin, signAdminToken } from "./lib/auth.js";

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(express.json({ limit: "1mb" }));
app.use(cors({ origin: true }));

app.get("/api/health", (_req, res) => res.json({ ok: true }));

/* =========================
   ADMIN AUTH
========================= */

app.post("/api/admin/bootstrap", async (req, res) => {
  const { email, password, name } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: "email y password requeridos." });

  const db = readDb();
  if (db.admins.length > 0) return res.status(409).json({ error: "Bootstrap ya realizado." });

  const passwordHash = await bcrypt.hash(String(password), 10);

  updateDb((db2) => {
    db2.admins.push({
      email: String(email).toLowerCase(),
      name: String(name || ""),
      passwordHash,
      createdAt: new Date().toISOString()
    });
    return db2;
  });

  res.json({ ok: true });
});

app.post("/api/admin/login", async (req, res) => {
  const { email, password } = req.body || {};
  const db = readDb();
  const admin = db.admins.find((a) => a.email === String(email || "").toLowerCase());
  if (!admin) return res.status(401).json({ error: "Credenciales inválidas." });

  const ok = await bcrypt.compare(String(password || ""), admin.passwordHash);
  if (!ok) return res.status(401).json({ error: "Credenciales inválidas." });

  const token = signAdminToken(admin);
  res.json({ token, admin: { email: admin.email, name: admin.name } });
});

/* =========================
   BASE TEMPLATES (ADMIN)
========================= */

app.get("/api/admin/base-templates/:kind", requireAdmin, (req, res) => {
  const kind = req.params.kind;
  if (!["c1", "c2"].includes(kind)) return res.status(404).json({ error: "No encontrado." });

  const db = readDb();
  res.json(db.baseTemplates?.[kind] || null);
});

app.put("/api/admin/base-templates/:kind", requireAdmin, (req, res) => {
  const kind = req.params.kind;
  if (!["c1", "c2"].includes(kind)) return res.status(404).json({ error: "No encontrado." });

  const incoming = req.body || {};

  const next = updateDb((db) => {
    db.baseTemplates = db.baseTemplates || {};
    db.baseTemplates[kind] = {
      ...db.baseTemplates[kind],
      ...incoming
    };
    return db;
  });

  res.json(next.baseTemplates[kind]);
});

/* =========================
   PROCESSES (ADMIN)
========================= */

app.get("/api/admin/processes", requireAdmin, (_req, res) => {
  const db = readDb();
  res.json(db.processes);
});

app.post("/api/admin/processes", requireAdmin, (req, res) => {
  const { processSlug, companyName, processName } = req.body || {};
  if (!processSlug || !companyName || !processName) {
    return res.status(400).json({ error: "Datos incompletos." });
  }

  const db = readDb();
  if (db.processes.some((p) => p.processSlug === processSlug)) {
    return res.status(409).json({ error: "processSlug ya existe." });
  }

  const now = new Date().toISOString();

  const newProcess = {
    processSlug,
    companyName,
    processName,
    status: "PREPARACION",
    templates: structuredClone(db.baseTemplates),
    participants: [],
    createdAt: now,
    launchedAt: null,
    closedAt: null
  };

  updateDb((db2) => {
    db2.processes.push(newProcess);
    return db2;
  });

  res.json(newProcess);
});

app.get("/api/admin/processes/:processSlug", requireAdmin, (req, res) => {
  const db = readDb();
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });
  res.json(proc);
});

app.patch("/api/admin/processes/:processSlug/status", requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!["PREPARACION", "EN_CURSO", "CERRADO"].includes(status)) {
    return res.status(400).json({ error: "Estado inválido." });
  }

  const db = readDb();
  const proc = db.processes.find((p) => p.processSlug === req.params.processSlug);
  if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

  proc.status = status;
  if (status === "EN_CURSO") proc.launchedAt = new Date().toISOString();
  if (status === "CERRADO") proc.closedAt = new Date().toISOString();

  updateDb(() => db);
  res.json(proc);
});

/* =========================
   PROCESS TEMPLATES (ADMIN)
========================= */

app.get("/api/admin/processes/:processSlug/templates/:kind", requireAdmin, (req, res) => {
  const { processSlug, kind } = req.params;
  if (!["c1", "c2"].includes(kind)) return res.status(404).json({ error: "No encontrado." });

  const db = readDb();
  const proc = db.processes.find((p) => p.processSlug === processSlug);
  if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

  res.json(proc.templates?.[kind] || null);
});

app.put("/api/admin/processes/:processSlug/templates/:kind", requireAdmin, (req, res) => {
  const { processSlug, kind } = req.params;
  if (!["c1", "c2"].includes(kind)) return res.status(404).json({ error: "No encontrado." });

  const incoming = req.body || {};

  const next = updateDb((db) => {
    const proc = db.processes.find((p) => p.processSlug === processSlug);
    if (!proc) return db;

    proc.templates = proc.templates || {};
    proc.templates[kind] = {
      ...proc.templates[kind],
      ...incoming
    };

    return db;
  });

  const proc = next.processes.find((p) => p.processSlug === processSlug);
  if (!proc) return res.status(404).json({ error: "Proceso no encontrado." });

  res.json(proc.templates[kind]);
});

app.listen(PORT, () => {
  console.log(`Backend listening on http://localhost:${PORT}`);
});
