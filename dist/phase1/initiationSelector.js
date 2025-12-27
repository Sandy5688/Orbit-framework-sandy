"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateInitiation = generateInitiation;
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../db/client");
const recorder_1 = require("./recorder");
async function generateInitiation(cycleRunId) {
    const prisma = (0, client_1.getPrismaClient)();
    // Derive a stable deduplication source from execution context only.
    const cycle = await prisma.cycleRun.findUnique({
        where: { id: cycleRunId },
    });
    const context = (cycle?.contextJson ?? {});
    const stableContext = {
        profileId: context.profileId ?? null,
        runProfileId: context.runProfileId ?? null,
        instructionId: context.instructionId ?? null,
        namespace: context.namespace ?? null,
    };
    const dedupeSource = JSON.stringify(stableContext);
    const hash = crypto_1.default.createHash("sha256").update(dedupeSource).digest("hex");
    const existing = await prisma.initiation.findFirst({
        where: { dedupeHash: hash },
    });
    if (existing) {
        // Reuse existing initiation for identical stable context; do not create a
        // duplicate initiation record.
        await recorder_1.recorder.info("initiation", "Reusing existing initiation for stable context", existing.id, cycleRunId, { dedupeHash: hash });
        return {
            id: existing.id,
            label: existing.label,
            weight: existing.weight,
            metadata: existing.metadata,
        };
    }
    const label = `auto-initiation-${hash.slice(0, 8)}`;
    const weight = 1.0;
    const metadata = {
        ...stableContext,
    };
    const created = await prisma.initiation.create({
        data: {
            label,
            weight,
            metadata: metadata,
            dedupeHash: hash,
            cycleRunId,
        },
    });
    await recorder_1.recorder.info("initiation", "Created initiation for stable context", created.id, cycleRunId, { dedupeHash: hash });
    return {
        id: created.id,
        label: created.label,
        weight: created.weight,
        metadata: created.metadata,
    };
}
