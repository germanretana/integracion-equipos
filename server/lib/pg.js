import pkg from "pg";

const { Pool } = pkg;

let pool = null;

export function getPool() {
  if (pool) return pool;

  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set.");
  }

  pool = new Pool({
    connectionString,
    ssl:
      process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false,
  });

  return pool;
}

export async function testConnection() {
  const pool = getPool();
  const client = await pool.connect();
  try {
    const res = await client.query("select now()");
    return res.rows[0];
  } finally {
    client.release();
  }
}

export async function listProcessesFromPg() {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      process_slug as "processSlug",
      company_name as "companyName",
      process_name as "processName",
      status,
      created_at as "createdAt",
      launched_at as "launchedAt",
      closed_at as "closedAt",
      expected_start_at as "expectedStartAt",
      expected_end_at as "expectedEndAt",
      logo_url as "logoUrl"
    from processes
    order by created_at desc, process_slug asc
    `,
  );

  return rows;
}

export async function getProcessFromPg(processSlug) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      process_slug as "processSlug",
      company_name as "companyName",
      process_name as "processName",
      status,
      created_at as "createdAt",
      launched_at as "launchedAt",
      closed_at as "closedAt",
      expected_start_at as "expectedStartAt",
      expected_end_at as "expectedEndAt",
      logo_url as "logoUrl"
    from processes
    where process_slug = $1
    `,
    [processSlug],
  );

  return rows[0] || null;
}

export async function listProcessSummariesFromPg() {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    with participant_counts as (
      select
        p.process_slug,
        count(*)::int as participant_count
      from participants p
      group by p.process_slug
    ),
    c1_counts as (
      select
        r.process_slug,
        count(*) filter (where r.submitted_at is not null)::int as c1_completed
      from response_c1 r
      group by r.process_slug
    ),
    c2_counts as (
      select
        r.process_slug,
        count(*)::int as c2_completed
      from response_c2 r
      where r.submitted_at is not null
      group by r.process_slug
    )
    select
      pr.process_slug as "processSlug",
      pr.company_name as "companyName",
      pr.process_name as "processName",
      pr.status as "status",
      pr.expected_start_at as "expectedStartAt",
      pr.expected_end_at as "expectedEndAt",
      pr.logo_url as "logoUrl",
      coalesce(pc.participant_count, 0)::int as "participantCount",
      coalesce(c1.c1_completed, 0)::int as "c1Completed",
      coalesce(c2.c2_completed, 0)::int as "c2Completed"
    from processes pr
    left join participant_counts pc
      on pc.process_slug = pr.process_slug
    left join c1_counts c1
      on c1.process_slug = pr.process_slug
    left join c2_counts c2
      on c2.process_slug = pr.process_slug
    order by pr.created_at desc, pr.process_slug asc
    `,
  );

  return rows.map((row) => {
    const participantCount = Number(row.participantCount || 0);
    const c2Total =
      participantCount > 0 ? participantCount * (participantCount - 1) : 0;

    return {
      processSlug: row.processSlug,
      companyName: row.companyName,
      processName: row.processName,
      status: row.status,
      expectedStartAt: row.expectedStartAt,
      expectedEndAt: row.expectedEndAt,
      logoUrl: row.logoUrl,
      progress: {
        c1Completed: Number(row.c1Completed || 0),
        c1Total: participantCount,
        c2Completed: Number(row.c2Completed || 0),
        c2Total,
      },
    };
  });
}

export async function listParticipantsFromPg(processSlug) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      id,
      process_slug as "processSlug",
      first_name as "firstName",
      last_name as "lastName",
      email,
      password_hash as "passwordHash"
    from participants
    where process_slug = $1
    order by lower(last_name), lower(first_name), id
    `,
    [processSlug],
  );

  return rows;
}

export async function findParticipantsByEmailFromPg(email) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      p.id,
      p.process_slug as "processSlug",
      p.first_name as "firstName",
      p.last_name as "lastName",
      p.email,
      p.password_hash as "passwordHash",
      pr.company_name as "companyName",
      pr.process_name as "processName",
      pr.status as "processStatus",
      pr.logo_url as "logoUrl"
    from participants p
    join processes pr
      on pr.process_slug = p.process_slug
    where lower(p.email) = lower($1)
    order by p.process_slug asc, p.id asc
    `,
    [email],
  );

  return rows;
}

export async function getParticipantFromPg(processSlug, participantId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      id,
      process_slug as "processSlug",
      first_name as "firstName",
      last_name as "lastName",
      email,
      password_hash as "passwordHash"
    from participants
    where process_slug = $1
      and id = $2
    `,
    [processSlug, participantId],
  );

  return rows[0] || null;
}

export async function getC1ResponseFromPg(processSlug, participantId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      process_slug as "processSlug",
      participant_id as "participantId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    from response_c1
    where process_slug = $1
      and participant_id = $2
    `,
    [processSlug, participantId],
  );

  return rows[0] || null;
}

export async function upsertC1ResponseDraftToPg(
  processSlug,
  participantId,
  draft,
) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    insert into response_c1(
      process_slug,
      participant_id,
      draft,
      saved_at,
      submitted_at
    )
    values($1, $2, $3, now(), null)
    on conflict (process_slug, participant_id)
    do update set
      draft = excluded.draft,
      saved_at = excluded.saved_at
    returning
      process_slug as "processSlug",
      participant_id as "participantId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    `,
    [processSlug, participantId, draft || {}],
  );

  return rows[0] || null;
}

export async function submitC1ResponseInPg(processSlug, participantId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    insert into response_c1(
      process_slug,
      participant_id,
      draft,
      saved_at,
      submitted_at
    )
    values($1, $2, '{}'::jsonb, now(), now())
    on conflict (process_slug, participant_id)
    do update set
      saved_at = coalesce(response_c1.saved_at, now()),
      submitted_at = now()
    returning
      process_slug as "processSlug",
      participant_id as "participantId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    `,
    [processSlug, participantId],
  );

  return rows[0] || null;
}

export async function listC2ResponsesByParticipantFromPg(
  processSlug,
  participantId,
) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      process_slug as "processSlug",
      participant_id as "participantId",
      peer_id as "peerId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    from response_c2
    where process_slug = $1
      and participant_id = $2
    `,
    [processSlug, participantId],
  );

  return rows;
}

export async function listC1ResponsesByProcessFromPg(processSlug) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      process_slug as "processSlug",
      participant_id as "participantId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    from response_c1
    where process_slug = $1
    `,
    [processSlug],
  );

  return rows;
}

export async function listC2ResponsesByProcessFromPg(processSlug) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      process_slug as "processSlug",
      participant_id as "participantId",
      peer_id as "peerId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    from response_c2
    where process_slug = $1
    `,
    [processSlug],
  );

  return rows;
}

export async function getC2ResponseFromPg(processSlug, participantId, peerId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      process_slug as "processSlug",
      participant_id as "participantId",
      peer_id as "peerId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    from response_c2
    where process_slug = $1
      and participant_id = $2
      and peer_id = $3
    `,
    [processSlug, participantId, peerId],
  );

  return rows[0] || null;
}

export async function upsertC2ResponseDraftToPg(
  processSlug,
  participantId,
  peerId,
  draft,
) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    insert into response_c2(
      process_slug,
      participant_id,
      peer_id,
      draft,
      saved_at,
      submitted_at
    )
    values($1, $2, $3, $4, now(), null)
    on conflict (process_slug, participant_id, peer_id)
    do update set
      draft = excluded.draft,
      saved_at = excluded.saved_at
    returning
      process_slug as "processSlug",
      participant_id as "participantId",
      peer_id as "peerId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    `,
    [processSlug, participantId, peerId, draft || {}],
  );

  return rows[0] || null;
}

export async function submitC2ResponseInPg(processSlug, participantId, peerId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    insert into response_c2(
      process_slug,
      participant_id,
      peer_id,
      draft,
      saved_at,
      submitted_at
    )
    values($1, $2, $3, '{}'::jsonb, now(), now())
    on conflict (process_slug, participant_id, peer_id)
    do update set
      saved_at = coalesce(response_c2.saved_at, now()),
      submitted_at = now()
    returning
      process_slug as "processSlug",
      participant_id as "participantId",
      peer_id as "peerId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    `,
    [processSlug, participantId, peerId],
  );

  return rows[0] || null;
}

export async function insertParticipantToPg(processSlug, participant) {
  const pool = getPool();

  const { rows } = await pool.query(
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
    returning
      id,
      process_slug as "processSlug",
      first_name as "firstName",
      last_name as "lastName",
      email,
      password_hash as "passwordHash"
    `,
    [
      participant.id,
      processSlug,
      participant.firstName || "",
      participant.lastName || "",
      participant.email,
      participant.passwordHash || null,
    ],
  );

  return rows[0] || null;
}

export async function updateParticipantInPg(processSlug, participant) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    update participants
    set
      first_name = $3,
      last_name = $4,
      email = $5,
      password_hash = $6
    where process_slug = $1
      and id = $2
    returning
      id,
      process_slug as "processSlug",
      first_name as "firstName",
      last_name as "lastName",
      email,
      password_hash as "passwordHash"
    `,
    [
      processSlug,
      participant.id,
      participant.firstName || "",
      participant.lastName || "",
      participant.email,
      participant.passwordHash || null,
    ],
  );

  return rows[0] || null;
}

export async function deleteParticipantFromPg(processSlug, participantId) {
  const pool = getPool();

  const { rowCount } = await pool.query(
    `
    delete from participants
    where process_slug = $1
      and id = $2
    `,
    [processSlug, participantId],
  );

  return rowCount > 0;
}

export async function resetParticipantAccessInPg(
  processSlug,
  participantId,
  passwordHash,
) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    update participants
    set password_hash = $3
    where process_slug = $1
      and id = $2
    returning
      id,
      process_slug as "processSlug",
      first_name as "firstName",
      last_name as "lastName",
      email,
      password_hash as "passwordHash"
    `,
    [processSlug, participantId, passwordHash],
  );

  return rows[0] || null;
}

export async function upsertProcessToPg(proc) {
  const pool = getPool();

  await pool.query(
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
    on conflict (process_slug)
    do update set
      company_name = excluded.company_name,
      process_name = excluded.process_name,
      status = excluded.status,
      created_at = excluded.created_at,
      launched_at = excluded.launched_at,
      closed_at = excluded.closed_at,
      expected_start_at = excluded.expected_start_at,
      expected_end_at = excluded.expected_end_at,
      logo_url = excluded.logo_url
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
      proc.logoUrl || null,
    ],
  );
}

export async function replaceProcessQuestionnaireTemplatesInPg(proc) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    await client.query(
      `
      delete from process_templates
      where process_slug = $1
        and domain = 'questionnaire'
      `,
      [proc.processSlug],
    );

    if (proc.templates?.c1) {
      await client.query(
        `
        insert into process_templates(process_slug, domain, kind, content)
        values($1, 'questionnaire', 'c1', $2)
        `,
        [proc.processSlug, proc.templates.c1],
      );
    }

    if (proc.templates?.c2) {
      await client.query(
        `
        insert into process_templates(process_slug, domain, kind, content)
        values($1, 'questionnaire', 'c2', $2)
        `,
        [proc.processSlug, proc.templates.c2],
      );
    }

    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

export async function deleteProcessFromPg(processSlug) {
  const pool = getPool();
  await pool.query(
    `
    delete from processes
    where process_slug = $1
    `,
    [processSlug],
  );
}

export async function renameProcessSlugInPg(oldSlug, newSlug) {
  if (!oldSlug || !newSlug || oldSlug === newSlug) return;

  const pool = getPool();

  await pool.query(
    `
    update processes
    set process_slug = $2
    where process_slug = $1
    `,
    [oldSlug, newSlug],
  );
}

export async function findAdminByEmailFromPg(email) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select email, name, password_hash as "passwordHash", created_at as "createdAt"
    from admins
    where email = lower($1)
    `,
    [email],
  );

  return rows[0] || null;
}

export async function countAdminsFromPg() {
  const pool = getPool();

  const { rows } = await pool.query(
    `select count(*)::int as count from admins`,
  );

  return Number(rows[0]?.count || 0);
}

export async function insertAdminToPg(admin) {
  const pool = getPool();

  await pool.query(
    `
    insert into admins(email, name, password_hash, created_at)
    values(lower($1), $2, $3, $4)
    `,
    [
      admin.email,
      admin.name || "",
      admin.passwordHash,
      admin.createdAt || new Date().toISOString(),
    ],
  );
}

export async function insertEventToPg(event) {
  const pool = getPool();

  await pool.query(
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
    values($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      event.id,
      event.ts,
      event.type,
      event.processSlug || null,
      event.participantId || null,
      event.participantEmail || null,
      event.participantName || null,
      event.adminEmail || null,
      event.payload || {},
    ],
  );
}

export async function listEventsFromPg({
  processSlug,
  participantId,
  type,
  limit,
} = {}) {
  const pool = getPool();

  const clauses = [];
  const params = [];

  if (processSlug) {
    params.push(processSlug);
    clauses.push(`process_slug = $${params.length}`);
  }
  if (participantId) {
    params.push(participantId);
    clauses.push(`participant_id = $${params.length}`);
  }
  if (type) {
    params.push(type);
    clauses.push(`type = $${params.length}`);
  }

  const where = clauses.length ? `where ${clauses.join(" and ")}` : "";

  const cappedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Number(limit), 1), 500)
    : 200;

  params.push(cappedLimit);

  const { rows } = await pool.query(
    `
    select
      id,
      ts,
      type,
      process_slug as "processSlug",
      participant_id as "participantId",
      participant_email as "participantEmail",
      participant_name as "participantName",
      admin_email as "adminEmail",
      payload
    from events
    ${where}
    order by ts desc
    limit $${params.length}
    `,
    params,
  );

  return rows;
}

export async function findParticipantByEmailInProcessFromPg(processSlug, email) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select
      id,
      process_slug as "processSlug",
      first_name as "firstName",
      last_name as "lastName",
      email,
      password_hash as "passwordHash"
    from participants
    where process_slug = $1
      and lower(email) = lower($2)
    `,
    [processSlug, email],
  );

  return rows[0] || null;
}

export async function reopenC1ResponseInPg(processSlug, participantId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    insert into response_c1(
      process_slug,
      participant_id,
      draft,
      saved_at,
      submitted_at
    )
    values($1, $2, '{}'::jsonb, now(), null)
    on conflict (process_slug, participant_id)
    do update set
      saved_at = now(),
      submitted_at = null
    returning
      process_slug as "processSlug",
      participant_id as "participantId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    `,
    [processSlug, participantId],
  );

  return rows[0] || null;
}

export async function reopenC2ResponseInPg(processSlug, participantId, peerId) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    insert into response_c2(
      process_slug,
      participant_id,
      peer_id,
      draft,
      saved_at,
      submitted_at
    )
    values($1, $2, $3, '{}'::jsonb, now(), null)
    on conflict (process_slug, participant_id, peer_id)
    do update set
      saved_at = now(),
      submitted_at = null
    returning
      process_slug as "processSlug",
      participant_id as "participantId",
      peer_id as "peerId",
      draft,
      saved_at as "savedAt",
      submitted_at as "submittedAt"
    `,
    [processSlug, participantId, peerId],
  );

  return rows[0] || null;
}

export async function listProcessSlugsFromPg() {
  const pool = getPool();

  const { rows } = await pool.query(
    `select process_slug as "processSlug" from processes`,
  );

  return rows.map((row) => row.processSlug);
}

export async function getBaseTemplateFromPg(kind) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select content
    from base_templates
    where domain = 'questionnaire'
      and kind = $1
    `,
    [kind],
  );

  return rows[0]?.content || null;
}

export async function getBaseTemplatesFromPg() {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select kind, content
    from base_templates
    where domain = 'questionnaire'
    `,
  );

  const out = { c1: null, c2: null };

  for (const row of rows) {
    if (row.kind === "c1") out.c1 = row.content;
    if (row.kind === "c2") out.c2 = row.content;
  }

  return out;
}

export async function upsertBaseTemplateToPg(kind, content) {
  const pool = getPool();

  await pool.query(
    `
    insert into base_templates(domain, kind, content, updated_at)
    values('questionnaire', $1, $2, now())
    on conflict (domain, kind)
    do update set
      content = excluded.content,
      updated_at = now()
    `,
    [kind, content || {}],
  );
}

export async function upsertProcessTemplateToPg(processSlug, kind, content) {
  const pool = getPool();

  await pool.query(
    `
    insert into process_templates(process_slug, domain, kind, content, updated_at)
    values($1, 'questionnaire', $2, $3, now())
    on conflict (process_slug, domain, kind)
    do update set
      content = excluded.content,
      updated_at = now()
    `,
    [processSlug, kind, content || {}],
  );
}

export async function getProcessTemplatesFromPg(processSlug) {
  const pool = getPool();

  const { rows } = await pool.query(
    `
    select kind, content
    from process_templates
    where process_slug = $1
      and domain = 'questionnaire'
    `,
    [processSlug],
  );

  const out = { c1: null, c2: null };

  for (const row of rows) {
    if (row.kind === "c1") out.c1 = row.content;
    if (row.kind === "c2") out.c2 = row.content;
  }

  return out;
}
