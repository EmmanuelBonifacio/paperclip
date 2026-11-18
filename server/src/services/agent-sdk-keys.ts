import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentSdkKeys, type AgentSdkKeyScopes, type AgentSdkScope } from "@paperclipai/db";
import { badRequest, conflict, forbidden, notFound } from "../errors.js";
import { logActivity } from "./activity-log.js";

export const AGENT_SDK_KEY_PREFIX = "pcp_sdk_";

export const AGENT_SDK_SCOPES = [
  "agents:read",
  "tasks:read",
  "tasks:write",
  "comments:write",
  "agents:run",
] as const satisfies readonly AgentSdkScope[];

const AGENT_SDK_KEY_TOUCH_DEBOUNCE_MS = 60_000;
const AGENT_SDK_KEY_TOUCH_CACHE_MAX = 1_000;

export function hashAgentSdkToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function createAgentSdkToken(): string {
  return `${AGENT_SDK_KEY_PREFIX}${randomBytes(24).toString("hex")}`;
}

export function looksLikeAgentSdkKey(token: string): boolean {
  return token.startsWith(AGENT_SDK_KEY_PREFIX);
}

export function hashesEqual(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export function normalizeAgentSdkScopes(value: unknown): AgentSdkScope[] {
  const scopes =
    value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as AgentSdkKeyScopes).scopes)
      ? (value as AgentSdkKeyScopes).scopes
      : Array.isArray(value)
        ? value
        : [];
  const allowed = new Set<string>(AGENT_SDK_SCOPES);
  const unique = [...new Set(scopes.filter((scope): scope is AgentSdkScope => typeof scope === "string" && allowed.has(scope)))];
  return unique;
}

export function hasAgentSdkScope(
  granted: readonly AgentSdkScope[] | undefined,
  required: AgentSdkScope,
): boolean {
  return Boolean(granted?.includes(required));
}

export function agentSdkKeysService(db: Db) {
  const touched = new Map<string, { completedAt: number | null; inFlight: Promise<void> | null }>();

  function pruneTouched(nowMs: number) {
    for (const [id, entry] of touched) {
      if (!entry.inFlight && entry.completedAt !== null && entry.completedAt <= nowMs - AGENT_SDK_KEY_TOUCH_DEBOUNCE_MS) {
        touched.delete(id);
      }
    }
    while (touched.size > AGENT_SDK_KEY_TOUCH_CACHE_MAX) {
      const oldestId = touched.keys().next().value;
      if (!oldestId) break;
      touched.delete(oldestId);
    }
  }

  return {
    create: async (input: {
      companyId: string;
      name: string;
      scopes: AgentSdkScope[];
      createdByUserId?: string | null;
      expiresAt?: Date | null;
    }) => {
      const scopes = normalizeAgentSdkScopes({ scopes: input.scopes });
      if (scopes.length === 0) {
        throw badRequest("At least one SDK scope is required");
      }
      const token = createAgentSdkToken();
      const created = await db
        .insert(agentSdkKeys)
        .values({
          companyId: input.companyId,
          name: input.name.trim() || "default",
          keyHash: hashAgentSdkToken(token),
          scopes: { scopes },
          createdByUserId: input.createdByUserId?.trim() || null,
          expiresAt: input.expiresAt ?? null,
        })
        .returning()
        .then((rows) => rows[0]);

      await logActivity(db, {
        companyId: input.companyId,
        actorType: "user",
        actorId: input.createdByUserId ?? "board",
        action: "agent_sdk_key.created",
        entityType: "agent_sdk_key",
        entityId: created.id,
        details: { name: created.name, scopes },
      });

      return {
        id: created.id,
        companyId: created.companyId,
        name: created.name,
        scopes,
        token,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
      };
    },

    listForCompany: async (companyId: string) => {
      const rows = await db
        .select({
          id: agentSdkKeys.id,
          companyId: agentSdkKeys.companyId,
          name: agentSdkKeys.name,
          scopes: agentSdkKeys.scopes,
          createdByUserId: agentSdkKeys.createdByUserId,
          lastUsedAt: agentSdkKeys.lastUsedAt,
          revokedAt: agentSdkKeys.revokedAt,
          expiresAt: agentSdkKeys.expiresAt,
          createdAt: agentSdkKeys.createdAt,
        })
        .from(agentSdkKeys)
        .where(eq(agentSdkKeys.companyId, companyId));
      return rows.map((row) => ({
        ...row,
        scopes: normalizeAgentSdkScopes(row.scopes),
      }));
    },

    findActiveByToken: async (token: string) => {
      if (!looksLikeAgentSdkKey(token)) return null;
      const tokenHash = hashAgentSdkToken(token);
      const now = Date.now();
      const row = await db
        .select()
        .from(agentSdkKeys)
        .where(and(eq(agentSdkKeys.keyHash, tokenHash), isNull(agentSdkKeys.revokedAt)))
        .then((rows) => rows[0] ?? null);
      if (!row) return null;
      if (!hashesEqual(row.keyHash, tokenHash)) return null;
      if (row.expiresAt && row.expiresAt.getTime() <= now) return null;
      return {
        ...row,
        scopes: normalizeAgentSdkScopes(row.scopes),
      };
    },

    touch: async (keyId: string) => {
      const nowMs = Date.now();
      pruneTouched(nowMs);
      const existing = touched.get(keyId);
      if (existing?.inFlight) return existing.inFlight;
      if (existing?.completedAt !== null && existing && existing.completedAt > nowMs - AGENT_SDK_KEY_TOUCH_DEBOUNCE_MS) {
        return;
      }
      const write = db
        .update(agentSdkKeys)
        .set({ lastUsedAt: new Date(nowMs) })
        .where(eq(agentSdkKeys.id, keyId))
        .then(() => undefined);
      touched.set(keyId, { completedAt: null, inFlight: write });
      try {
        await write;
        touched.set(keyId, { completedAt: Date.now(), inFlight: null });
      } catch (error) {
        touched.delete(keyId);
        throw error;
      }
    },

    revoke: async (input: { companyId: string; keyId: string; actorUserId?: string | null }) => {
      const existing = await db
        .select()
        .from(agentSdkKeys)
        .where(and(eq(agentSdkKeys.id, input.keyId), eq(agentSdkKeys.companyId, input.companyId)))
        .then((rows) => rows[0] ?? null);
      if (!existing) throw notFound("SDK key not found");
      if (existing.revokedAt) throw conflict("SDK key is already revoked");
      const [revoked] = await db
        .update(agentSdkKeys)
        .set({ revokedAt: new Date() })
        .where(and(eq(agentSdkKeys.id, input.keyId), eq(agentSdkKeys.companyId, input.companyId), isNull(agentSdkKeys.revokedAt)))
        .returning();
      if (!revoked) throw conflict("SDK key is already revoked");
      await logActivity(db, {
        companyId: input.companyId,
        actorType: "user",
        actorId: input.actorUserId ?? "board",
        action: "agent_sdk_key.revoked",
        entityType: "agent_sdk_key",
        entityId: revoked.id,
        details: { name: revoked.name },
      });
      return revoked;
    },

    assertCompanyOwnsKey: (companyId: string, keyCompanyId: string) => {
      if (companyId !== keyCompanyId) {
        throw forbidden("SDK key cannot access another company");
      }
    },
  };
}
