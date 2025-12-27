### Phase 1 Patch Summary – Orbit Framework

This document summarizes the Phase‑1 changes implemented to address the agreed patch list. Phases 2–4 are unchanged.

---

### 1. Initiation Deduplication

- **What was wrong**  
  - The deduplication hash for initiations was effectively unique per run (timestamp-based), so the system could not recognize repeated executions of the same logical context.

- **What we implemented**  
  - The initiation dedupe hash is now derived **only from stable execution inputs**: `profileId`, `runProfileId`, `instructionId`, and `namespace` stored in the cycle’s context.  
  - For any new cycle, the system:
    - Computes a stable hash from these four fields.  
    - **Reuses an existing Initiation** if a matching hash already exists (no duplicate row).  
    - Otherwise creates a new Initiation tagged with that hash and logs the creation.

- **Outcome / guarantees**  
  - Re-running a cycle with the **same execution context** yields the **same dedupe hash**.  
  - Duplicate initiations are **not re-created**; they are safely reused, and all reuse events are logged for audit.

---

### 2. Partial Success Cycles

- **What was wrong**  
  - A failure in any stage could cause the entire cycle to be marked as failed, even if earlier stages had succeeded and produced useful artifacts.

- **What we implemented**  
  - The orchestrator now treats each stage as an **independent unit**:
    - Initiation  
    - Transformations (Tier‑1/2/3)  
    - Normalization  
    - Dispatch  
  - Each stage:
    - Has its own `try/catch` block.  
    - Records start, completion, and errors in the execution log.  
  - The final `CycleRun.status` is computed from per‑stage outcomes:
    - `success` – all stages succeeded.  
    - `partial_success` – at least one stage succeeded, but not all.  
    - `failed` – no stage succeeded.

- **Outcome / guarantees**  
  - A **dispatch failure no longer invalidates the entire cycle**.  
  - All partial work (e.g., successful transformations or normalization) is **preserved and visible** in the database and execution logs.

---

### 3. Isolated Transformation Tiers

- **What was wrong**  
  - Transformations for Tiers 1, 2, and 3 were chained in a way that allowed one tier’s failure to abort the entire transformation sequence.

- **What we implemented**  
  - Each tier (1, 2, and 3) now runs as an **independent transformation**:
    - Each tier creates its own `Transformation` record.  
    - Each tier is retried with exponential backoff, then marked `success` or `failed`.  
  - Failures in one tier **do not prevent** the other tiers from running.  
  - The orchestrator receives a structured result set listing, for each tier:
    - Whether it succeeded,  
    - The associated `transformationId`, and  
    - The (opaque) payload where available.

- **Outcome / guarantees**  
  - A Tier‑3 failure does **not** invalidate Tier‑1 or Tier‑2.  
  - All tier results are **recorded independently** and can be inspected in both the primary tables and the execution log.

---

### 4. Normalization Provenance (Transformation IDs)

- **What was wrong**  
  - Normalized items did not explicitly link back to the transformation that produced them, which made full end‑to‑end traceability difficult.

- **What we implemented**  
  - Normalization now consumes a list of **(transformationId, payload)** pairs instead of raw payloads.  
  - For each successful transformation, the system:
    - Creates a `NormalizationItem` that **references the originating `transformationId`**.  
    - Logs the normalization with both the item id and transformation id.  
  - Failed transformations are **not passed** to normalization and therefore do not produce normalization items.

- **Outcome / guarantees**  
  - Every normalization item has a clear, direct link back to a specific transformation.  
  - End‑to‑end audit is now possible: **Cycle → Initiation → Transformation → Normalization → Dispatch**.

---

### 5. Cycle‑Scoped Dispatch Queue

- **What was wrong**  
  - The dispatch process previously looked at all globally pending jobs, which risked one cycle accidentally processing another cycle’s dispatch work.

- **What we implemented**  
  - Dispatch processing is now **explicitly scoped to the current cycle**:
    - First, it resolves the set of `NormalizationItem`s that belong to transformations from this cycle’s initiations.  
    - Then it only selects `DispatchJob`s whose `normalizationItemId` is in that set and whose status is `pending`.  
  - If no relevant normalization items exist for a cycle, it records a warning and safely exits without touching other jobs.

- **Outcome / guarantees**  
  - A cycle will **only dispatch jobs it created**.  
  - Concurrent cycles do **not** interfere with each other’s dispatch queues.

---

### 6. Scheduler Overlap Protection

- **What was wrong**  
  - Cron could attempt to start a new cycle while another cycle for the same namespace was still running.

- **What we implemented**  
  - Before starting a new cycle, the orchestrator now checks for an existing `CycleRun` with:
    - `status = "running"` and  
    - a matching `namespace` in the stored context.  
  - If such a cycle exists:
    - The new cycle is **skipped**.  
    - A warning is logged for observability, including the namespace and trigger type (cron/manual).

- **Outcome / guarantees**  
  - At most **one active cycle per namespace** can run at any given time.  
  - Overlapping cron executions for the same namespace are prevented without requiring schema changes.

---

### 7. Failure‑Safe Execution Records

- **What was wrong**  
  - Failure handling risked masking or conflating the semantics of what had already been attempted inside a cycle.

- **What we implemented**  
  - The system now **always records**:
    - Initiation attempts and reuse events.  
    - Every transformation attempt and outcome for each tier.  
    - Normalization batch and item creation, linked back to transformations.  
    - Dispatch job enqueueing, delivery attempts, and failures.  
  - The outer failure handler:
    - Updates the `CycleRun` status and finish time.  
    - Adds an error log entry.  
    - Does **not** delete or override prior records from earlier stages.

- **Outcome / guarantees**  
  - Post‑mortem inspection reveals a **complete execution history**, even when cycles fail.  
  - No schema changes were required; existing Prisma models and the TypeScript build remain valid (`npm run build` passes).

---

### Overall Effect

Together, these changes make Phase‑1:

- More **idempotent** and predictable under repeated or overlapping triggers.  
- More **fault‑tolerant**, with clear differentiation between full success, partial success, and failure.  
- More **auditable and traceable** end‑to‑end, without introducing any new business semantics or breaking existing schemas.


