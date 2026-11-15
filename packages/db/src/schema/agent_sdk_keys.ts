import { pgTable, uuid, text, timestamp, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/**
 * Company-scoped SaaS integration keys (`pcp_sdk_…`).
 * Persist only `key_hash` (SHA-256 hex). Never store the cleartext token.
 */
export type AgentSdkScope =
  | "agents:read"
  | "tasks:read"
  | "tasks:write"
  | "comments:write"
  | "agents:run";

export type AgentSdkKeyScopes = {
  scopes: AgentSdkScope[];
};

export const agentSdkKeys = pgTable(
  "agent_sdk_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    /** Least-privilege scopes granted to this key. */
    scopes: jsonb("scopes").$type<AgentSdkKeyScopes>().notNull(),
    createdByUserId: text("created_by_user_id"),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyHashIdx: uniqueIndex("agent_sdk_keys_key_hash_idx").on(table.keyHash),
    companyIdx: index("agent_sdk_keys_company_idx").on(table.companyId),
  }),
);
