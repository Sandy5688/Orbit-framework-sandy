"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeAdvisorySignalsForProfile = computeAdvisorySignalsForProfile;
const client_1 = require("../db/client");
async function computeAdvisorySignalsForProfile(profileId) {
    const prisma = (0, client_1.getPrismaClient)();
    const events = await prisma.telemetryEvent.findMany({
        where: { profileId },
        orderBy: { timestamp: "asc" },
    });
    if (!events.length) {
        return;
    }
    const executions = events.filter((e) => e.eventType === "execution_started").length;
    const deliveries = events.filter((e) => e.eventType === "delivery_confirmed").length;
    const ratio = executions === 0 ? 0 : deliveries / executions;
    const signal = ratio > 0.8 ? "elevated_performance" : ratio < 0.2 ? "low_performance" : "stable";
    await prisma.advisorySignal.create({
        data: {
            profileId,
            signal,
            confidence: Math.min(1, Math.max(0, ratio)),
            recommendation: signal === "elevated_performance"
                ? "consider_increasing_weight"
                : signal === "low_performance"
                    ? "consider_decreasing_weight"
                    : "monitor",
        },
    });
}
