import type { RequestHandler } from "express";
import type { AgentSdkScope } from "@paperclipai/db";
import { forbidden, unauthorized } from "../errors.js";
import { hasAgentSdkScope } from "../services/agent-sdk-keys.js";

/**
 * Canonical SaaS createAgentClient paths and required scopes.
 * SDK keys authenticate as board actors with source=agent_sdk_key and are
 * confined to this allowlist — they never receive ambient board admin power.
 */
export const AGENT_SDK_ROUTE_GUARDS = [
  { method: "GET", pattern: /^\/api\/companies\/?$/, scope: "agents:read" as const },
  { method: "POST", pattern: /^\/api\/companies\/?$/, scope: "tasks:write" as const },
  { method: "GET", pattern: /^\/api\/companies\/[^/]+\/agents\/?$/, scope: "agents:read" as const },
  { method: "GET", pattern: /^\/api\/agents\/[^/]+\/?$/, scope: "agents:read" as const },
  { method: "GET", pattern: /^\/api\/companies\/[^/]+\/issues\/?$/, scope: "tasks:read" as const },
  { method: "POST", pattern: /^\/api\/companies\/[^/]+\/issues\/?$/, scope: "tasks:write" as const },
  { method: "GET", pattern: /^\/api\/issues\/[^/]+\/?$/, scope: "tasks:read" as const },
  { method: "PATCH", pattern: /^\/api\/issues\/[^/]+\/?$/, scope: "tasks:write" as const },
  { method: "GET", pattern: /^\/api\/issues\/[^/]+\/comments\/?$/, scope: "tasks:read" as const },
  { method: "POST", pattern: /^\/api\/issues\/[^/]+\/comments\/?$/, scope: "comments:write" as const },
  { method: "POST", pattern: /^\/api\/agents\/[^/]+\/wakeup\/?$/, scope: "agents:run" as const },
  // Key lifecycle for the owning company (board UI / operators minting keys).
  { method: "GET", pattern: /^\/api\/companies\/[^/]+\/agent-sdk-keys\/?$/, scope: "agents:read" as const },
] as const;

function apiPath(reqPath: string) {
  if (reqPath.startsWith("/api/") || reqPath === "/api") return reqPath.split("?")[0] ?? reqPath;
  return `/api${reqPath.startsWith("/") ? reqPath : `/${reqPath}`}`.split("?")[0]!;
}

function matchGuard(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  return AGENT_SDK_ROUTE_GUARDS.find(
    (guard) => guard.method === normalizedMethod && guard.pattern.test(path),
  );
}

const COMPANY_PATH = /^\/api\/companies\/([^/]+)(?:\/|$)/;

function companyIdFromPath(path: string): string | null {
  const match = COMPANY_PATH.exec(path);
  return match?.[1] && match[1] !== "import" ? match[1] : null;
}

/**
 * When ENABLE_AUTH=false, company-data API routes require a valid SDK key
 * (or another non-implicit credential). Anonymous / local_implicit never
 * open the integration surface.
 */
export function isUiAuthDisabled(): boolean {
  const raw = process.env.ENABLE_AUTH?.trim().toLowerCase();
  return raw === "0" || raw === "false" || raw === "off" || raw === "no";
}

export function agentSdkRouteGuard(): RequestHandler {
  return (req, _res, next) => {
    if (req.actor.source !== "agent_sdk_key") {
      if (
        isUiAuthDisabled()
        && (req.actor.source === "local_implicit" || req.actor.type === "none")
      ) {
        const path = apiPath(req.originalUrl || req.path);
        // Health/ready stay public; auth UI is off. Everything else needs a key.
        if (
          path === "/api/health"
          || path.startsWith("/api/health/")
          || path === "/api/ready"
          || path === "/api/liveness"
        ) {
          next();
          return;
        }
        if (matchGuard(req.method, path) || path.startsWith("/api/companies") || path.startsWith("/api/agents") || path.startsWith("/api/issues")) {
          next(unauthorized("SDK API key required"));
          return;
        }
      }
      next();
      return;
    }

    const path = apiPath(req.originalUrl || req.path);
    const guard = matchGuard(req.method, path);
    if (!guard) {
      // Do not reveal whether a non-allowlisted admin route exists.
      next(forbidden("SDK key is not authorized for this route"));
      return;
    }

    const pathCompanyId = companyIdFromPath(path);
    if (pathCompanyId) {
      const allowed = req.actor.companyIds ?? [];
      if (!allowed.includes(pathCompanyId)) {
        next(forbidden("SDK key cannot access another company"));
        return;
      }
    }

    const scopes = req.actor.sdkScopes as AgentSdkScope[] | undefined;
    if (!hasAgentSdkScope(scopes, guard.scope)) {
      next(forbidden("SDK key is missing required scope", { code: "sdk_scope_denied", scope: guard.scope }));
      return;
    }

    next();
  };
}
