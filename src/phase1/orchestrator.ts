import { getPrismaClient } from "../db/client";
import { env } from "../config/env";
import { logger } from "../shared/logger";
import { emitTelemetryEvent } from "../phase3/telemetryBus";
import { generateInitiation } from "./initiationSelector";
import { normalizePayloads } from "./normalizationEngine";
import { runTieredTransformations } from "./transformations";
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

    const initiation = await generateInitiation(cycle.id);

    const transformations = await runTieredTransformations(
      cycle.id,
      initiation.id
    );

    const normalizationResults = await normalizePayloads(cycle.id, [
      transformations.tier3Payload,
    ]);

    const normalizationItemIds = normalizationResults.map(
      (r) => r.normalizationItemId
    );

    // Use a generic endpoint key; concrete mapping is supplied via config.
    await enqueueDispatchJobs(
      cycle.id,
      normalizationItemIds,
      "default-endpoint"
    );

    await processDispatchQueue(cycle.id, context);

    await prisma.cycleRun.update({
      where: { id: cycle.id },
      data: {
        status: "success",
        finishedAt: new Date(),
      },
    });

    await recorder.info("cycle", "Cycle completed", cycle.id, cycle.id);
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
      "Cycle failed",
      cycle.id,
      cycle.id,
      { error }
    );
  }

  return cycle.id;
}


