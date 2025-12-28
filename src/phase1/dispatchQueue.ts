import { getPrismaClient } from "../db/client";
import { dispatchConfig } from "../config/dispatch";
import { emitTelemetryEvent } from "../phase3/telemetryBus";
import { recorder } from "./recorder";
import type { CycleContext } from "./orchestrator";

export async function enqueueDispatchJobs(
  cycleRunId: string,
  normalizationItemIds: string[],
  endpointKey: string
): Promise<void> {
  const prisma = getPrismaClient();

  for (const normalizationItemId of normalizationItemIds) {
    const endpoint = dispatchConfig.get(endpointKey);

    // Idempotency: avoid enqueuing duplicate jobs for the same
    // normalizationItemId/endpointKey pair.
    const existing = await prisma.dispatchJob.findFirst({
      where: {
        normalizationItemId,
        endpointKey,
      },
    });

    if (existing) {
      await recorder.info(
        "dispatch",
        "Skipped enqueue of duplicate dispatch job",
        existing.id,
        cycleRunId,
        { normalizationItemId, endpointKey }
      );
      // eslint-disable-next-line no-continue
      continue;
    }

    const job = await prisma.dispatchJob.create({
      data: {
        endpointKey,
        status: "pending",
        normalizationItemId,
        endpointUrl: endpoint?.url ?? null,
        endpointMethod: endpoint?.method ?? "POST",
        tokenSnapshot: endpoint?.token ?? null,
      } as any,
    });

    await recorder.info(
      "dispatch",
      "Enqueued dispatch job",
      job.id,
      cycleRunId
    );
  }
}

export async function processDispatchQueue(
  cycleRunId: string,
  context?: CycleContext
): Promise<void> {
  const prisma = getPrismaClient();

  const maxAttemptsEnv = process.env.ORBIT_MAX_DISPATCH_RETRIES;
  const maxAttempts =
    maxAttemptsEnv !== undefined ? Number(maxAttemptsEnv) || 3 : 3;

  // Scope dispatch processing to the current cycle by resolving normalization
  // items that belong to this cycle's transformations/initiations.
  const normalizationItemsForCycle = await prisma.normalizationItem.findMany({
    where: {
      transformation: {
        initiation: {
          cycleRunId,
        },
      },
    },
    select: { id: true },
  });

  const normalizationItemIds = normalizationItemsForCycle.map((ni) => ni.id);

  if (normalizationItemIds.length === 0) {
    await recorder.warn(
      "dispatch",
      "No normalization items found for cycle; skipping dispatch processing",
      undefined,
      cycleRunId
    );
    return;
  }

  const pendingJobs = await prisma.dispatchJob.findMany({
    where: {
      status: "pending",
      normalizationItemId: { in: normalizationItemIds },
    },
    orderBy: { createdAt: "asc" },
  });

  for (const job of pendingJobs) {
    // Prefer the snapshotted endpoint details captured at enqueue time to
    // ensure mid-cycle config changes do not affect in-flight jobs.
    const endpoint = {
      url: job.endpointUrl ?? dispatchConfig.get(job.endpointKey)?.url,
      method: job.endpointMethod ?? dispatchConfig.get(job.endpointKey)?.method ?? "POST",
      token: job.tokenSnapshot ?? dispatchConfig.get(job.endpointKey)?.token,
    };

    if (!endpoint.url) {
      await prisma.dispatchJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError: "No endpoint configuration found",
        },
      });
      await recorder.error(
        "dispatch",
        "Dispatch endpoint configuration missing",
        job.id,
        cycleRunId,
        { endpointKey: job.endpointKey }
      );
      // Continue with next job; partial failure must not halt execution.
      // eslint-disable-next-line no-continue
      continue;
    }

    try {
      await prisma.dispatchJob.update({
        where: { id: job.id },
        data: { status: "delivering" },
      });

      const headers: Record<string, string> = {
        "Content-Type": "application/octet-stream",
      };
      if (endpoint.token) {
        headers.Authorization = `Bearer ${endpoint.token}`;
      }

      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        headers,
        body: Buffer.from(`opaque-payload-for-${job.id}`),
      });

      const receipt = {
        status: response.status,
        ok: response.ok,
      };

      await prisma.dispatchJob.update({
        where: { id: job.id },
        data: {
          status: response.ok ? "delivered" : "failed",
          receiptJson: receipt as any,
          lastError: response.ok ? null : `HTTP ${response.status}`,
        },
      });

      await recorder.info(
        "dispatch",
        "Dispatch job processed",
        job.id,
        cycleRunId,
        receipt
      );

      if (response.ok) {
        await emitTelemetryEvent(
          "delivery_confirmed",
          {
            profileId: context?.profileId,
            runId: context?.runProfileId,
            namespace: context?.namespace,
          },
          {
            cycleRunId,
            dispatchJobId: job.id,
            status: response.status,
          }
        );
      }
    } catch (error) {
      const lastError =
        error instanceof Error ? error.message : "Unknown dispatch error";

      const nextAttempt = job.attempt + 1;
      const isExhausted = nextAttempt >= maxAttempts;

      if (isExhausted) {
        // Move job to dead-letter queue and mark as failed; do not retry.
        await prisma.dispatchJob.update({
          where: { id: job.id },
          data: {
            status: "failed",
            attempt: nextAttempt,
            lastError,
          },
        });

        await prisma.deadLetterDispatch.create({
          data: {
            dispatchJobId: job.id,
            normalizationItemId: job.normalizationItemId,
            endpointKey: job.endpointKey,
            lastStatus: null,
            lastError,
            payloadMeta: {
              cycleRunId,
            } as any,
          },
        });
      } else {
        // Increment attempt counter and leave status as pending so the job can
        // be retried on the next processing pass.
        await prisma.dispatchJob.update({
          where: { id: job.id },
          data: {
            attempt: nextAttempt,
            lastError,
          },
        });
      }

      await recorder.error(
        "dispatch",
        isExhausted ? "Dispatch job moved to dead-letter queue" : "Dispatch job failed",
        job.id,
        cycleRunId,
        {
          error,
          attempt: nextAttempt,
          maxAttempts,
          deadLettered: isExhausted,
        }
      );
    }
  }
}


