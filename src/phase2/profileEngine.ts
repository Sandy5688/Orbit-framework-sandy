import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Profile, RunProfile } from "./types";

const CONFIG_DIR = path.resolve(process.cwd(), "config");

function readJsonFile<T>(fileName: string, fallback: T): T {
  try {
    const fullPath = path.join(CONFIG_DIR, fileName);
    const raw = fs.readFileSync(fullPath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function loadProfiles(): Profile[] {
  const profiles = readJsonFile<Profile[]>("profiles.json", []);
  return profiles;
}

export function loadRunProfiles(): RunProfile[] {
  const runProfiles = readJsonFile<RunProfile[]>("runProfiles.json", []);
  return runProfiles;
}

export function getActiveRunProfiles(): RunProfile[] {
  return loadRunProfiles().filter((rp) => rp.state === "enabled");
}

export function cloneProfileConfig(profile: Profile): Profile {
  const cloneId = crypto.randomUUID();
  return {
    ...profile,
    profile_id: cloneId,
    label: `${profile.label}-clone`,
  };
}


