import { describe, expect, it, vi } from "vitest";
import { createAgentClient } from "./create-agent-client.js";
import { AgentClientError } from "./errors.js";

describe("createAgentClient", () => {
  it("requires apiKey in apiKey mode", () => {
    expect(() => createAgentClient({ baseUrl: "http://127.0.0.1:3100", authMode: "apiKey" }))
      .toThrow(/apiKey is required/);
  });

  it("rejects credentials in baseUrl", () => {
    expect(() => createAgentClient({ baseUrl: "http://user:pass@127.0.0.1:3100", apiKey: "pcp_sdk_x" }))
      .toThrow(/credentials/);
  });

  it("sends Bearer pcp_sdk_ on apiKey requests", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify([{ id: "a1", name: "Agent" }]), { status: 200 }),
    );
    const client = createAgentClient({
      baseUrl: "http://127.0.0.1:3100",
      apiKey: "pcp_sdk_test",
      authMode: "apiKey",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.listAgents("company-1");
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer pcp_sdk_test",
    });
  });

  it("omits Authorization in local_trusted mode", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify([]), { status: 200 }),
    );
    const client = createAgentClient({
      baseUrl: "http://127.0.0.1:3100",
      authMode: "local_trusted",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await client.listCompanies();
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init as RequestInit).headers).not.toHaveProperty("Authorization");
  });

  it("maps HTTP errors without leaking bodies", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ error: "secret" }), { status: 403 }),
    );
    const client = createAgentClient({
      baseUrl: "http://127.0.0.1:3100",
      apiKey: "pcp_sdk_test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expect(client.getAgent("a1")).rejects.toBeInstanceOf(AgentClientError);
    await expect(client.getAgent("a1")).rejects.toMatchObject({ causeStatus: 403 });
  });
});
