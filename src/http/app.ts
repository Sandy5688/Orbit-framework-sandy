import express from "express";
import cors from "cors";
import { runCycle } from "../phase1/orchestrator";
import { getPrismaClient } from "../db/client";
import {
  loadProfiles,
  loadRunProfiles,
  reloadProfileConfigs,
} from "../phase2/profileEngine";
import { runAllEnabledRunProfilesOnce } from "../phase2/runProfileOrchestration";
import { computeAdvisorySignalsForProfile } from "../phase3/correlationEngine";
import { generateStrategyProposalsForProfile } from "../phase3/strategySuggestion";
import { haltNamespace } from "../phase3/governance";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Liveness probe: process is up and able to handle HTTP.
  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Readiness probe: DB reachable and configuration successfully loaded.
  app.get("/ready", async (_req, res) => {
    const prisma = getPrismaClient();
    try {
      // Simple DB check
      await prisma.cycleRun.count();
      // Config validation/load (no-op if already cached)
      loadProfiles();
      loadRunProfiles();
      res.json({ ready: true });
    } catch (error) {
      res.status(503).json({
        ready: false,
        error: "Service not ready",
        details: error instanceof Error ? error.message : String(error),
      });
    }
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

  // Basic JSON metrics for operational introspection.
  app.get("/metrics", async (_req, res) => {
    const prisma = getPrismaClient();
    try {
      const cycleCountsByStatus = await prisma.cycleRun.groupBy({
        by: ["status"],
        _count: { _all: true },
      });

      const dispatchCountsByStatus = await prisma.dispatchJob.groupBy({
        by: ["status"],
        _count: { _all: true },
      });

      const deadLetterCount = await prisma.deadLetterDispatch.count();

      res.json({
        cycles: {
          total: cycleCountsByStatus.reduce(
            (acc, c) => acc + c._count._all,
            0
          ),
          byStatus: cycleCountsByStatus.reduce<Record<string, number>>(
            (acc, c) => {
              acc[c.status] = c._count._all;
              return acc;
            },
            {}
          ),
        },
        dispatch: {
          total: dispatchCountsByStatus.reduce(
            (acc, d) => acc + d._count._all,
            0
          ),
          byStatus: dispatchCountsByStatus.reduce<Record<string, number>>(
            (acc, d) => {
              acc[d.status] = d._count._all;
              return acc;
            },
            {}
          ),
          deadLetterCount,
        },
      });
    } catch (error) {
      res.status(500).json({
        error: "Failed to compute metrics",
        details: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.get("/profiles", (_req, res) => {
    res.json(loadProfiles());
  });

  app.get("/run-profiles", (_req, res) => {
    res.json(loadRunProfiles());
  });

  app.post("/config/reload", (_req, res) => {
    try {
      reloadProfileConfigs();
      res.status(200).json({ reloaded: true });
    } catch (error) {
      res.status(500).json({
        error: "Failed to reload configuration",
        details: error instanceof Error ? error.message : String(error),
      });
    }
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


