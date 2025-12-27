"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.emitTelemetryEvent = emitTelemetryEvent;
const client_1 = require("../db/client");
async function emitTelemetryEvent(eventType, ctx, metadata) {
    const prisma = (0, client_1.getPrismaClient)();
    await prisma.telemetryEvent.create({
        data: {
            eventType,
            profileId: ctx.profileId ?? null,
            runId: ctx.runId ?? null,
            namespace: ctx.namespace ?? null,
            metadata: metadata,
        },
    });
}
