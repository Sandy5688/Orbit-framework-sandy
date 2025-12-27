import { getPrismaClient } from "../db/client";
import { recorder } from "./recorder";

export interface NormalizationResultItem {
  normalizationItemId: string;
}

export async function normalizePayloads(
  cycleRunId: string,
  payloads: Buffer[]
): Promise<NormalizationResultItem[]> {
  const prisma = getPrismaClient();

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
  for (let i = 0; i < payloads.length; i += 1) {
    const item = await prisma.normalizationItem.create({
      data: {
        batchId: batch.id,
        status: "success",
      },
    });

    await recorder.info(
      "normalization",
      "Normalized payload item",
      item.id,
      cycleRunId
    );

    results.push({ normalizationItemId: item.id });
  }

  await prisma.normalizationBatch.update({
    where: { id: batch.id },
    data: { status: "completed" },
  });

  return results;
}


