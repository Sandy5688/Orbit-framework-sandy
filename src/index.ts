import { env } from "./config/env";
import { logger } from "./shared/logger";
import { createApp } from "./http/app";
import { startScheduler } from "./phase1/scheduler";
import { startRunProfileScheduler } from "./phase2/runProfileOrchestration";
import { loadProfiles, loadRunProfiles } from "./phase2/profileEngine";
import { getActiveCycleCount } from "./phase1/orchestrator";

let server: any = null;
let isShuttingDown = false;

async function main() {
  // Validate and load configuration on boot; invalid config must prevent the
  // process from starting.
  loadProfiles();
  loadRunProfiles();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    logger.info(`Orbit Framework HTTP server listening on port ${env.PORT}`);
  });

  startScheduler();
  startRunProfileScheduler();
}

/**
 * Graceful shutdown handler
 * Drains active cycles before terminating the process
 */
function setupGracefulShutdown() {
  const shutdownSignals = ["SIGTERM", "SIGINT"];

  shutdownSignals.forEach((signal) => {
    process.on(signal, async () => {
      if (isShuttingDown) {
        logger.warn(`Received ${signal} again; forcing shutdown`);
        // eslint-disable-next-line no-process-exit
        process.exit(1);
      }

      isShuttingDown = true;
      logger.info(`Received ${signal}; starting graceful shutdown`);

      // Stop accepting new requests
      if (server) {
        server.close(() => {
          logger.info("HTTP server closed");
        });
      }

      // Drain active cycles
      let activeCycles = getActiveCycleCount();
      const drainStart = Date.now();
      const drainTimeoutMs = 30000; // 30 second timeout for graceful drain

      while (activeCycles > 0) {
        const elapsedMs = Date.now() - drainStart;
        if (elapsedMs > drainTimeoutMs) {
          logger.warn(
            `Graceful drain timeout reached; ${activeCycles} cycles still active`
          );
          break;
        }

        logger.info(
          `Waiting for ${activeCycles} active cycle(s) to complete...`
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
        activeCycles = getActiveCycleCount();
      }

      logger.info("Graceful shutdown complete");
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    });
  });
}

main().catch((error) => {
  logger.error("Fatal error during startup", { error });
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

setupGracefulShutdown();


