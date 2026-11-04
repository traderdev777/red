/**
 * Creates a throwaway database, applies the Supabase stub and every migration in
 * order, and returns connection strings. Plain Postgres only; never point this
 * at a Supabase project.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

const ADMIN_URL = process.env.TEST_DATABASE_URL; // e.g. postgres://postgres@127.0.0.1:54329/postgres
const DIR = join(import.meta.dirname, "..");

export const hasDb = Boolean(ADMIN_URL);

export async function freshDatabase(name = `red_test_${process.pid}`) {
  if (!ADMIN_URL) throw new Error("TEST_DATABASE_URL is not set");
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${name} with (force)`);
  await admin.query(`create database ${name}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${name}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(readFileSync(join(DIR, "tests/supabase-stub.sql"), "utf8"));
  for (const f of readdirSync(join(DIR, "migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.query(readFileSync(join(DIR, "migrations", f), "utf8"));
  }
  await db.query("grant all on all tables in schema public to service_role");
  await db.end();

  const asAuthenticator = new URL(url);
  asAuthenticator.username = "authenticator";
  return { adminUrl: url.toString(), apiUrl: asAuthenticator.toString(), name };
}

/** A connection that behaves like a PostgREST request: login as authenticator, then SET ROLE + JWT claims. */
export async function asRequest(apiUrl: string, claims: { role: string; sub?: string }) {
  const c = new pg.Client({ connectionString: apiUrl });
  await c.connect();
  await c.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify(claims)]);
  await c.query(`set role ${claims.role}`);
  return c;
}
