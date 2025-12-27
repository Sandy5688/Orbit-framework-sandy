import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../shared/logger";
import { runCycle } from "./orchestrator";

export function startScheduler(): void {
  if (!env.CRON_SCHEDULE) {
    logger.warn("No CRON schedule configured; scheduler not started");
    return;
  }

  logger.info(`Starting scheduler with expression: ${env.CRON_SCHEDULE}`);

  cron.schedule(env.CRON_SCHEDULE, () => {
    runCycle("cron").catch((error) => {
      logger.error("Scheduled cycle failed", { error });
    });
  });
}


