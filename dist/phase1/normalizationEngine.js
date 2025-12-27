"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePayloads = normalizePayloads;
const client_1 = require("../db/client");
const recorder_1 = require("./recorder");
async function normalizePayloads(cycleRunId, payloads) {
    const prisma = (0, client_1.getPrismaClient)();
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
    for (let i = 0; i < payloads.length; i += 1) {
        const item = await prisma.normalizationItem.create({
            data: {
                batchId: batch.id,
                status: "success",
            },
        });
        await recorder_1.recorder.info("normalization", "Normalized payload item", item.id, cycleRunId);
        results.push({ normalizationItemId: item.id });
    }
    await prisma.normalizationBatch.update({
        where: { id: batch.id },
        data: { status: "completed" },
    });
    return results;
}
