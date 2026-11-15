import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import express from "express";
import request from "supertest";
import {
  agents,
  companies,
  createDb,
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "@paperclipai/db";
import { actorMiddleware } from "../middleware/auth.js";
import { agentSdkRouteGuard } from "../middleware/agent-sdk-route-guard.js";
import { boardMutationGuard } from "../middleware/board-mutation-guard.js";
import { errorHandler } from "../middleware/error-handler.js";
import { agentSdkKeyRoutes } from "../routes/agent-sdk-keys.js";
import { assertAuthenticated, assertCompanyAccess } from "../routes/authz.js";
import { AGENT_SDK_SCOPES, agentSdkKeysService } from "../services/agent-sdk-keys.js";

const external = process.env.PAPERCLIP_TEST_DATABASE_URL;
const support = external ? { supported: true } : await getEmbeddedPostgresTestSupport();
const databaseSuite = support.supported ? describe : describe.skip;

databaseSuite("agent SDK key auth (real PostgreSQL)", () => {
  let db: ReturnType<typeof createDb>;
  let temporary: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | undefined;

  beforeAll(async () => {
    if (external) db = createDb(external);
    else {
      temporary = await startEmbeddedPostgresTestDatabase("agent-sdk-auth-");
      db = createDb(temporary.connectionString);
    }
  }, 90_000);

  afterAll(async () => {
    await db?.$client.end();
    await temporary?.cleanup();
  });

  function app(deploymentMode: "local_trusted" | "authenticated" = "authenticated") {
    const application = express();
    application.use(express.json());
    application.use(actorMiddleware(db, { deploymentMode }));
    application.use(boardMutationGuard());
    application.use(agentSdkRouteGuard());
    application.use("/api", agentSdkKeyRoutes(db));
    application.get("/api/companies/:companyId/agents", (req, res) => {
      assertAuthenticated(req);
      assertCompanyAccess(req, req.params.companyId as string);
      res.json([{ id: "agent-1", name: "Demo", companyId: req.params.companyId }]);
    });
    application.get("/api/agents/:id", (req, res) => {
      assertAuthenticated(req);
      res.json({ id: req.params.id, name: "Demo", companyId: req.actor.companyId });
    });
    application.post("/api/agents/:id/wakeup", (req, res) => {
      assertAuthenticated(req);
      res.status(202).json({ ok: true });
    });
    application.get("/api/companies/:companyId/secrets", (req, res) => {
      assertAuthenticated(req);
      res.json({ leaked: true });
    });
    application.use(errorHandler);
    return application;
  }

  async function seedCompany(name = "SDK Co") {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name,
      issuePrefix: `S${companyId.slice(0, 7)}`,
    });
    return companyId;
  }

  it("rejects missing, revoked, and expired keys with 401", async () => {
    const companyId = await seedCompany();
    const keys = agentSdkKeysService(db);
    const created = await keys.create({
      companyId,
      name: "saas",
      scopes: ["agents:read"],
    });

    expect((await request(app()).get(`/api/companies/${companyId}/agents`)).status).toBe(401);

    const ok = await request(app())
      .get(`/api/companies/${companyId}/agents`)
      .set("Authorization", `Bearer ${created.token}`);
    expect(ok.status).toBe(200);

    await keys.revoke({ companyId, keyId: created.id, actorUserId: "tester" });
    expect(
      (await request(app())
        .get(`/api/companies/${companyId}/agents`)
        .set("Authorization", `Bearer ${created.token}`)).status,
    ).toBe(401);

    const expired = await keys.create({
      companyId,
      name: "expired",
      scopes: ["agents:read"],
      expiresAt: new Date(Date.now() - 60_000),
    });
    expect(
      (await request(app())
        .get(`/api/companies/${companyId}/agents`)
        .set("Authorization", `Bearer ${expired.token}`)).status,
    ).toBe(401);
  });

  it("denies cross-company access and insufficient scope without leaking admin routes", async () => {
    const companyA = await seedCompany("A");
    const companyB = await seedCompany("B");
    const keys = agentSdkKeysService(db);
    const readOnly = await keys.create({
      companyId: companyA,
      name: "read",
      scopes: ["agents:read"],
    });

    const cross = await request(app())
      .get(`/api/companies/${companyB}/agents`)
      .set("Authorization", `Bearer ${readOnly.token}`);
    expect(cross.status).toBe(403);

    const scopeDenied = await request(app())
      .post(`/api/agents/${randomUUID()}/wakeup`)
      .set("Authorization", `Bearer ${readOnly.token}`)
      .send({ source: "on_demand" });
    expect(scopeDenied.status).toBe(403);

    const admin = await request(app())
      .get(`/api/companies/${companyA}/secrets`)
      .set("Authorization", `Bearer ${readOnly.token}`);
    expect(admin.status).toBe(403);
    expect(admin.body).not.toMatchObject({ leaked: true });
  });

  it("allows agents:run when scoped and keeps approval-gated agent rows readable", async () => {
    const companyId = await seedCompany();
    const agentId = randomUUID();
    await db.insert(agents).values({
      id: agentId,
      companyId,
      name: "Pending",
      role: "engineer",
      status: "pending_approval",
      adapterType: "process",
    });

    const keys = agentSdkKeysService(db);
    const runner = await keys.create({
      companyId,
      name: "runner",
      scopes: [...AGENT_SDK_SCOPES],
    });

    const wake = await request(app())
      .post(`/api/agents/${agentId}/wakeup`)
      .set("Authorization", `Bearer ${runner.token}`)
      .send({ source: "on_demand" });
    expect(wake.status).toBe(202);

    const list = await request(app())
      .get(`/api/companies/${companyId}/agent-sdk-keys`)
      .set("Authorization", `Bearer ${runner.token}`);
    expect(list.status).toBe(200);
    expect(list.body.every((row: { token?: string }) => row.token === undefined)).toBe(true);
  });

  it("ENABLE_AUTH=false path: local_trusted without SDK key cannot hit integration routes", async () => {
    const previous = process.env.ENABLE_AUTH;
    process.env.ENABLE_AUTH = "false";
    try {
      // Re-import guard env read is live via isUiAuthDisabled(); actorMiddleware reads at construction.
      const companyId = await seedCompany();
      const application = express();
      application.use(express.json());
      application.use(actorMiddleware(db, { deploymentMode: "local_trusted" }));
      application.use(agentSdkRouteGuard());
      application.get("/api/companies/:companyId/agents", (req, res) => {
        assertAuthenticated(req);
        assertCompanyAccess(req, req.params.companyId as string);
        res.json([]);
      });
      application.use(errorHandler);

      expect((await request(application).get(`/api/companies/${companyId}/agents`)).status).toBe(401);

      const keys = agentSdkKeysService(db);
      const created = await keys.create({
        companyId,
        name: "embedded",
        scopes: ["agents:read"],
      });
      expect(
        (await request(application)
          .get(`/api/companies/${companyId}/agents`)
          .set("Authorization", `Bearer ${created.token}`)).status,
      ).toBe(200);
    } finally {
      if (previous === undefined) delete process.env.ENABLE_AUTH;
      else process.env.ENABLE_AUTH = previous;
    }
  });
});
