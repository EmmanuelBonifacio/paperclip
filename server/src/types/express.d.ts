export {};

import type { AgentApiKeyScope } from "@paperclipai/shared";
import type { AgentSdkScope } from "@paperclipai/db";

declare global {
  namespace Express {
    interface Request {
      actor: {
        type: "board" | "agent" | "none";
        userId?: string;
        userName?: string | null;
        userEmail?: string | null;
        agentId?: string;
        companyId?: string;
        companyIds?: string[];
        sessionId?: string | null;
        memberships?: Array<{
          companyId: string;
          membershipRole?: string | null;
          status?: string;
        }>;
        onBehalfOfMemberships?: Array<{
          companyId: string;
          membershipRole?: string | null;
          status?: string;
        }>;
        isInstanceAdmin?: boolean;
        canManageExperimentalSettings?: boolean;
        keyId?: string;
        keyScope?: AgentApiKeyScope;
        /** Scopes for source=agent_sdk_key (`pcp_sdk_…`). */
        sdkScopes?: AgentSdkScope[];
        runId?: string;
        onBehalfOfUserId?: string | null;
        authorizingUserId?: string;
        identityContextId?: string | null;
        source?: "local_implicit" | "session" | "board_key" | "agent_key" | "agent_jwt" | "agent_sdk_key" | "mcp_oauth" | "cloud_tenant" | "cloud_control" | "none";
      };
    }
  }
}
