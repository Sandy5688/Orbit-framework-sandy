import { runCycle, type CycleContext } from "../phase1/orchestrator";
import { isNamespaceHalted } from "../phase3/governance";
import { recordValueTags } from "./valueTagging";
import { RunProfile } from "./types";

export async function executeRunProfileOnce(
  runProfile: RunProfile
): Promise<void> {
  const halted = await isNamespaceHalted(runProfile.namespace);
  if (halted) {
    return;
  }

  const context: CycleContext = {
    profileId: runProfile.profile_id,
    runProfileId: runProfile.run_profile_id,
    namespace: runProfile.namespace,
  };

  const cycleRunId = await runCycle("cron", context);

  if (!cycleRunId) {
    return;
  }

  await recordValueTags(runProfile, cycleRunId);
}


