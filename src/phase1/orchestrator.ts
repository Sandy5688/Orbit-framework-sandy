import { getPrismaClient } from "../db/client";
import { env } from "../config/env";
import { logger } from "../shared/logger";
import { emitTelemetryEvent } from "../phase3/telemetryBus";
import { generateInitiation } from "./initiationSelector";
import {
  normalizePayloads,
  type NormalizationInput,
} from "./normalizationEngine";
import {
  runTieredTransformations,
  type TransformationResult,
} from "./transformations";
import { enqueueDispatchJobs, processDispatchQueue } from "./dispatchQueue";
import { recorder } from "./recorder";

export type CycleTrigger = "cron" | "manual";

export interface CycleContext {
  profileId?: string;
  runProfileId?: string;
  instructionId?: string;
  namespace?: string;
  configVersion?: string;
}

let activeCycleCount = 0;

export function getActiveCycleCount(): number {
  return activeCycleCount;
}

async function appendCheckpoint(
  cycleRunId: string,
  stage: string,
  details?: unknown
): Promise<void> {
  const prisma = getPrismaClient();
  await prisma.cycleCheckpoint.create({
    data: {
      cycleRunId,
      stage,
      details: details as any,
    },
  });
}

async function getLastCheckpoint(cycleRunId: string): Promise<{
  stage: string;
} | null> {
  const prisma = getPrismaClient();
  const last = await prisma.cycleCheckpoint.findFirst({
    where: { cycleRunId },
    orderBy: { createdAt: "desc" },
  });
  if (!last) return null;
  return { stage: last.stage };
}

export async function runCycle(
  trigger: CycleTrigger,
  context?: CycleContext
): Promise<string> {
  if (env.GLOBAL_PAUSE) {
    logger.warn("Global pause is enabled; skipping cycle");
    return "";
  }

  const prisma = getPrismaClient();

  const namespaceKey = context?.namespace ?? "default";

  // Prevent overlapping cycles per namespace by checking for an existing
  // running cycle with the same namespace. If one exists, we resume it instead
  // of starting a new one.
  const existingRunning = await prisma.cycleRun.findFirst({
    where: {
      status: "running",
      contextJson: {
        path: ["namespace"],
        equals: context?.namespace ?? null,
      } as any,
    },
  });

  let cycle =
    existingRunning ??
    (await prisma.cycleRun.create({
      data: {
        status: "running",
        contextJson: {
          trigger,
          profileId: context?.profileId ?? null,
          runProfileId: context?.runProfileId ?? null,
          instructionId: context?.instructionId ?? null,
          namespace: context?.namespace ?? null,
        } as any,
      },
    }));

  if (!existingRunning) {
    await appendCheckpoint(cycle.id, "cycle_started", { trigger, context });
  } else {
    logger.warn(
      `Resuming existing running cycle for namespace ${namespaceKey} (id=${cycle.id})`
    );
    await recorder.info(
      "cycle",
      "Resuming existing running cycle for namespace",
      cycle.id,
      cycle.id,
      { namespace: context?.namespace ?? null, trigger }
    );
  }

  let initiationSucceeded = false;
  let transformationsSucceeded = false;
  let normalizationSucceeded = false;
  let dispatchSucceeded = false;

  let initiationId: string | null = null;
  let transformationsResult: TransformationResult | null = null;
  let normalizationItemIds: string[] = [];

  activeCycleCount += 1;

  try {
    if (!existingRunning) {
      await recorder.info("cycle", "Cycle started", cycle.id, cycle.id, {
        trigger,
        context,
      });
    }

    await emitTelemetryEvent(
      "execution_started",
      {
        profileId: context?.profileId,
        runId: context?.runProfileId,
        namespace: context?.namespace,
      },
      { cycleRunId: cycle.id }
    );

    const lastCheckpoint = await getLastCheckpoint(cycle.id);
    const lastStage = lastCheckpoint?.stage ?? null;

    // --- Initiation stage ---
    try {
      await recorder.info(
        "initiation",
        "Initiation stage started",
        undefined,
        cycle.id
      );
      const initiation = await generateInitiation(cycle.id);
      initiationId = initiation.id;
      initiationSucceeded = true;
      await recorder.info(
        "initiation",
        "Initiation stage completed",
        initiation.id,
        cycle.id
      );
    } catch (error) {
      await recorder.error(
        "initiation",
        "Initiation stage failed",
        undefined,
        cycle.id,
        { error }
      );
    }

    // --- Transformation stage ---
    if (initiationSucceeded && initiationId) {
      try {
        await recorder.info(
          "transformation",
          "Transformation stage started",
          initiationId,
          cycle.id
        );

        // If we already reached tier-3 (or beyond) according to checkpoints,
        // we can reuse existing Transformation rows and skip re-running tiers.
        if (
          lastStage === "tier3_complete" ||
          lastStage === "dispatch_complete" ||
          lastStage === "cycle_finished"
        ) {
          transformationsSucceeded = true;
          await recorder.info(
            "transformation",
            "Transformation stage skipped due to completed checkpoint",
            initiationId,
            cycle.id
          );
        } else {
          // Determine from which tier we should resume based on the last
          // checkpoint. If the process crashed mid-cycle, this allows us to
          // resume from Tier-2 or Tier-3 without re-running earlier tiers.
          let startTier: 1 | 2 | 3 = 1;
          if (lastStage === "tier1_complete") {
            startTier = 2;
          } else if (lastStage === "tier2_complete") {
            startTier = 3;
          }

          transformationsResult = await runTieredTransformations(
            cycle.id,
            initiationId,
            startTier
          );

          const successfulTiers =
            transformationsResult.tiers.filter((t) => t.success).length;

          transformationsSucceeded = successfulTiers > 0;

          // Record per-tier checkpoints for successfully completed tiers. This is
          // append-only; duplicate checkpoints for the same stage are harmless,
          // as only the latest is used for resume decisions.
          for (const tierResult of transformationsResult.tiers) {
            if (tierResult.success) {
              const stageName =
                tierResult.tier === 1
                  ? "tier1_complete"
                  : tierResult.tier === 2
                  ? "tier2_complete"
                  : "tier3_complete";
              await appendCheckpoint(cycle.id, stageName, {
                transformationId: tierResult.transformationId,
              });
            }
          }

          await recorder.info(
            "transformation",
            "Transformation stage completed",
            initiationId,
            cycle.id,
            {
              tiers: transformationsResult.tiers.map((t) => ({
                tier: t.tier,
                success: t.success,
                transformationId: t.transformationId,
              })),
            }
          );
        }
      } catch (error) {
        await recorder.error(
          "transformation",
          "Transformation stage failed",
          initiationId,
          cycle.id,
          { error }
        );
      }
    }

    // --- Normalization stage ---
    if (transformationsSucceeded && initiationId) {
      try {
        await recorder.info(
          "normalization",
          "Normalization stage started",
          undefined,
          cycle.id
        );

        // Rehydrate all successful transformations for this initiation from the
        // database so normalization can be safely re-run after a crash without
        // duplicating work. Payloads are opaque; we derive a stable seed from
        // the initiation id for downstream processors.
        const transformations =
          await prisma.transformation.findMany({
            where: {
              initiationId,
              status: "success",
            },
            orderBy: { tier: "asc" },
          });

        const normalizationInputs: NormalizationInput[] =
          transformations.map((t) => ({
            transformationId: t.id,
            payload: Buffer.from(`init:${initiationId}:tier:${t.tier}`, "utf8"),
          }));

        const normalizationResults = await normalizePayloads(
          cycle.id,
          normalizationInputs
        );

        normalizationItemIds = normalizationResults.map(
          (r) => r.normalizationItemId
        );

        normalizationSucceeded = normalizationItemIds.length > 0;

        await recorder.info(
          "normalization",
          "Normalization stage completed",
          undefined,
          cycle.id,
          { normalizationItemCount: normalizationItemIds.length }
        );
      } catch (error) {
        await recorder.error(
          "normalization",
          "Normalization stage failed",
          undefined,
          cycle.id,
          { error }
        );
      }
    }

    // --- Dispatch stage ---
    if (normalizationSucceeded && normalizationItemIds.length > 0) {
      try {
        await recorder.info(
          "dispatch",
          "Dispatch stage started",
          undefined,
          cycle.id,
          { normalizationItemCount: normalizationItemIds.length }
        );

        // Use a generic endpoint key; concrete mapping is supplied via config.
        await enqueueDispatchJobs(
          cycle.id,
          normalizationItemIds,
          "default-endpoint"
        );

        await processDispatchQueue(cycle.id, context);
        dispatchSucceeded = true;

        await appendCheckpoint(cycle.id, "dispatch_complete", {
          normalizationItemCount: normalizationItemIds.length,
        });

        await recorder.info(
          "dispatch",
          "Dispatch stage completed",
          undefined,
          cycle.id
        );
      } catch (error) {
        // Dispatch failures must not cause the entire cycle to be treated as
        // failed; record the failure and continue.
        await recorder.error(
          "dispatch",
          "Dispatch stage failed",
          undefined,
          cycle.id,
          { error }
        );
      }
    }

    const anyStageSucceeded =
      initiationSucceeded ||
      transformationsSucceeded ||
      normalizationSucceeded ||
      dispatchSucceeded;

    let finalStatus: string;
    if (!anyStageSucceeded) {
      finalStatus = "failed";
    } else if (
      initiationSucceeded &&
      transformationsSucceeded &&
      normalizationSucceeded &&
      dispatchSucceeded
    ) {
      finalStatus = "success";
    } else {
      finalStatus = "partial_success";
    }

    await prisma.cycleRun.update({
      where: { id: cycle.id },
      data: {
        status: finalStatus,
        finishedAt: new Date(),
      },
    });

    await recorder.info("cycle", "Cycle completed", cycle.id, cycle.id, {
      finalStatus,
      stages: {
        initiation: initiationSucceeded,
        transformations: transformationsSucceeded,
        normalization: normalizationSucceeded,
        dispatch: dispatchSucceeded,
      },
    });

    await appendCheckpoint(cycle.id, "cycle_finished", {
      finalStatus,
      stages: {
        initiation: initiationSucceeded,
        transformations: transformationsSucceeded,
        normalization: normalizationSucceeded,
        dispatch: dispatchSucceeded,
      },
    });
  } catch (error) {
    await prisma.cycleRun.update({
      where: { id: cycle.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
      },
    });
    await recorder.error(
      "cycle",
      "Cycle failed with unexpected error",
      cycle.id,
      cycle.id,
      { error }
    );
  } finally {
    activeCycleCount -= 1;
  }

  return cycle.id;
}


