"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackExecutionSignal = trackExecutionSignal;
const client_1 = require("../db/client");
async function trackExecutionSignal(runProfile, cycleRunId) {
    const prisma = (0, client_1.getPrismaClient)();
    const deliveries = await prisma.dispatchJob.count({
        where: {
            status: "delivered",
        },
    });
    await prisma.governanceSetting.upsert({
        where: {
            namespace_key: {
                namespace: runProfile.namespace,
                key: `signal:${runProfile.run_profile_id}`,
            },
        },
        create: {
            namespace: runProfile.namespace,
            key: `signal:${runProfile.run_profile_id}`,
            value: {
                executions: { connect: { id: cycleRunId } },
                deliveries,
            },
        },
        update: {
            value: {
                executions: { connect: { id: cycleRunId } },
                deliveries,
            },
        },
    });
}
