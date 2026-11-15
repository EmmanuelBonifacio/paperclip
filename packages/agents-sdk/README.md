# `@paperclipai/agents-sdk`

Publishable HTTP client for Paperclip agent integration from an external SaaS.

```ts
import { createAgentClient } from "@paperclipai/agents-sdk";

const client = createAgentClient({
  baseUrl: "http://127.0.0.1:3100",
  apiKey: process.env.PAPERCLIP_API_KEY, // pcp_sdk_…
  authMode: "apiKey",
});

const agents = await client.listAgents(companyId);
await client.runAgent(agentId, { issueId, source: "on_demand" });
```

## Auth modes

| Mode | Header | Use |
|------|--------|-----|
| `apiKey` | `Authorization: Bearer pcp_sdk_…` | SaaS / production target |
| `local_trusted` | none | Loopback-only; reject in production SaaS |

End-user JWT/session auth stays in the SaaS. Paperclip stores only the SHA-256
hash of SDK keys in `agent_sdk_keys`.

## V1 methods

`listCompanies`, `createCompany`, `listAgents`, `getAgent`, `listTasks`,
`createTask`, `getTask`, `updateTask`, `listComments`, `createComment`, `runAgent`.
