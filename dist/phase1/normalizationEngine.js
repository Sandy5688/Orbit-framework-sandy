"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePayloads = normalizePayloads;
const client_1 = require("../db/client");
const recorder_1 = require("./recorder");
async function normalizePayloads(cycleRunId, inputs) {
    const prisma = (0, client_1.getPrismaClient)();
    if (inputs.length === 0) {
        await recorder_1.recorder.warn("normalization", "No successful transformations provided for normalization", undefined, cycleRunId);
        return [];
    }
    const batch = await prisma.normalizationBatch.create({
        data: {
            status: "pending",
            processorRef: null,
        },
    });
    await recorder_1.recorder.info("normalization", "Created normalization batch", batch.id, cycleRunId);
    const results = [];
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
        await recorder_1.recorder.info("normalization", "Normalized payload item", item.id, cycleRunId, { transformationId: input.transformationId });
        results.push({ normalizationItemId: item.id });
    }
    await prisma.normalizationBatch.update({
        where: { id: batch.id },
        data: { status: "completed" },
    });
    return results;
}
