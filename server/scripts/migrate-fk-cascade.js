import "dotenv/config";
import { getPool } from "../lib/pg.js";

const TARGETS = [
  { table: "participants", column: "process_slug", onDelete: "cascade" },
  { table: "response_c1", column: "process_slug", onDelete: "cascade" },
  { table: "response_c2", column: "process_slug", onDelete: "cascade" },
  { table: "events", column: "process_slug", onDelete: "cascade" },
  { table: "process_templates", column: "process_slug", onDelete: "cascade" },
];

async function main() {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");

    for (const target of TARGETS) {
      const { rows } = await client.query(
        `
        select conname
        from pg_constraint
        where conrelid = $1::regclass
          and confrelid = 'processes'::regclass
          and contype = 'f'
        `,
        [target.table],
      );

      if (rows.length === 0) {
        console.log(`skip ${target.table}: no FK to processes`);
        continue;
      }

      for (const row of rows) {
        const conname = row.conname;
        console.log(`recreate ${target.table}.${conname} with ON UPDATE CASCADE`);

        await client.query(
          `alter table ${target.table} drop constraint ${conname}`,
        );

        await client.query(
          `
          alter table ${target.table}
          add constraint ${conname}
          foreign key (${target.column})
          references processes(process_slug)
          on update cascade on delete ${target.onDelete}
          `,
        );
      }
    }

    await client.query("commit");
    console.log("migration complete");
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
