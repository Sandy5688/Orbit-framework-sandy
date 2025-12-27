import { getPrismaClient } from "../db/client";

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
  await prisma.telemetryEvent.create({
    data: {
      eventType,
      profileId: ctx.profileId ?? null,
      runId: ctx.runId ?? null,
      namespace: ctx.namespace ?? null,
      metadata: metadata as any,
    },
  });
}


