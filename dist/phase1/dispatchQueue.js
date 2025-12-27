"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enqueueDispatchJobs = enqueueDispatchJobs;
exports.processDispatchQueue = processDispatchQueue;
const client_1 = require("../db/client");
const dispatch_1 = require("../config/dispatch");
const telemetryBus_1 = require("../phase3/telemetryBus");
const recorder_1 = require("./recorder");
async function enqueueDispatchJobs(cycleRunId, normalizationItemIds, endpointKey) {
    const prisma = (0, client_1.getPrismaClient)();
    for (const normalizationItemId of normalizationItemIds) {
        const job = await prisma.dispatchJob.create({
            data: {
                endpointKey,
                status: "pending",
                normalizationItemId,
            },
        });
        await recorder_1.recorder.info("dispatch", "Enqueued dispatch job", job.id, cycleRunId);
    }
}
async function processDispatchQueue(cycleRunId, context) {
    const prisma = (0, client_1.getPrismaClient)();
    const pendingJobs = await prisma.dispatchJob.findMany({
        where: { status: "pending" },
        orderBy: { createdAt: "asc" },
    });
    for (const job of pendingJobs) {
        const endpoint = dispatch_1.dispatchConfig.get(job.endpointKey);
        if (!endpoint) {
            await prisma.dispatchJob.update({
                where: { id: job.id },
                data: {
                    status: "failed",
                    lastError: "No endpoint configuration found",
                },
            });
            await recorder_1.recorder.error("dispatch", "Dispatch endpoint configuration missing", job.id, cycleRunId, { endpointKey: job.endpointKey });
            // Continue with next job; partial failure must not halt execution.
            // eslint-disable-next-line no-continue
            continue;
        }
        try {
            await prisma.dispatchJob.update({
                where: { id: job.id },
                data: { status: "delivering" },
            });
            const headers = {
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
                    receiptJson: receipt,
                    lastError: response.ok ? null : `HTTP ${response.status}`,
                },
            });
            await recorder_1.recorder.info("dispatch", "Dispatch job processed", job.id, cycleRunId, receipt);
            if (response.ok) {
                await (0, telemetryBus_1.emitTelemetryEvent)("delivery_confirmed", {
                    profileId: context?.profileId,
                    runId: context?.runProfileId,
                    namespace: context?.namespace,
                }, {
                    cycleRunId,
                    dispatchJobId: job.id,
                    status: response.status,
                });
            }
        }
        catch (error) {
            await prisma.dispatchJob.update({
                where: { id: job.id },
                data: {
                    status: "failed",
                    lastError: error instanceof Error ? error.message : "Unknown dispatch error",
                },
            });
            await recorder_1.recorder.error("dispatch", "Dispatch job failed", job.id, cycleRunId, { error });
        }
    }
}
