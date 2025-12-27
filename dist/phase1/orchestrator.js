"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCycle = runCycle;
const client_1 = require("../db/client");
const env_1 = require("../config/env");
const logger_1 = require("../shared/logger");
const telemetryBus_1 = require("../phase3/telemetryBus");
const initiationSelector_1 = require("./initiationSelector");
const normalizationEngine_1 = require("./normalizationEngine");
const transformations_1 = require("./transformations");
const dispatchQueue_1 = require("./dispatchQueue");
const recorder_1 = require("./recorder");
async function runCycle(trigger, context) {
    if (env_1.env.GLOBAL_PAUSE) {
        logger_1.logger.warn("Global pause is enabled; skipping cycle");
        return "";
    }
    const prisma = (0, client_1.getPrismaClient)();
    const cycle = await prisma.cycleRun.create({
        data: {
            status: "running",
            contextJson: {
                trigger,
                profileId: context?.profileId ?? null,
                runProfileId: context?.runProfileId ?? null,
                instructionId: context?.instructionId ?? null,
                namespace: context?.namespace ?? null,
            },
        },
    });
    try {
        await recorder_1.recorder.info("cycle", "Cycle started", cycle.id, cycle.id, {
            trigger,
            context,
        });
        await (0, telemetryBus_1.emitTelemetryEvent)("execution_started", {
            profileId: context?.profileId,
            runId: context?.runProfileId,
            namespace: context?.namespace,
        }, { cycleRunId: cycle.id });
        const initiation = await (0, initiationSelector_1.generateInitiation)(cycle.id);
        const transformations = await (0, transformations_1.runTieredTransformations)(cycle.id, initiation.id);
        const normalizationResults = await (0, normalizationEngine_1.normalizePayloads)(cycle.id, [
            transformations.tier3Payload,
        ]);
        const normalizationItemIds = normalizationResults.map((r) => r.normalizationItemId);
        // Use a generic endpoint key; concrete mapping is supplied via config.
        await (0, dispatchQueue_1.enqueueDispatchJobs)(cycle.id, normalizationItemIds, "default-endpoint");
        await (0, dispatchQueue_1.processDispatchQueue)(cycle.id, context);
        await prisma.cycleRun.update({
            where: { id: cycle.id },
            data: {
                status: "success",
                finishedAt: new Date(),
            },
        });
        await recorder_1.recorder.info("cycle", "Cycle completed", cycle.id, cycle.id);
    }
    catch (error) {
        await prisma.cycleRun.update({
            where: { id: cycle.id },
            data: {
                status: "failed",
                finishedAt: new Date(),
            },
        });
        await recorder_1.recorder.error("cycle", "Cycle failed", cycle.id, cycle.id, { error });
    }
    return cycle.id;
}
