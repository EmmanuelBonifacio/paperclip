# Agents SDK (SaaS integration)

Company-scoped API keys (`pcp_sdk_…`) let an external SaaS call Paperclip without
Paperclip browser login. Approval gates for agents stay in force.

## Pieces

| Piece | Path |
|-------|------|
| Table | `agent_sdk_keys` (`packages/db`) |
| Auth | `server/src/middleware/auth.ts` + `agent-sdk-route-guard.ts` |
| Key lifecycle | `POST/GET/DELETE /api/companies/:companyId/agent-sdk-keys` |
| Client package | `@paperclipai/agents-sdk` → `createAgentClient({ apiKey, baseUrl })` |
| UI auth off | `ENABLE_AUTH=false` — see [ENABLE_AUTH.md](./ENABLE_AUTH.md) |
| Migrations LF | [MIGRATIONS-CRLF.md](./MIGRATIONS-CRLF.md) |

## Scopes

`agents:read`, `tasks:read`, `tasks:write`, `comments:write`, `agents:run`.

Contract aligned with SaaS `createAgentClient` paths under `/api/companies|agents|issues`.
