"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const env_1 = require("./config/env");
const logger_1 = require("./shared/logger");
const app_1 = require("./http/app");
const scheduler_1 = require("./phase1/scheduler");
const runProfileOrchestration_1 = require("./phase2/runProfileOrchestration");
async function main() {
    const app = (0, app_1.createApp)();
    app.listen(env_1.env.PORT, () => {
        logger_1.logger.info(`Orbit Framework HTTP server listening on port ${env_1.env.PORT}`);
    });
    (0, scheduler_1.startScheduler)();
    (0, runProfileOrchestration_1.startRunProfileScheduler)();
}
main().catch((error) => {
    logger_1.logger.error("Fatal error during startup", { error });
    // eslint-disable-next-line no-process-exit
    process.exit(1);
});
