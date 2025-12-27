import crypto from "crypto";
import { getPrismaClient } from "../db/client";
import { recorder } from "./recorder";

export interface InitiationObject {
  id: string;
  label: string;
  weight: number;
  metadata: Record<string, unknown>;
}

export async function generateInitiation(
  cycleRunId: string
): Promise<InitiationObject> {
  const prisma = getPrismaClient();

  // Derive a stable deduplication source from execution context only.
  const cycle = await prisma.cycleRun.findUnique({
    where: { id: cycleRunId },
  });

  const context = (cycle?.contextJson ?? {}) as {
    profileId?: string | null;
    runProfileId?: string | null;
    instructionId?: string | null;
    namespace?: string | null;
  };

  const stableContext = {
    profileId: context.profileId ?? null,
    runProfileId: context.runProfileId ?? null,
    instructionId: context.instructionId ?? null,
    namespace: context.namespace ?? null,
  };

  const dedupeSource = JSON.stringify(stableContext);

  const hash = crypto.createHash("sha256").update(dedupeSource).digest("hex");

  const existing = await prisma.initiation.findFirst({
    where: { dedupeHash: hash },
  });

  if (existing) {
    // Reuse existing initiation for identical stable context; do not create a
    // duplicate initiation record.
    await recorder.info(
      "initiation",
      "Reusing existing initiation for stable context",
      existing.id,
      cycleRunId,
      { dedupeHash: hash }
    );

    return {
      id: existing.id,
      label: existing.label,
      weight: existing.weight,
      metadata: existing.metadata as Record<string, unknown>,
    };
  }

  const label = `auto-initiation-${hash.slice(0, 8)}`;
  const weight = 1.0;
  const metadata: Record<string, unknown> = {
    ...stableContext,
  };

  const created = await prisma.initiation.create({
    data: {
      label,
      weight,
      metadata: metadata as any,
      dedupeHash: hash,
      cycleRunId,
    },
  });

  await recorder.info(
    "initiation",
    "Created initiation for stable context",
    created.id,
    cycleRunId,
    { dedupeHash: hash }
  );

  return {
    id: created.id,
    label: created.label,
    weight: created.weight,
    metadata: created.metadata as Record<string, unknown>,
  };
}

