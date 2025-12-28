import * as dotenv from "dotenv";

dotenv.config();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? "development",
  PORT: Number(process.env.PORT ?? "3000"),
  DATABASE_URL: requireEnv("DATABASE_URL"),
  GLOBAL_PAUSE: process.env.ORBIT_GLOBAL_PAUSE === "true",
  CRON_SCHEDULE: process.env.ORBIT_CRON_SCHEDULE ?? "0 0,12 * * *",
  PHASE4_ENABLED: process.env.ORBIT_PHASE4_ENABLED === "true",
  PHASE4_ALLOW_MUTATION: process.env.ORBIT_PHASE4_ALLOW_MUTATION === "true",
  RUN_PROFILE_CRON_SCHEDULE:
    process.env.ORBIT_RUN_PROFILE_CRON_SCHEDULE ?? "",
  TELEMETRY_RETENTION_DAYS: Number(
    process.env.ORBIT_TELEMETRY_RETENTION_DAYS ?? "30"
  ),
  TELEMETRY_COLD_ARCHIVE_ENABLED:
    process.env.ORBIT_TELEMETRY_COLD_ARCHIVE_ENABLED === "true",
  MAX_DISPATCH_RETRIES: Number(process.env.ORBIT_MAX_DISPATCH_RETRIES ?? "3"),
};


