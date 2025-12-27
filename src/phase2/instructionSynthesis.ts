import crypto from "crypto";
import { Instruction, RunProfile } from "./types";

export function synthesizeInstruction(runProfile: RunProfile): Instruction {
  const context_blob = JSON.stringify({
    asset_bundle: runProfile.asset_bundle,
    distribution_targets: runProfile.distribution_targets,
  });

  const instruction: Instruction = {
    instruction_id: crypto.randomUUID(),
    context_blob,
    constraints: runProfile.execution_policy,
    priority: 0.0,
  };

  return instruction;
}


