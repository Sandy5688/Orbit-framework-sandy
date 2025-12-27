"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startScheduler = startScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const env_1 = require("../config/env");
const logger_1 = require("../shared/logger");
const orchestrator_1 = require("./orchestrator");
function startScheduler() {
    if (!env_1.env.CRON_SCHEDULE) {
        logger_1.logger.warn("No CRON schedule configured; scheduler not started");
        return;
    }
    logger_1.logger.info(`Starting scheduler with expression: ${env_1.env.CRON_SCHEDULE}`);
    node_cron_1.default.schedule(env_1.env.CRON_SCHEDULE, () => {
        (0, orchestrator_1.runCycle)("cron").catch((error) => {
            logger_1.logger.error("Scheduled cycle failed", { error });
        });
    });
}
