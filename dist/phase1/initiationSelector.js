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
    const label = `auto-initiation-${new Date().toISOString()}`;
    const weight = 1.0;
    const metadata = {};
    const hash = crypto_1.default
        .createHash("sha256")
        .update(label + JSON.stringify(metadata))
        .digest("hex");
    const existing = await prisma.initiation.findFirst({
        where: { dedupeHash: hash },
    });
    if (existing) {
        await recorder_1.recorder.info("initiation", "Duplicate initiation hash detected", existing.id, cycleRunId, { dedupeHash: hash });
    }
    const created = await prisma.initiation.create({
        data: {
            label,
            weight,
            metadata: metadata,
            dedupeHash: hash,
            cycleRunId,
        },
    });
    return {
        id: created.id,
        label: created.label,
        weight: created.weight,
        metadata: created.metadata,
    };
}
