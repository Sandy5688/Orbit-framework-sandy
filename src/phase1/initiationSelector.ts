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

  const label = `auto-initiation-${new Date().toISOString()}`;
  const weight = 1.0;
  const metadata: Record<string, unknown> = {};

  const hash = crypto
    .createHash("sha256")
    .update(label + JSON.stringify(metadata))
    .digest("hex");

  const existing = await prisma.initiation.findFirst({
    where: { dedupeHash: hash },
  });

  if (existing) {
    await recorder.info(
      "initiation",
      "Duplicate initiation hash detected",
      existing.id,
      cycleRunId,
      { dedupeHash: hash }
    );
  }

  const created = await prisma.initiation.create({
    data: {
      label,
      weight,
      metadata: metadata as any,
      dedupeHash: hash,
      cycleRunId,
    },
  });

  return {
    id: created.id,
    label: created.label,
    weight: created.weight,
    metadata: created.metadata as Record<string, unknown>,
  };
}


