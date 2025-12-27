export interface Profile {
  profile_id: string;
  label: string;
  style_vector: Record<string, unknown>;
  asset_bindings: Record<string, unknown>;
  execution_rules: Record<string, unknown>;
  distribution_map: unknown[];
  value_tags: string[];
  state: "enabled" | "paused" | "archived";
}

export interface Instruction {
  instruction_id: string;
  context_blob: string;
  constraints: Record<string, unknown>;
  priority: number;
}

export interface RunProfile {
  run_profile_id: string;
  profile_id: string;
  execution_policy: Record<string, unknown>;
  asset_bundle: Record<string, unknown>;
  distribution_targets: string[];
  value_tags: string[];
  state: "enabled" | "paused" | "archived";
  namespace: string;
}


