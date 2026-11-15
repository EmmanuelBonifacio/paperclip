import { pgTable, uuid, text, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { authUsers } from "./auth.js";
import { companies } from "./companies.js";

export const agentSdkKeys = pgTable(
  "agent_sdk_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id").notNull().references(() => companies.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    keyHash: text("key_hash").notNull(),
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    keyHashIdx: uniqueIndex("agent_sdk_keys_key_hash_idx").on(table.keyHash),
    companyIdx: index("agent_sdk_keys_company_idx").on(table.companyId),
    creatorIdx: index("agent_sdk_keys_creator_idx").on(table.createdByUserId),
  }),
);
