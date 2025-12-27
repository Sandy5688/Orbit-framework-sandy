"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runTieredTransformations = runTieredTransformations;
const client_1 = require("../db/client");
const retry_1 = require("../shared/retry");
const recorder_1 = require("./recorder");
async function runTier(cycleRunId, initiationId, tier, input) {
    const prisma = (0, client_1.getPrismaClient)();
    let attempt = 0;
    const result = await (0, retry_1.withRetry)(async () => {
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
            const output = tier === 1
                ? Buffer.from(input.toString("base64"))
                : tier === 2
                    ? Buffer.from(input.toString("hex"))
                    : Buffer.from(input.toString("utf8"));
            await prisma.transformation.update({
                where: { id: transformation.id },
                data: { status: "success" },
            });
            await recorder_1.recorder.info("transformation", `Tier-${tier} transformation succeeded`, transformation.id, cycleRunId);
            return output;
        }
        catch (error) {
            await prisma.transformation.update({
                where: { id: transformation.id },
                data: {
                    status: "failed",
                    errorMessage: error instanceof Error ? error.message : "Unknown error",
                },
            });
            await recorder_1.recorder.error("transformation", `Tier-${tier} transformation failed on attempt ${attempt}`, transformation.id, cycleRunId, { error });
            throw error;
        }
    }, {
        maxAttempts: 3,
        baseDelayMs: 250,
    });
    return result;
}
async function runTieredTransformations(cycleRunId, initiationId) {
    const seedPayload = Buffer.from(`init:${initiationId}`, "utf8");
    const tier1Payload = await runTier(cycleRunId, initiationId, 1, seedPayload);
    const tier2Payload = await runTier(cycleRunId, initiationId, 2, tier1Payload);
    const tier3Payload = await runTier(cycleRunId, initiationId, 3, tier2Payload);
    return { tier1Payload, tier2Payload, tier3Payload };
}
