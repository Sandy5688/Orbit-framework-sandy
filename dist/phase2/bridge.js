"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeRunProfileOnce = executeRunProfileOnce;
const orchestrator_1 = require("../phase1/orchestrator");
const governance_1 = require("../phase3/governance");
const valueTagging_1 = require("./valueTagging");
async function executeRunProfileOnce(runProfile) {
    const halted = await (0, governance_1.isNamespaceHalted)(runProfile.namespace);
    if (halted) {
        return;
    }
    const context = {
        profileId: runProfile.profile_id,
        runProfileId: runProfile.run_profile_id,
        namespace: runProfile.namespace,
    };
    const cycleRunId = await (0, orchestrator_1.runCycle)("cron", context);
    if (!cycleRunId) {
        return;
    }
    await (0, valueTagging_1.recordValueTags)(runProfile, cycleRunId);
}
