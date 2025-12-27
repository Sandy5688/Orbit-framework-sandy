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
    const job = await prisma.dispatchJob.create({
      data: {
        endpointKey,
        status: "pending",
        normalizationItemId,
      },
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

  const pendingJobs = await prisma.dispatchJob.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
  });

  for (const job of pendingJobs) {
    const endpoint = dispatchConfig.get(job.endpointKey);

    if (!endpoint) {
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
      await prisma.dispatchJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          lastError:
            error instanceof Error ? error.message : "Unknown dispatch error",
        },
      });
      await recorder.error(
        "dispatch",
        "Dispatch job failed",
        job.id,
        cycleRunId,
        { error }
      );
    }
  }
}


