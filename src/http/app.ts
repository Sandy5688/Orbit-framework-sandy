import express from "express";
import cors from "cors";
import { runCycle } from "../phase1/orchestrator";
import { getPrismaClient } from "../db/client";
import { loadProfiles, loadRunProfiles } from "../phase2/profileEngine";
import { runAllEnabledRunProfilesOnce } from "../phase2/runProfileOrchestration";
import { computeAdvisorySignalsForProfile } from "../phase3/correlationEngine";
import { generateStrategyProposalsForProfile } from "../phase3/strategySuggestion";
import { haltNamespace } from "../phase3/governance";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/cycles/trigger", async (_req, res) => {
    try {
      const id = await runCycle("manual");
      res.status(202).json({ accepted: true, cycleRunId: id });
    } catch (error) {
      res.status(500).json({
        error: "Failed to trigger cycle",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/cycles/recent", async (_req, res) => {
    const prisma = getPrismaClient();
    const cycles = await prisma.cycleRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 20,
    });
    res.json(cycles);
  });

  app.get("/profiles", (_req, res) => {
    res.json(loadProfiles());
  });

  app.get("/run-profiles", (_req, res) => {
    res.json(loadRunProfiles());
  });

  app.post("/run-profiles/trigger", async (_req, res) => {
    try {
      await runAllEnabledRunProfilesOnce();
      res.status(202).json({ accepted: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to trigger run profiles",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/profiles/:profileId/signals", async (req, res) => {
    const { profileId } = req.params;
    try {
      await computeAdvisorySignalsForProfile(profileId);
      res.status(202).json({ accepted: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to compute advisory signals",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/profiles/:profileId/strategy-proposals", async (req, res) => {
    const { profileId } = req.params;
    try {
      await generateStrategyProposalsForProfile(profileId);
      res.status(202).json({ accepted: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to generate strategy proposals",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post("/governance/namespaces/:namespace/halt", async (req, res) => {
    const { namespace } = req.params;
    const actor = (req.body && req.body.actor) || "api";
    try {
      await haltNamespace(namespace, actor);
      res.status(200).json({ namespace, halted: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to halt namespace",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  return app;
}


