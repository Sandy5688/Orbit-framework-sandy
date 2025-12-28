import { getPrismaClient } from "../db/client";
import { env } from "../config/env";
import { logger } from "../shared/logger";

export type TelemetryEventType =
  | "execution_started"
  | "artifact_emitted"
  | "delivery_confirmed"
  | "anomaly_detected";

export interface TelemetryContext {
  profileId?: string;
  runId?: string;
  namespace?: string;
}

export async function emitTelemetryEvent(
  eventType: TelemetryEventType,
  ctx: TelemetryContext,
  metadata: Record<string, unknown>
): Promise<void> {
  const prisma = getPrismaClient();
  const cycleRunId =
    (metadata.cycleRunId as string | undefined) ?? undefined;

  await prisma.telemetryEvent.create({
    data: {
      eventType,
      cycleRunId: cycleRunId ?? null,
      profileId: ctx.profileId ?? null,
      runId: ctx.runId ?? null,
      namespace: ctx.namespace ?? null,
      metadata: metadata as any,
    },
  });
}

export async function pruneTelemetry(): Promise<void> {
  const prisma = getPrismaClient();

  const retentionDays = env.TELEMETRY_RETENTION_DAYS;
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    return;
  }

  const cutoff = new Date(
    Date.now() - retentionDays * 24 * 60 * 60 * 1000
  );

  try {
    const oldEvents = await prisma.telemetryEvent.findMany({
      where: {
        timestamp: {
          lt: cutoff,
        },
      },
    });

    if (!oldEvents.length) {
      return;
    }

    if (env.TELEMETRY_COLD_ARCHIVE_ENABLED) {
      await prisma.telemetryArchive.createMany({
        data: oldEvents.map((e) => ({
          eventType: e.eventType,
          cycleRunId: e.cycleRunId,
          profileId: e.profileId,
          runId: e.runId,
          namespace: e.namespace,
          timestamp: e.timestamp,
          metadata: e.metadata as any,
        })),
      });
    }

    await prisma.telemetryEvent.deleteMany({
      where: {
        id: {
          in: oldEvents.map((e) => e.id),
        },
      },
    });

    logger.info("Telemetry pruning run completed", {
      prunedCount: oldEvents.length,
      retentionDays,
    });
  } catch (error) {
    logger.error("Telemetry pruning failed", { error });
  }
}


