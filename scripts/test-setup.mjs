#!/usr/bin/env node
/**
 * test:setup — reset embedded / test Postgres for Paperclip.
 *
 * Does NOT edit migrations. Does NOT change journal hashes.
 *
 *   pnpm test:setup
 *   PAPERCLIP_TEST_DATABASE_URL=postgres://.../paperclip_test pnpm test:setup
 */

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = join(root, "packages/db/src/migrations");

function fail(message) {
  console.error(`[test:setup] ${message}`);
  process.exit(1);
}

async function assertMigrationsAreLf() {
  if (!existsSync(migrationsDir)) {
    fail(`migrations not found at ${migrationsDir}`);
  }
  const files = (await readdir(migrationsDir)).filter((name) => name.endsWith(".sql"));
  const crlfFiles = [];
  for (const name of files) {
    const bytes = await readFile(join(migrationsDir, name));
    if (bytes.includes(Buffer.from("\r\n"))) crlfFiles.push(name);
  }
  if (crlfFiles.length) {
    fail(
      `CRLF migrations detected (hashes diverge from the journal). ` +
        `Normalize to LF without editing SQL content:\n  ${crlfFiles.slice(0, 20).join("\n  ")}` +
        (crlfFiles.length > 20 ? `\n  … (+${crlfFiles.length - 20})` : ""),
    );
  }
  const sample = ["0466_drop_project_environment.sql", "0467_fair_human_torch.sql"];
  for (const name of sample) {
    const path = join(migrationsDir, name);
    if (!existsSync(path)) continue;
    const content = await readFile(path);
    const hash = createHash("sha256").update(content).digest("hex");
    console.log(`[test:setup] ${name} sha256=${hash}`);
  }
}

async function resetViaDbPackage() {
  // Prefer `pnpm test:setup` (node --import tsx/esm) so these .ts imports resolve.
  const clientModuleUrl = pathToFileURL(join(root, "packages/db/src/client.ts")).href;
  const embeddedModuleUrl = pathToFileURL(
    join(root, "packages/db/src/test-embedded-postgres.ts"),
  ).href;

  const url =
    process.env.PAPERCLIP_TEST_DATABASE_URL ||
    process.env.DATABASE_URL ||
    null;

  if (url) {
    const { resetPostgresDatabase, ensurePostgresDatabase, applyPendingMigrations } =
      await import(clientModuleUrl);
    const databaseName = new URL(url).pathname.replace(/^\//, "");
    if (!databaseName) fail("Database URL is missing a database name");
    if (!/_test$/.test(databaseName) && process.env.PAPERCLIP_TEST_SETUP_ALLOW_NON_TEST !== "1") {
      fail(
        `Refusing to reset database "${databaseName}". ` +
          `Use a *_test database or set PAPERCLIP_TEST_SETUP_ALLOW_NON_TEST=1 carefully.`,
      );
    }
    console.log(`[test:setup] resetting database ${databaseName}`);
    await resetPostgresDatabase(url, databaseName);
    await ensurePostgresDatabase(url);
    await applyPendingMigrations(url);
    console.log("[test:setup] migrations applied");
    return;
  }

  console.log("[test:setup] no DATABASE_URL — starting embedded postgres test cluster and migrating");
  const { startEmbeddedPostgresTestDatabase } = await import(embeddedModuleUrl);
  const { applyPendingMigrations } = await import(clientModuleUrl);
  const db = await startEmbeddedPostgresTestDatabase("paperclip-test-setup-");
  try {
    await applyPendingMigrations(db.connectionString);
    console.log(`[test:setup] embedded ok: ${db.connectionString.replace(/:[^:@/]+@/, ":***@")}`);
  } finally {
    await db.cleanup();
  }
}

await assertMigrationsAreLf();
await resetViaDbPackage();
console.log("[test:setup] done");
