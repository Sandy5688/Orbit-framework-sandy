import fs from "fs";
import path from "path";
import crypto from "crypto";
import Ajv from "ajv";
import { Profile, RunProfile } from "./types";
import { getActiveCycleCount } from "../phase1/orchestrator";

const CONFIG_DIR = path.resolve(process.cwd(), "config");

const ajv = new Ajv({ allErrors: true, strict: false });

const profilesSchema = {
  type: "array",
  items: {
    type: "object",
    required: [
      "profile_id",
      "label",
      "style_vector",
      "asset_bindings",
      "execution_rules",
      "distribution_map",
      "value_tags",
      "state",
    ],
    properties: {
      profile_id: { type: "string" },
      label: { type: "string" },
      style_vector: { type: "object" },
      asset_bindings: { type: "object" },
      execution_rules: { type: "object" },
      distribution_map: { type: "array" },
      value_tags: {
        type: "array",
        items: { type: "string" },
      },
      state: {
        type: "string",
        enum: ["enabled", "paused", "archived"],
      },
    },
    additionalProperties: true,
  },
} as const;

const runProfilesSchema = {
  type: "array",
  items: {
    type: "object",
    required: [
      "run_profile_id",
      "profile_id",
      "execution_policy",
      "asset_bundle",
      "distribution_targets",
      "value_tags",
      "state",
      "namespace",
    ],
    properties: {
      run_profile_id: { type: "string" },
      profile_id: { type: "string" },
      execution_policy: { type: "object" },
      asset_bundle: { type: "object" },
      distribution_targets: {
        type: "array",
        items: { type: "string" },
      },
      value_tags: {
        type: "array",
        items: { type: "string" },
      },
      state: {
        type: "string",
        enum: ["enabled", "paused", "archived"],
      },
      namespace: { type: "string" },
    },
    additionalProperties: true,
  },
} as const;

const validateProfilesSchema = ajv.compile(profilesSchema);
const validateRunProfilesSchema = ajv.compile(runProfilesSchema);

let profilesCache: Profile[] | null = null;
let runProfilesCache: RunProfile[] | null = null;
let configVersion: string | null = null;

class ConfigValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

function readJsonFile(fileName: string): unknown {
  const fullPath = path.join(CONFIG_DIR, fileName);
  const raw = fs.readFileSync(fullPath, "utf8");
  return JSON.parse(raw) as unknown;
}

function computeConfigVersion(
  profiles: Profile[],
  runProfiles: RunProfile[]
): string {
  const hash = crypto.createHash("sha256");
  hash.update(JSON.stringify(profiles));
  hash.update(JSON.stringify(runProfiles));
  return hash.digest("hex");
}

function loadAndValidateConfigs(): void {
  const rawProfiles = readJsonFile("profiles.json");
  const rawRunProfiles = readJsonFile("runProfiles.json");

  if (!validateProfilesSchema(rawProfiles)) {
    const errors = ajv.errorsText(validateProfilesSchema.errors);
    throw new ConfigValidationError(
      `Invalid profiles.json configuration: ${errors}`
    );
  }

  if (!validateRunProfilesSchema(rawRunProfiles)) {
    const errors = ajv.errorsText(validateRunProfilesSchema.errors);
    throw new ConfigValidationError(
      `Invalid runProfiles.json configuration: ${errors}`
    );
  }

  profilesCache = rawProfiles as Profile[];
  runProfilesCache = rawRunProfiles as RunProfile[];
  configVersion = computeConfigVersion(profilesCache, runProfilesCache);
}

function ensureConfigsLoaded(): void {
  if (!profilesCache || !runProfilesCache || !configVersion) {
    loadAndValidateConfigs();
  }
}

export function loadProfiles(): Profile[] {
  ensureConfigsLoaded();
  return profilesCache as Profile[];
}

export function loadRunProfiles(): RunProfile[] {
  ensureConfigsLoaded();
  return runProfilesCache as RunProfile[];
}

export function getActiveRunProfiles(): RunProfile[] {
  return loadRunProfiles().filter((rp) => rp.state === "enabled");
}

export function getConfigVersion(): string {
  ensureConfigsLoaded();
  return configVersion as string;
}

export function reloadProfileConfigs(): void {
  if (getActiveCycleCount() > 0) {
    throw new Error(
      "Cannot reload profile configuration while cycles are active"
    );
  }

  loadAndValidateConfigs();
}

export function cloneProfileConfig(profile: Profile): Profile {
  const cloneId = crypto.randomUUID();
  return {
    ...profile,
    profile_id: cloneId,
    label: `${profile.label}-clone`,
  };
}


