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

Environment variables expected at runtime. See `.env.example` for a complete template with descriptions.

**Required:**
- `DATABASE_URL` – PostgreSQL connection string; must be set and reachable.

**Optional (with sensible defaults):**
- `PORT` – HTTP port (default: `3000`).
- `NODE_ENV` – deployment environment (default: `development`).
- `ORBIT_GLOBAL_PAUSE` – `true`/`false` to pause all cycles (default: `false`).
- `ORBIT_CRON_SCHEDULE` – cron expression for Phase-1 cycles (default: `0 0,12 * * *` = twice daily).
- `ORBIT_RUN_PROFILE_CRON_SCHEDULE` – optional cron for run profile orchestration (default: empty/disabled).
- `ORBIT_PHASE4_ENABLED` – `true`/`false`, Phase-4 feature flag (default: `false`).
- `ORBIT_PHASE4_ALLOW_MUTATION` – `true`/`false`, second safety gate for Phase-4 mutations (default: `false`).
- `ORBIT_DISPATCH_ENDPOINTS` – JSON array of endpoint configurations (see Aurora Integration below).
- `ORBIT_MAX_DISPATCH_RETRIES` – max retry attempts before DLQ (default: `3`).
- `ORBIT_TELEMETRY_RETENTION_DAYS` – hot telemetry retention in days (default: `30`).
- `ORBIT_TELEMETRY_COLD_ARCHIVE_ENABLED` – archive to `TelemetryArchive` before pruning (default: `false`).

### Setup

1. **Copy `.env.example` to `.env`:**
   ```bash
   cp .env.example .env
   ```

2. **Update `.env` with your environment details:**
   ```text
   DATABASE_URL=postgresql://user:password@localhost:5432/orbit
   PORT=3000
   ORBIT_DISPATCH_ENDPOINTS=[{"key":"default-endpoint","url":"https://aurora.example.com/webhook","method":"POST","token":"your-secret-token"}]
   ```

## Aurora Integration

**Orbit is a Phase-2 control plane that triggers Aurora and handles orchestration.**

### How It Works

1. **Trigger Point:** Orbit scheduler or API endpoint (`/cycles/trigger`, `/run-profiles/trigger`) initiates a cycle.
2. **Execution:** Orbit runs Phase-1 orchestration (initiation → transformations → normalization → dispatch).
3. **Dispatch to Aurora:** Opaque payloads are dispatched via HTTP POST to the Aurora webhook URL.
4. **Aurora Processing:** Aurora receives the payload, generates content (via LLM, voice, video), and publishes to distribution targets (Metricool, Buffer, etc.).

### Configuration

Set `ORBIT_DISPATCH_ENDPOINTS` to point to your Aurora webhook:

```json
[
  {
    "key": "default-endpoint",
    "url": "https://aurora.example.com/dispatch",
    "method": "POST",
    "token": "secret-aurora-webhook-token"
  }
]
```

**Key Points:**
- **Opaque Payloads:** Orbit does NOT read or interpret job logic; payloads are opaque.
- **No Payload Modification:** Orbit passes payloads through unchanged to Aurora.
- **No Scheduler Control:** Orbit does not modify Aurora's internal scheduling or job logic.
- **Webhook Delivery:** Orbit sends HTTP POST with `Authorization: Bearer {token}` header.
- **Retry Handling:** Failed dispatch jobs are retried up to `ORBIT_MAX_DISPATCH_RETRIES` before being moved to the dead-letter queue.
- **Context Passed:** Profile ID, run profile ID, and namespace flow as metadata (opaque to Aurora).

### Example Workflow

```
1. Orbit scheduler fires (e.g., "0 0,12 * * *" = 12:00 UTC daily)
   ↓
2. Orbit runs Phase-1 cycle for each enabled run profile
   ↓
3. Cycle generates initiation → transforms payload → normalizes → enqueues dispatch job
   ↓
4. Dispatch job POSTs to Aurora webhook URL with bearer token
   ↓
5. Aurora receives opaque payload, generates content, publishes
   ↓
6. Aurora may respond with 200 OK (dispatch marked "delivered") or error (retried)
   ↓
7. After max retries, failed jobs move to dead-letter queue (DeadLetterDispatch table)
```

### Monitoring Aurora Integration

- **Cycle Status:** `GET /cycles/recent` → view recent cycle runs and their status.
- **Dispatch Status:** `GET /metrics` → check dispatch job counts and dead-letter queue size.
- **Telemetry:** Orbit emits `delivery_confirmed` events when Aurora webhook succeeds.
- **Audit Trail:** All dispatch failures and governance actions logged to `AuditTrailEntry`.

---

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

## Production Deployment

### Prerequisites

- Node.js 20+
- PostgreSQL 12+ (shared with Aurora, if applicable)
- Network access to Aurora webhook URL
- PM2 installed globally: `npm install -g pm2`

### Graceful Shutdown

Orbit Framework handles graceful shutdown on `SIGTERM` and `SIGINT` signals:

1. **HTTP server stops accepting new requests** immediately upon signal.
2. **Active cycles are drained** — the process waits up to 30 seconds for in-flight cycles to complete.
3. **Process exits cleanly** — no data loss or incomplete cycles.

This allows orchestrators (systemd, Kubernetes, Docker, PM2) to safely restart or upgrade Orbit without interrupting active work.

### PM2 Setup (Recommended for VPS/Linux)

1. **Start with PM2:**
   ```bash
   pm2 start ecosystem.config.js
   ```

2. **Save PM2 configuration:**
   ```bash
   pm2 save
   ```

3. **Set up auto-start on system reboot:**
   ```bash
   pm2 startup
   ```

4. **Verify the service is running:**
   ```bash
   pm2 status
   pm2 logs orbit-framework --follow
   ```

5. **Monitor and manage:**
   ```bash
   pm2 monit              # Real-time monitoring
   pm2 restart orbit-framework  # Restart the service
   pm2 stop orbit-framework     # Stop the service
   ```

**PM2 Configuration** (`ecosystem.config.js`):
- **Instances:** 1 (single fork mode to maintain state)
- **Auto-restart:** Enabled with exponential backoff
- **Graceful shutdown:** 5-second timeout for `SIGTERM` before `SIGKILL`
- **Logging:** Structured JSON logs to `logs/orbit-out.log` and `logs/orbit-error.log`

### Docker Deployment

Build and run the container:

```bash
docker build -t orbit-framework .
docker run -p 3000:3000 \
  --env-file .env \
  --restart unless-stopped \
  orbit-framework
```

**Key Flags:**
- `--restart unless-stopped` — auto-restart on crash, but respects manual stops
- `--env-file .env` — load environment from `.env` file
- `-p 3000:3000` — map HTTP port

Ensure the container can reach your PostgreSQL instance defined by `DATABASE_URL`.

### Systemd Service (Alternative to PM2)

Create `/etc/systemd/system/orbit-framework.service`:

```ini
[Unit]
Description=Orbit Framework (Aurora Phase-2 Control Plane)
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=orbit
WorkingDirectory=/opt/orbit-framework
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=orbit-framework
EnvironmentFile=/opt/orbit-framework/.env

[Install]
WantedBy=multi-user.target
```

Enable and start:
```bash
systemctl daemon-reload
systemctl enable orbit-framework
systemctl start orbit-framework
systemctl status orbit-framework
```

View logs:
```bash
journalctl -u orbit-framework -f
```

---

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
- **Graceful shutdown**
  - `SIGTERM`/`SIGINT` handlers drain active cycles before terminating; integrates seamlessly with PM2, systemd, and container orchestrators.

## Docker

Build and run the container:

```bash
docker build -t orbit-framework .
docker run -p 3000:3000 --env-file .env orbit-framework
```

Ensure the container can reach your PostgreSQL instance defined by `DATABASE_URL`.


