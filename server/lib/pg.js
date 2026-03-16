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
