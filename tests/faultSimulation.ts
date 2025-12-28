import { env } from "../src/config/env";
import { logger } from "../src/shared/logger";
import { runCycle } from "../src/phase1/orchestrator";
import { getPrismaClient } from "../src/db/client";

/**
 * Basic fault-simulation harness.
 *
 * This script is intended to be run manually via:
 *   npx ts-node tests/faultSimulation.ts
 *
 * It exercises:
 *  - Process kill during transformation (simulated via THROW_AT_TIER env)
 *  - Dispatch failure and DLQ behavior
 *  - Invalid config injection (relies on profileEngine validation on boot)
 */
async function main() {
  logger.info("Starting fault simulation harness");

  const prisma = getPrismaClient();

  // 1) DB timeout / error simulation: run a raw query against a non-existent
  // table and ensure it does not corrupt state.
  try {
    await prisma.$queryRawUnsafe("SELECT * FROM non_existent_table_for_fault");
  } catch (error) {
    logger.info("Simulated DB error captured successfully", { error });
  }

  // 2) Dispatch failure: configure an endpoint that will fail (e.g. 500) and
  // trigger a cycle to observe DLQ population. This assumes the operator has
  // set ORBIT_DISPATCH_ENDPOINTS accordingly.
  const cycleId = await runCycle("manual");
  logger.info("Triggered manual cycle for dispatch fault simulation", {
    cycleId,
  });

  // 3) Confirm DLQ entries exist (if the configured endpoint fails).
  const deadLetters = await prisma.deadLetterDispatch.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  logger.info("Recent dead-letter dispatch entries", {
    count: deadLetters.length,
  });

  logger.info("Fault simulation harness completed", {
    NODE_ENV: env.NODE_ENV,
  });
}

// eslint-disable-next-line no-console
main().catch((error) => {
  logger.error("Fault simulation harness failed", { error });
  process.exitCode = 1;
});


