import postgres from "postgres";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./test-embedded-postgres.js";

const externalDatabaseOverrides = [
  "DATABASE_URL",
  "DATABASE_MIGRATION_URL",
  "PAPERCLIP_TEST_DATABASE_URL",
  "PAPERCLIP_TEST_POSTGRES_ADMIN_URL",
] as const;

const configuredExternalDatabase = externalDatabaseOverrides.find((name) =>
  process.env[name]?.trim(),
);

if (configuredExternalDatabase) {
  throw new Error(
    `Refusing embedded test setup while ${configuredExternalDatabase} is configured.`,
  );
}

process.env.PAPERCLIP_TEST_POSTGRES_TEMPLATE = "0";

const support = await getEmbeddedPostgresTestSupport();
if (!support.supported) {
  throw new Error(`Embedded PostgreSQL tests are unavailable: ${support.reason}`);
}

const database = await startEmbeddedPostgresTestDatabase("paperclip-test-setup-");
try {
  const sql = postgres(database.connectionString, { max: 1, onnotice: () => {} });
  try {
    await sql`SELECT 1`;
  } finally {
    await sql.end({ timeout: 1 });
  }
} finally {
  await database.cleanup();
}

console.info("Embedded PostgreSQL test setup passed; its temporary database was removed.");
