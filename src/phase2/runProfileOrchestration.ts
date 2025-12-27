import cron from "node-cron";
import { env } from "../config/env";
import { logger } from "../shared/logger";
import { getActiveRunProfiles } from "./profileEngine";
import { executeRunProfileOnce } from "./bridge";

export async function runAllEnabledRunProfilesOnce(): Promise<void> {
  const runProfiles = getActiveRunProfiles();

  for (const rp of runProfiles) {
    try {
      await executeRunProfileOnce(rp);
    } catch (error) {
      logger.error("Run profile execution failed", {
        runProfileId: rp.run_profile_id,
        error,
      });
    }
  }
}

export function startRunProfileScheduler(): void {
  const schedule = env.RUN_PROFILE_CRON_SCHEDULE;

  if (!schedule) {
    return;
  }

  logger.info(
    `Starting run profile scheduler with expression: ${schedule}`
  );

  cron.schedule(schedule, () => {
    runAllEnabledRunProfilesOnce().catch((error) =>
      logger.error("Scheduled run profile execution failed", { error })
    );
  });
}


