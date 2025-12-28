# Orbit Framework (Phase 1–4 Skeleton)

This project is a modular, phased orchestration framework for unattended execution, transformation, normalization, and dispatch of opaque payloads. All semantics are injected via configuration and interfaces rather than hard-coded logic.

## Stack

- Runtime: Node.js + TypeScript
- Web: Express
- ORM: Prisma (PostgreSQL)
- Scheduler: node-cron
- Config: JSON files in `config/`

## System Topology

- `src/phase1`: Core execution pipeline
  - `orchestrator`: crash-resilient single-cycle runner that creates a `CycleRun`, generates an initiation object, writes append-only checkpoints, runs 3-tier transformations, normalizes payloads, enqueues dispatch jobs, and processes the dispatch queue with resume semantics.
  - `initiationSelector`: stateless initiation generator with deterministic hash-based idempotency per run profile.
  - `transformations`: Tier-1/2/3 opaque async transformations with retries and exponential backoff.
  - `normalizationEngine`: batch-based normalization via an external processor boundary (modeled as a no-op wrapper) with idempotent item creation.
  - `dispatchQueue`: queue-based dispatch to configurable HTTP endpoints with delivery receipts, retry thresholds, and a dead-letter queue.
  - `recorder`: append-only execution records.
- `src/phase2`: Configurable abstraction layer
  - `profileEngine`: loads `profiles.json` and `runProfiles.json` config.
  - `instructionSynthesis`: stateless instruction objects per run profile.
  - `runProfileOrchestration`: executes enabled run profiles (manual + cron).
  - `bridge`: sends structured run profile context into Phase-1.
  - `valueTagging`: append-only usage and value tagging ledger.
- `src/phase3`: Observability & advisory
  - `telemetryBus`: normalized, replayable telemetry events with retention and optional cold archive.
  - `correlationEngine`: simple performance correlation and advisory signals.
  - `strategySuggestion`: logged strategy proposals (never auto-applied).
  - `governance`: namespace-level halt and audit trail.
- `src/phase4`: Controlled autonomy (disabled)
  - `autonomy`: double-guarded stubs that log activity but never mutate profiles unless explicitly and intentionally enabled.

## Profile & Run Lifecycle

1. **Profiles** (`config/profiles.json`)
   - Define execution identity and behavior.
   - Fields: `profile_id`, `label`, `style_vector`, `asset_bindings`, `execution_rules`, `distribution_map`, `value_tags`, `state`.
   - Fully config-driven; unlimited profiles; hot enable/disable via `state`.
2. **Run Profiles** (`config/runProfiles.json`)
   - Bind profiles to execution surfaces: `run_profile_id`, `profile_id`, `execution_policy`, `asset_bundle`, `distribution_targets`, `value_tags`, `state`, `namespace`.
   - Independently schedulable (via `ORBIT_RUN_PROFILE_CRON_SCHEDULE`) and manually triggerable.
3. **Execution**
   - Scheduler or API triggers:
     - `POST /cycles/trigger` – raw Phase-1 cycle.
     - `POST /run-profiles/trigger` – all enabled run profiles.
   - Bridge passes profile/run/namespace context into Phase-1.
   - Value tags for the run profile are recorded in `ValueLedgerEntry`.

## Event and Ledger Flow

- **Execution events**
  - `execution_started` – when `runCycle` begins for a given context.
  - `delivery_confirmed` – when a dispatch job succeeds.
  - All events include `profileId`, `runId`, `namespace`, timestamp, and opaque metadata (`TelemetryEvent` table).
- **Advisory signals**
  - `correlationEngine` aggregates telemetry per profile and writes `AdvisorySignal` with:
    - `signal` (e.g., `elevated_performance`, `low_performance`, `stable`)
    - `confidence`
    - read-only `recommendation`.
- **Strategy suggestions**
  - `strategySuggestion` reads signals and creates `StrategyProposal` records with suggested changes.
  - Proposals remain `pending` until a human operator acts; no auto-apply path exists.
- **Ledgers**
  - `ExecutionRecord`: append-only operational log (cycle, initiation, transformation, normalization, dispatch, governance).
  - `ValueLedgerEntry`: immutable value tagging and metering for profiles and runs.
  - `AuditTrailEntry`: immutable governance/audit events.

## Safety & Governance

- **Global pause**
  - `ORBIT_GLOBAL_PAUSE=true` short-circuits `runCycle` before any work is done.
- **Namespaces & isolation**
  - `namespace` field on telemetry, governance, and audit ensures namespace separation.
  - `GovernanceSetting` includes a `halt` flag per namespace; no cross-namespace writes.
- **Emergency halt**
  - `POST /governance/namespaces/:namespace/halt` sets `halt` for the namespace and logs an `AuditTrailEntry`.
  - Run profiles in that namespace will no-op until un-halted.
- **Controlled autonomy (Phase-4)**
  - `ORBIT_PHASE4_ENABLED` and `ORBIT_PHASE4_ALLOW_MUTATION` must both be `true` before any Phase-4 mutation logic can run.
  - When either flag is `false`, Phase-4 functions log that they were skipped and return without side effects.

- **Crash-resilient checkpoints**
  - `CycleCheckpoint` table records append-only stages such as `cycle_started`, `tier1_complete`, `tier2_complete`, `tier3_complete`, `dispatch_complete`, and `cycle_finished`.
  - If the process is killed mid-cycle, the next invocation of `runCycle` for the namespace resumes from the last valid checkpoint instead of repeating earlier stages.

- **Dispatch dead-letter queue**
  - Dispatch jobs retry up to `ORBIT_MAX_DISPATCH_RETRIES` before being moved to `DeadLetterDispatch`.
  - Dead-letter entries are never auto-retried; operators can requeue manually by creating new `DispatchJob` rows.

- **Config guardrails**
  - `profiles.json` and `runProfiles.json` are validated against JSON Schemas at boot and on reload.
  - Config reload is blocked if any cycles are currently active, preventing half-applied configurations.

## REST API (Summary)

- `GET /health` – liveness check (process up).
- `GET /ready` – readiness check (DB reachable + config loaded).
- `GET /metrics` – basic cycle/dispatch counters and DLQ size.
- `POST /cycles/trigger` – trigger a Phase-1 cycle (returns `cycleRunId`).
- `GET /cycles/recent` – last 20 cycles.
- `GET /profiles` – current profile configs.
- `GET /run-profiles` – current run profile configs.
- `POST /run-profiles/trigger` – execute all enabled run profiles once.
- `POST /profiles/:profileId/signals` – compute advisory signals for a profile.
- `POST /profiles/:profileId/strategy-proposals` – generate strategy proposals for a profile.
- `POST /governance/namespaces/:namespace/halt` – emergency halt for a namespace.

## Configuration & Environment

Environment variables expected at runtime:

- `DATABASE_URL` – PostgreSQL connection string.
- `PORT` – HTTP port (default: `3000`).
- `ORBIT_GLOBAL_PAUSE` – `true`/`false`.
- `ORBIT_CRON_SCHEDULE` – cron expression for Phase-1 cycles (default: `0 0,12 * * *`).
- `ORBIT_RUN_PROFILE_CRON_SCHEDULE` – optional cron for run profile orchestration.
- `ORBIT_PHASE4_ENABLED` – `true`/`false`, Phase-4 hard flag (default: `false`).
- `ORBIT_PHASE4_ALLOW_MUTATION` – `true`/`false`, second safety gate for Phase-4 mutations (default: `false`).
- `ORBIT_DISPATCH_ENDPOINTS` – JSON array of endpoint configs, e.g.:
  - `[{"key":"default-endpoint","url":"https://example.com/webhook","method":"POST","token":"example-token"}]`
- `ORBIT_MAX_DISPATCH_RETRIES` – maximum number of attempts per dispatch job before it is moved to the dead-letter queue (default: `3`).
- `ORBIT_TELEMETRY_RETENTION_DAYS` – number of days to retain hot telemetry (default: `30`).
- `ORBIT_TELEMETRY_COLD_ARCHIVE_ENABLED` – `true`/`false`, whether to archive telemetry to `TelemetryArchive` before pruning.

You can use these to create a `.env` file alongside `package.json`. A typical development configuration is:

```text
DATABASE_URL=postgresql://user:password@localhost:5432/orbit
PORT=3000
ORBIT_GLOBAL_PAUSE=false
ORBIT_CRON_SCHEDULE=0 0,12 * * *
ORBIT_RUN_PROFILE_CRON_SCHEDULE=
ORBIT_PHASE4_ENABLED=false
ORBIT_PHASE4_ALLOW_MUTATION=false
ORBIT_DISPATCH_ENDPOINTS=[{"key":"default-endpoint","url":"https://example.com/webhook","method":"POST","token":"example-token"}]
ORBIT_MAX_DISPATCH_RETRIES=3
ORBIT_TELEMETRY_RETENTION_DAYS=30
ORBIT_TELEMETRY_COLD_ARCHIVE_ENABLED=false
```

## Production Safeguards & Patch Notes

- **Crash-resilient cycles**
  - Cycles write append-only checkpoints and can resume safely from the last completed stage without duplicating work or dispatches.
- **Execution idempotency**
  - `Initiation` rows are keyed by a deterministic `initiationHash` and `runProfileId` unique constraint to prevent duplicate executions for the same initiation context.
- **Dispatch DLQ**
  - Dispatch retries are capped and permanently failing jobs land in `DeadLetterDispatch` for manual inspection and requeue.
- **Config schema validation**
  - `profiles.json` and `runProfiles.json` are validated against JSON Schemas at boot and on reload; invalid configs prevent the process from starting.
- **Secret rotation safety**
  - Dispatch jobs snapshot endpoint URL, method, and token at enqueue time so mid-cycle config changes do not affect in-flight jobs.
- **Telemetry retention**
  - Telemetry is pruned according to `ORBIT_TELEMETRY_RETENTION_DAYS`, with optional cold archive to `TelemetryArchive` when enabled.
- **Phase-4 hard guards**
  - Phase-4 autonomy requires both `ORBIT_PHASE4_ENABLED` and `ORBIT_PHASE4_ALLOW_MUTATION` to be explicitly set; otherwise, Phase-4 logs and no-ops.

## Running Locally

1. Install dependencies:
   - `npm install`
2. Generate Prisma client:
   - `npx prisma generate`
3. Ensure PostgreSQL is running and `DATABASE_URL` is set.
4. Build and run:
   - `npm run build`
   - `npm start`
5. Or run in dev mode:
   - `npm run dev`

## Docker

Build and run the container:

```bash
docker build -t orbit-framework .
docker run -p 3000:3000 --env-file .env orbit-framework
```

Ensure the container can reach your PostgreSQL instance defined by `DATABASE_URL`.


