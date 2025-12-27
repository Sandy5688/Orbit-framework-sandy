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
  - `orchestrator`: single-cycle runner that creates a `CycleRun`, generates an initiation object, runs 3-tier transformations, normalizes payloads, enqueues dispatch jobs, and processes the dispatch queue.
  - `initiationSelector`: stateless initiation generator with hash-based deduplication.
  - `transformations`: Tier-1/2/3 opaque async transformations with retries and exponential backoff.
  - `normalizationEngine`: batch-based normalization via an external processor boundary (modeled as a no-op wrapper).
  - `dispatchQueue`: queue-based dispatch to configurable HTTP endpoints with delivery receipts.
  - `recorder`: append-only execution records.
- `src/phase2`: Configurable abstraction layer
  - `profileEngine`: loads `profiles.json` and `runProfiles.json` config.
  - `instructionSynthesis`: stateless instruction objects per run profile.
  - `runProfileOrchestration`: executes enabled run profiles (manual + cron).
  - `bridge`: sends structured run profile context into Phase-1.
  - `valueTagging`: append-only usage and value tagging ledger.
- `src/phase3`: Observability & advisory
  - `telemetryBus`: normalized, replayable telemetry events.
  - `correlationEngine`: simple performance correlation and advisory signals.
  - `strategySuggestion`: logged strategy proposals (never auto-applied).
  - `governance`: namespace-level halt and audit trail.
- `src/phase4`: Controlled autonomy (disabled)
  - `autonomy`: guarded stubs that never execute unless explicitly enabled.

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
  - `env.PHASE4_ENABLED` gate; all Phase-4 functions immediately return when disabled.
  - No mechanism is provided to enable Phase-4 without explicit configuration.

## REST API (Summary)

- `GET /health` – health check.
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
- `ORBIT_DISPATCH_ENDPOINTS` – JSON array of endpoint configs, e.g.:
  - `[{"key":"default-endpoint","url":"https://example.com/webhook","method":"POST","token":"example-token"}]`

You can use these to create a `.env` or `.env.example` file alongside `package.json`.

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


