import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const databaseUrl = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!databaseUrl) {
  throw new Error("Missing POSTGRES_URL_NON_POOLING or POSTGRES_URL.");
}

const migrationsUrl = new URL("../supabase/migrations/", import.meta.url);
const migrationFiles = (await readdir(migrationsUrl))
  .filter((fileName) => fileName.endsWith(".sql"))
  .sort();
const sql = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require" });

try {
  for (const fileName of migrationFiles) {
    const migration = await readFile(new URL(fileName, migrationsUrl), "utf8");
    await sql.unsafe(migration);
    console.log(`Applied ${fileName}.`);
  }
  console.log("Herbert database migrations applied.");
} finally {
  await sql.end();
}
