"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runAllEnabledRunProfilesOnce = runAllEnabledRunProfilesOnce;
exports.startRunProfileScheduler = startRunProfileScheduler;
const node_cron_1 = __importDefault(require("node-cron"));
const env_1 = require("../config/env");
const logger_1 = require("../shared/logger");
const profileEngine_1 = require("./profileEngine");
const bridge_1 = require("./bridge");
async function runAllEnabledRunProfilesOnce() {
    const runProfiles = (0, profileEngine_1.getActiveRunProfiles)();
    for (const rp of runProfiles) {
        try {
            await (0, bridge_1.executeRunProfileOnce)(rp);
        }
        catch (error) {
            logger_1.logger.error("Run profile execution failed", {
                runProfileId: rp.run_profile_id,
                error,
            });
        }
    }
}
function startRunProfileScheduler() {
    const schedule = env_1.env.RUN_PROFILE_CRON_SCHEDULE;
    if (!schedule) {
        return;
    }
    logger_1.logger.info(`Starting run profile scheduler with expression: ${schedule}`);
    node_cron_1.default.schedule(schedule, () => {
        runAllEnabledRunProfilesOnce().catch((error) => logger_1.logger.error("Scheduled run profile execution failed", { error }));
    });
}
