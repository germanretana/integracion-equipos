import "dotenv/config";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getPool } from "../lib/pg.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getDbPath() {
  return process.env.DB_PATH || path.resolve(__dirname, "..", "data", "db.json");
}

async function main() {
  const dbPath = getDbPath();
  const raw = fs.readFileSync(dbPath, "utf8");
  const db = JSON.parse(raw);

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    /* -------------------------
       ADMINS
    ------------------------- */

    for (const admin of db.admins || []) {
      await client.query(
        `
        insert into admins (email, name, password_hash, created_at)
        values ($1,$2,$3,$4)
        on conflict (email) do update
        set name = excluded.name
        `,
        [
          admin.email,
          admin.name || "",
          admin.passwordHash,
          admin.createdAt || new Date().toISOString(),
        ]
      );
    }

    /* -------------------------
       BASE TEMPLATES
    ------------------------- */

    if (db.baseTemplates?.c1) {
      await client.query(
        `
        insert into base_templates(domain,kind,content)
        values('questionnaire','c1',$1)
        on conflict (domain,kind)
        do update set content=excluded.content
        `,
        [db.baseTemplates.c1]
      );
    }

    if (db.baseTemplates?.c2) {
      await client.query(
        `
        insert into base_templates(domain,kind,content)
        values('questionnaire','c2',$1)
        on conflict (domain,kind)
        do update set content=excluded.content
        `,
        [db.baseTemplates.c2]
      );
    }

    /* -------------------------
       PROCESSES
    ------------------------- */

    for (const proc of db.processes || []) {

      await client.query(
        `
        insert into processes(
          process_slug,
          company_name,
          process_name,
          status,
          created_at,
          launched_at,
          closed_at,
          expected_start_at,
          expected_end_at,
          logo_url
        )
        values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        on conflict (process_slug) do update
        set status = excluded.status
        `,
        [
          proc.processSlug,
          proc.companyName,
          proc.processName,
          proc.status,
          proc.createdAt || new Date().toISOString(),
          proc.launchedAt || null,
          proc.closedAt || null,
          proc.expectedStartAt || null,
          proc.expectedEndAt || null,
          proc.logoUrl || null
        ]
      );

      /* -------------------------
         PROCESS QUESTIONNAIRE TEMPLATES
      ------------------------- */

      if (proc.templates?.c1) {
        await client.query(
          `
          insert into process_templates(process_slug,domain,kind,content)
          values($1,'questionnaire','c1',$2)
          on conflict (process_slug,domain,kind)
          do update set content=excluded.content
          `,
          [proc.processSlug, proc.templates.c1]
        );
      }

      if (proc.templates?.c2) {
        await client.query(
          `
          insert into process_templates(process_slug,domain,kind,content)
          values($1,'questionnaire','c2',$2)
          on conflict (process_slug,domain,kind)
          do update set content=excluded.content
          `,
          [proc.processSlug, proc.templates.c2]
        );
      }

      /* -------------------------
         PARTICIPANTS
      ------------------------- */

      for (const p of proc.participants || []) {

        await client.query(
          `
          insert into participants(
            id,
            process_slug,
            first_name,
            last_name,
            email,
            password_hash
          )
          values($1,$2,$3,$4,$5,$6)
          on conflict (id) do update
          set email = excluded.email
          `,
          [
            p.id,
            proc.processSlug,
            p.firstName || "",
            p.lastName || "",
            p.email,
            p.passwordHash || null
          ]
        );
      }

      /* -------------------------
         C1 RESPONSES
      ------------------------- */

      for (const r of proc.responses?.c1 || []) {

        await client.query(
          `
          insert into response_c1(
            process_slug,
            participant_id,
            draft,
            saved_at,
            submitted_at
          )
          values($1,$2,$3,$4,$5)
          on conflict (process_slug,participant_id)
          do update set draft=excluded.draft
          `,
          [
            proc.processSlug,
            r.participantId,
            r.draft || {},
            r.savedAt || null,
            r.submittedAt || null
          ]
        );
      }

      /* -------------------------
         C2 RESPONSES
      ------------------------- */

      for (const r of proc.responses?.c2 || []) {

        await client.query(
          `
          insert into response_c2(
            process_slug,
            participant_id,
            peer_id,
            draft,
            saved_at,
            submitted_at
          )
          values($1,$2,$3,$4,$5,$6)
          on conflict (process_slug,participant_id,peer_id)
          do update set draft=excluded.draft
          `,
          [
            proc.processSlug,
            r.participantId,
            r.peerId,
            r.draft || {},
            r.savedAt || null,
            r.submittedAt || null
          ]
        );
      }

    }

    /* -------------------------
       EVENTS
    ------------------------- */

    for (const ev of db.events || []) {

      await client.query(
        `
        insert into events(
          id,
          ts,
          type,
          process_slug,
          participant_id,
          participant_email,
          participant_name,
          admin_email,
          payload
        )
        values($1,$2,$3,$4,$5,$6,$7,$8,$9)
        on conflict (id) do nothing
        `,
        [
          ev.id,
          ev.ts,
          ev.type,
          ev.processSlug || null,
          ev.participantId || null,
          ev.participantEmail || null,
          ev.participantName || null,
          ev.adminEmail || null,
          ev.payload || {}
        ]
      );
    }

    await client.query("commit");

    console.log("JSON data imported successfully.");

  } catch (err) {

    await client.query("rollback");
    console.error("Import failed.");
    console.error(err);
    process.exitCode = 1;

  } finally {

    client.release();
    await pool.end();

  }

}

main();
