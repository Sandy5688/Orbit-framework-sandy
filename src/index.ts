import { env } from "./config/env";
import { logger } from "./shared/logger";
import { createApp } from "./http/app";
import { startScheduler } from "./phase1/scheduler";
import { startRunProfileScheduler } from "./phase2/runProfileOrchestration";

async function main() {
  const app = createApp();

  app.listen(env.PORT, () => {
    logger.info(`Orbit Framework HTTP server listening on port ${env.PORT}`);
  });

  startScheduler();
  startRunProfileScheduler();
}

main().catch((error) => {
  logger.error("Fatal error during startup", { error });
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});


