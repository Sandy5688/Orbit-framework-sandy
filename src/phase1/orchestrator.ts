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
  // running cycle with the same namespace.
  const existingRunning = await prisma.cycleRun.findFirst({
    where: {
      status: "running",
      contextJson: {
        path: ["namespace"],
        equals: context?.namespace ?? null,
      } as any,
    },
  });

  if (existingRunning) {
    logger.warn(
      `Cycle already running for namespace ${namespaceKey}; skipping new cycle`
    );
    await recorder.warn(
      "cycle",
      "Skipped cycle due to existing running cycle for namespace",
      existingRunning.id,
      existingRunning.id,
      { namespace: context?.namespace ?? null, trigger }
    );
    return "";
  }

  const cycle = await prisma.cycleRun.create({
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
  });

  let initiationSucceeded = false;
  let transformationsSucceeded = false;
  let normalizationSucceeded = false;
  let dispatchSucceeded = false;

  let initiationId: string | null = null;
  let transformationsResult: TransformationResult | null = null;
  let normalizationItemIds: string[] = [];

  try {
    await recorder.info("cycle", "Cycle started", cycle.id, cycle.id, {
      trigger,
      context,
    });

    await emitTelemetryEvent(
      "execution_started",
      {
        profileId: context?.profileId,
        runId: context?.runProfileId,
        namespace: context?.namespace,
      },
      { cycleRunId: cycle.id }
    );

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

        transformationsResult = await runTieredTransformations(
          cycle.id,
          initiationId
        );

        const successfulTiers =
          transformationsResult.tiers.filter((t) => t.success).length;

        transformationsSucceeded = successfulTiers > 0;

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
    if (transformationsSucceeded && transformationsResult) {
      try {
        await recorder.info(
          "normalization",
          "Normalization stage started",
          undefined,
          cycle.id
        );

        const normalizationInputs: NormalizationInput[] =
          transformationsResult.tiers
            .filter(
              (t) => t.success && t.transformationId && t.payload !== undefined
            )
            .map((t) => ({
              transformationId: t.transformationId as string,
              payload: t.payload as Buffer,
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
  }

  return cycle.id;
}


