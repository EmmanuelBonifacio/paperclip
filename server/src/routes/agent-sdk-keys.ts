import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { AGENT_SDK_SCOPES, agentSdkKeysService } from "../services/agent-sdk-keys.js";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess, getActorInfo } from "./authz.js";

const createAgentSdkKeySchema = z.object({
  name: z.string().trim().min(1).max(120).default("saas-integration"),
  scopes: z.array(z.enum(AGENT_SDK_SCOPES)).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

/**
 * Board-only lifecycle for company-scoped SaaS SDK keys.
 * Cleartext token is returned once on create; only the hash is stored.
 */
export function agentSdkKeyRoutes(db: Db) {
  const router = Router();
  const keys = agentSdkKeysService(db);

  router.get("/companies/:companyId/agent-sdk-keys", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    if (req.actor.source === "agent_sdk_key") {
      // SDK keys may list metadata for their own company (no token material).
      res.json(await keys.listForCompany(companyId));
      return;
    }
    res.json(await keys.listForCompany(companyId));
  });

  router.post(
    "/companies/:companyId/agent-sdk-keys",
    validate(createAgentSdkKeySchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      // Minting keys is a board operator action — never an SDK key itself.
      if (req.actor.source === "agent_sdk_key") {
        res.status(403).json({ error: "SDK keys cannot mint other SDK keys" });
        return;
      }
      const actor = getActorInfo(req);
      const created = await keys.create({
        companyId,
        name: req.body.name,
        scopes: req.body.scopes,
        createdByUserId: actor.actorId,
        expiresAt: req.body.expiresAt ? new Date(req.body.expiresAt) : null,
      });
      res.status(201).json(created);
    },
  );

  router.delete("/companies/:companyId/agent-sdk-keys/:keyId", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    const keyId = req.params.keyId as string;
    assertCompanyAccess(req, companyId);
    if (req.actor.source === "agent_sdk_key") {
      res.status(403).json({ error: "SDK keys cannot revoke SDK keys" });
      return;
    }
    const actor = getActorInfo(req);
    const revoked = await keys.revoke({
      companyId,
      keyId,
      actorUserId: actor.actorId,
    });
    res.json({ id: revoked.id, revokedAt: revoked.revokedAt });
  });

  return router;
}
