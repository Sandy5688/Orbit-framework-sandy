"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadProfiles = loadProfiles;
exports.loadRunProfiles = loadRunProfiles;
exports.getActiveRunProfiles = getActiveRunProfiles;
exports.cloneProfileConfig = cloneProfileConfig;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const crypto_1 = __importDefault(require("crypto"));
const CONFIG_DIR = path_1.default.resolve(process.cwd(), "config");
function readJsonFile(fileName, fallback) {
    try {
        const fullPath = path_1.default.join(CONFIG_DIR, fileName);
        const raw = fs_1.default.readFileSync(fullPath, "utf8");
        return JSON.parse(raw);
    }
    catch {
        return fallback;
    }
}
function loadProfiles() {
    const profiles = readJsonFile("profiles.json", []);
    return profiles;
}
function loadRunProfiles() {
    const runProfiles = readJsonFile("runProfiles.json", []);
    return runProfiles;
}
function getActiveRunProfiles() {
    return loadRunProfiles().filter((rp) => rp.state === "enabled");
}
function cloneProfileConfig(profile) {
    const cloneId = crypto_1.default.randomUUID();
    return {
        ...profile,
        profile_id: cloneId,
        label: `${profile.label}-clone`,
    };
}
