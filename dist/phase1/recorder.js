"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.recorder = void 0;
const client_1 = require("../db/client");
const logger_1 = require("../shared/logger");
async function record(scope, level, message, refId, cycleRunId, details) {
    const prisma = (0, client_1.getPrismaClient)();
    try {
        await prisma.executionRecord.create({
            data: {
                scope,
                level,
                message,
                refId,
                cycleRunId,
                details: details,
            },
        });
    }
    catch (error) {
        logger_1.logger.error("Failed to persist execution record", { error });
    }
}
exports.recorder = {
    info: (scope, message, refId, cycleRunId, details) => record(scope, "info", message, refId, cycleRunId, details),
    warn: (scope, message, refId, cycleRunId, details) => record(scope, "warning", message, refId, cycleRunId, details),
    error: (scope, message, refId, cycleRunId, details) => record(scope, "error", message, refId, cycleRunId, details),
};
