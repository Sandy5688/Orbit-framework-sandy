"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateStrategyProposalsForProfile = generateStrategyProposalsForProfile;
const client_1 = require("../db/client");
async function generateStrategyProposalsForProfile(profileId) {
    const prisma = (0, client_1.getPrismaClient)();
    const signals = await prisma.advisorySignal.findMany({
        where: { profileId },
        orderBy: { createdAt: "desc" },
        take: 5,
    });
    if (!signals.length) {
        return;
    }
    const latest = signals[0];
    await prisma.strategyProposal.create({
        data: {
            profileId,
            signalId: latest.id,
            description: `Strategy proposal based on signal '${latest.signal}'`,
            suggestedChange: {
                recommendation: latest.recommendation,
            },
            status: "pending",
        },
    });
}
