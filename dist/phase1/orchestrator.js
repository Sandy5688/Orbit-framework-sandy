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
    const namespaceKey = context?.namespace ?? "default";
    // Prevent overlapping cycles per namespace by checking for an existing
    // running cycle with the same namespace.
    const existingRunning = await prisma.cycleRun.findFirst({
        where: {
            status: "running",
            contextJson: {
                path: ["namespace"],
                equals: context?.namespace ?? null,
            },
        },
    });
    if (existingRunning) {
        logger_1.logger.warn(`Cycle already running for namespace ${namespaceKey}; skipping new cycle`);
        await recorder_1.recorder.warn("cycle", "Skipped cycle due to existing running cycle for namespace", existingRunning.id, existingRunning.id, { namespace: context?.namespace ?? null, trigger });
        return "";
    }
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
    let initiationSucceeded = false;
    let transformationsSucceeded = false;
    let normalizationSucceeded = false;
    let dispatchSucceeded = false;
    let initiationId = null;
    let transformationsResult = null;
    let normalizationItemIds = [];
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
        // --- Initiation stage ---
        try {
            await recorder_1.recorder.info("initiation", "Initiation stage started", undefined, cycle.id);
            const initiation = await (0, initiationSelector_1.generateInitiation)(cycle.id);
            initiationId = initiation.id;
            initiationSucceeded = true;
            await recorder_1.recorder.info("initiation", "Initiation stage completed", initiation.id, cycle.id);
        }
        catch (error) {
            await recorder_1.recorder.error("initiation", "Initiation stage failed", undefined, cycle.id, { error });
        }
        // --- Transformation stage ---
        if (initiationSucceeded && initiationId) {
            try {
                await recorder_1.recorder.info("transformation", "Transformation stage started", initiationId, cycle.id);
                transformationsResult = await (0, transformations_1.runTieredTransformations)(cycle.id, initiationId);
                const successfulTiers = transformationsResult.tiers.filter((t) => t.success).length;
                transformationsSucceeded = successfulTiers > 0;
                await recorder_1.recorder.info("transformation", "Transformation stage completed", initiationId, cycle.id, {
                    tiers: transformationsResult.tiers.map((t) => ({
                        tier: t.tier,
                        success: t.success,
                        transformationId: t.transformationId,
                    })),
                });
            }
            catch (error) {
                await recorder_1.recorder.error("transformation", "Transformation stage failed", initiationId, cycle.id, { error });
            }
        }
        // --- Normalization stage ---
        if (transformationsSucceeded && transformationsResult) {
            try {
                await recorder_1.recorder.info("normalization", "Normalization stage started", undefined, cycle.id);
                const normalizationInputs = transformationsResult.tiers
                    .filter((t) => t.success && t.transformationId && t.payload !== undefined)
                    .map((t) => ({
                    transformationId: t.transformationId,
                    payload: t.payload,
                }));
                const normalizationResults = await (0, normalizationEngine_1.normalizePayloads)(cycle.id, normalizationInputs);
                normalizationItemIds = normalizationResults.map((r) => r.normalizationItemId);
                normalizationSucceeded = normalizationItemIds.length > 0;
                await recorder_1.recorder.info("normalization", "Normalization stage completed", undefined, cycle.id, { normalizationItemCount: normalizationItemIds.length });
            }
            catch (error) {
                await recorder_1.recorder.error("normalization", "Normalization stage failed", undefined, cycle.id, { error });
            }
        }
        // --- Dispatch stage ---
        if (normalizationSucceeded && normalizationItemIds.length > 0) {
            try {
                await recorder_1.recorder.info("dispatch", "Dispatch stage started", undefined, cycle.id, { normalizationItemCount: normalizationItemIds.length });
                // Use a generic endpoint key; concrete mapping is supplied via config.
                await (0, dispatchQueue_1.enqueueDispatchJobs)(cycle.id, normalizationItemIds, "default-endpoint");
                await (0, dispatchQueue_1.processDispatchQueue)(cycle.id, context);
                dispatchSucceeded = true;
                await recorder_1.recorder.info("dispatch", "Dispatch stage completed", undefined, cycle.id);
            }
            catch (error) {
                // Dispatch failures must not cause the entire cycle to be treated as
                // failed; record the failure and continue.
                await recorder_1.recorder.error("dispatch", "Dispatch stage failed", undefined, cycle.id, { error });
            }
        }
        const anyStageSucceeded = initiationSucceeded ||
            transformationsSucceeded ||
            normalizationSucceeded ||
            dispatchSucceeded;
        let finalStatus;
        if (!anyStageSucceeded) {
            finalStatus = "failed";
        }
        else if (initiationSucceeded &&
            transformationsSucceeded &&
            normalizationSucceeded &&
            dispatchSucceeded) {
            finalStatus = "success";
        }
        else {
            finalStatus = "partial_success";
        }
        await prisma.cycleRun.update({
            where: { id: cycle.id },
            data: {
                status: finalStatus,
                finishedAt: new Date(),
            },
        });
        await recorder_1.recorder.info("cycle", "Cycle completed", cycle.id, cycle.id, {
            finalStatus,
            stages: {
                initiation: initiationSucceeded,
                transformations: transformationsSucceeded,
                normalization: normalizationSucceeded,
                dispatch: dispatchSucceeded,
            },
        });
    }
    catch (error) {
        await prisma.cycleRun.update({
            where: { id: cycle.id },
            data: {
                status: "failed",
                finishedAt: new Date(),
            },
        });
        await recorder_1.recorder.error("cycle", "Cycle failed with unexpected error", cycle.id, cycle.id, { error });
    }
    return cycle.id;
}
