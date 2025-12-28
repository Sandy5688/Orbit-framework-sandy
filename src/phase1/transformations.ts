import { getPrismaClient } from "../db/client";
import { withRetry } from "../shared/retry";
import { recorder } from "./recorder";

export interface TierTransformationResult {
  tier: 1 | 2 | 3;
  success: boolean;
  transformationId?: string;
  payload?: Buffer;
}

export interface TransformationResult {
  tiers: TierTransformationResult[];
}

async function runTier(
  cycleRunId: string,
  initiationId: string,
  tier: 1 | 2 | 3,
  input: Buffer
): Promise<{ payload: Buffer; transformationId: string }> {
  const prisma = getPrismaClient();

  let attempt = 0;

  const result = await withRetry(async () => {
    attempt += 1;

    const transformation = await prisma.transformation.create({
      data: {
        tier,
        attempt,
        status: "pending",
        initiationId,
      },
    });

    try {
      // Payloads are treated as opaque. For demonstration, we apply a simple
      // reversible transformation without interpreting the content.
      const output =
        tier === 1
          ? Buffer.from(input.toString("base64"))
          : tier === 2
          ? Buffer.from(input.toString("hex"))
          : Buffer.from(input.toString("utf8"));

      // Opaque validation: ensure the transformation output is non-empty and
      // within a reasonable size bound so obviously corrupted payloads do not
      // propagate further into the pipeline.
      if (!Buffer.isBuffer(output) || output.length === 0) {
        throw new Error(`Tier-${tier} produced invalid empty payload`);
      }
      if (output.length > 1024 * 1024) {
        throw new Error(`Tier-${tier} produced unexpectedly large payload`);
      }

      await prisma.transformation.update({
        where: { id: transformation.id },
        data: { status: "success" },
      });

      await recorder.info(
        "transformation",
        `Tier-${tier} transformation succeeded`,
        transformation.id,
        cycleRunId
      );

      return { payload: output, transformationId: transformation.id };
    } catch (error) {
      await prisma.transformation.update({
        where: { id: transformation.id },
        data: {
          status: "failed",
          errorMessage:
            error instanceof Error ? error.message : "Unknown error",
        },
      });
      await recorder.error(
        "transformation",
        `Tier-${tier} transformation failed on attempt ${attempt}`,
        transformation.id,
        cycleRunId,
        { error }
      );
      throw error;
    }
  }, {
    maxAttempts: 3,
    baseDelayMs: 250,
  });

  return result;
}

export async function runTieredTransformations(
  cycleRunId: string,
  initiationId: string,
  startTier: 1 | 2 | 3 = 1
): Promise<TransformationResult> {
  const seedPayload = Buffer.from(`init:${initiationId}`, "utf8");

  const tiers: TierTransformationResult[] = [];

  for (const tier of [1, 2, 3] as const) {
    if (tier < startTier) {
      // Skip tiers that have already been processed according to the last
      // checkpoint. Existing successful Transformation rows for these tiers
      // are reused implicitly by downstream stages via DB queries.
      continue;
    }
    try {
      const { payload, transformationId } = await runTier(
        cycleRunId,
        initiationId,
        tier,
        seedPayload
      );
      tiers.push({
        tier,
        success: true,
        transformationId,
        payload,
      });
    } catch (_error) {
      // Failure of one tier must not block other tiers; record failure via
      // the inner runTier logic and continue.
      tiers.push({
        tier,
        success: false,
      });
    }
  }

  return { tiers };
}


