# `ENABLE_AUTH=false`

Embed Paperclip behind a SaaS without serving Paperclip login/register UI.

| Surface | `ENABLE_AUTH` unset / true | `ENABLE_AUTH=false` |
|---------|----------------------------|---------------------|
| UI login / register / browser session | On (authenticated mode) | Not served (`/api/auth` → 404) |
| Ambient `local_implicit` board | Allowed in `local_trusted` | **Disabled** |
| SaaS integration API | Board session **or** SDK key | **Only** `Authorization: Bearer pcp_sdk_…` |
| Agent JWT / agent API keys | Still work | Still work (approval gates preserved) |

## Absolute rules

1. `ENABLE_AUTH=false` never leaves the API open.
2. Missing key → 401.
3. Revoked / expired key → 401.
4. Insufficient scope or other company → 403 (no existence oracle across tenants).
5. Secrets stay in server env / secret store — never in the UI bundle.
