import { readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error("Missing POSTGRES_URL_NON_POOLING or POSTGRES_URL.");
}

const migrationUrl = new URL(
  "../supabase/migrations/20260816173000_create_user_api_key_vault.sql",
  import.meta.url,
);
const migration = await readFile(migrationUrl, "utf8");
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });

try {
  await sql.unsafe(migration);
  console.log("Herbert API key vault migration applied.");
} finally {
  await sql.end();
}
