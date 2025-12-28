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

  // Derive a stable, deterministic source from execution context only.
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

  const initiationHash = crypto
    .createHash("sha256")
    .update(dedupeSource)
    .digest("hex");

  const existing = await prisma.initiation.findFirst({
    where: {
      initiationHash,
      runProfileId: context.runProfileId ?? null,
    },
  });

  if (existing) {
    // Reuse existing initiation for identical stable context; do not create a
    // duplicate initiation record.
    await recorder.info(
      "initiation",
      "Reusing existing initiation for stable context",
      existing.id,
      cycleRunId,
      { initiationHash }
    );

    return {
      id: existing.id,
      label: existing.label,
      weight: existing.weight,
      metadata: existing.metadata as Record<string, unknown>,
    };
  }

  const label = `auto-initiation-${initiationHash.slice(0, 8)}`;
  const weight = 1.0;
  const metadata: Record<string, unknown> = {
    ...stableContext,
  };

  try {
    const created = await prisma.initiation.create({
      data: {
        label,
        weight,
        metadata: metadata as any,
        initiationHash,
        runProfileId: context.runProfileId ?? null,
        cycleRunId,
      },
    });

    await recorder.info(
      "initiation",
      "Created initiation for stable context",
      created.id,
      cycleRunId,
      { initiationHash }
    );

    return {
      id: created.id,
      label: created.label,
      weight: created.weight,
      metadata: created.metadata as Record<string, unknown>,
    };
  } catch (error) {
    // In case of a race where another process created the same initiationHash /
    // runProfileId combination, fall back to retrieving and returning it.
    const fallback = await prisma.initiation.findFirst({
      where: {
        initiationHash,
        runProfileId: context.runProfileId ?? null,
      },
    });

    if (!fallback) {
      throw error;
    }

    await recorder.info(
      "initiation",
      "Recovered existing initiation after unique constraint race",
      fallback.id,
      cycleRunId,
      { initiationHash }
    );

    return {
      id: fallback.id,
      label: fallback.label,
      weight: fallback.weight,
      metadata: fallback.metadata as Record<string, unknown>,
    };
  }
}

