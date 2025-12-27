import { getPrismaClient } from "../db/client";
import { recorder } from "./recorder";

export interface NormalizationResultItem {
  normalizationItemId: string;
}

export interface NormalizationInput {
  transformationId: string;
  payload: Buffer;
}

export async function normalizePayloads(
  cycleRunId: string,
  inputs: NormalizationInput[]
): Promise<NormalizationResultItem[]> {
  const prisma = getPrismaClient();

  if (inputs.length === 0) {
    await recorder.warn(
      "normalization",
      "No successful transformations provided for normalization",
      undefined,
      cycleRunId
    );
    return [];
  }

  const batch = await prisma.normalizationBatch.create({
    data: {
      status: "pending",
      processorRef: null,
    },
  });

  await recorder.info(
    "normalization",
    "Created normalization batch",
    batch.id,
    cycleRunId
  );

  const results: NormalizationResultItem[] = [];

  // For demonstration, we treat the external processor as a no-op that marks
  // items as normalized without interpreting payload content.
  for (const input of inputs) {
    const item = await prisma.normalizationItem.create({
      data: {
        batchId: batch.id,
        status: "success",
        transformationId: input.transformationId,
      },
    });

    await recorder.info(
      "normalization",
      "Normalized payload item",
      item.id,
      cycleRunId,
      { transformationId: input.transformationId }
    );

    results.push({ normalizationItemId: item.id });
  }

  await prisma.normalizationBatch.update({
    where: { id: batch.id },
    data: { status: "completed" },
  });

  return results;
}


