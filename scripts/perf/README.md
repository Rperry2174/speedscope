# SpeedScope performance experiment harness

This directory contains the reproducible benchmark, parity, orchestration, and
migration-planning scripts used to evaluate end-to-end browser file-open
latency in SpeedScope and organize TypeScript -> Rust migration work.

## Commands

- `npm run perf:bench`
  - Starts the app, opens representative fixtures in Chromium, and writes timestamped
    benchmark artifacts under `artifacts/benchmarks/`
- `npm run perf:parity`
  - Compares legacy and experimental import/profile behavior on representative
    fixtures and writes:
    - `artifacts/perf/latest/parity.json`
- `npm run perf:run`
  - Runs parity + baseline benchmark + selected experiments and writes:
    - `artifacts/perf/experiment-summary.json`
    - per-experiment `browser-benchmark.json`, `parity.json`, and `report.md`
- `npm run perf:orchestrate`
  - Uses the Cursor TypeScript SDK to create a multi-agent cloud execution plan
    for the same experiment loop and emits a shard-oriented migration summary.
- `npm run perf:migration-status`
  - Reports remaining tracked TypeScript/TSX files, current Rust proof points, and
    the explicit migration task shards under `artifacts/perf/migration-status.json`
- `npm run perf:delegate-migration`
  - Launches one cloud agent per migration task shard and records agent/run URLs and
    statuses under `artifacts/perf/migration-delegation.json`
- `npm run perf:recursive-rust-migrate`
  - Recursively walks the repo, classifies files into Rust candidates vs keep-in-TS
    review tasks, batches them, launches cloud agents in parallel, and writes:
    - `artifacts/perf/recursive-migration-plan.json`
    - `artifacts/perf/recursive-migration-dispatch.json`
- `npm run build:rust:fuzzy-find`
  - Builds the first concrete Rust/WASM migration in this branch:
    `src/lib/fuzzy-find.ts` -> `rust/fuzzy-find/`

## Runtime flags

The browser app reads the following query parameters and environment variables:

- `perf=1` or `SPEEDSCOPE_PERF=1`
  - Enables instrumentation and exposes `window.__speedscopePerf`
- `experiments=deferDemangle,optimizedForEachCall`
  - Existing perf experiments
- `rustFuzzyFind=1`
  - Enables the Rust/WASM fuzzy matcher when it has been built
  - Enables one or more experiment flags
- `deferDemangle=1`
  - Defers demangling until after first meaningful paint
- `optimizedForEachCall=1`
  - Uses the optimized `Profile.forEachCall()` implementation

## Artifacts

Generated outputs are written under `artifacts/perf/`. The scripts create the
directory automatically.

## Migration planning

The shard plan for broader migration delegation lives in:

- `scripts/perf/migration-plan.ts`

It divides the codebase into:

- core algorithm and parser candidates that make sense to migrate to Rust/WASM
- UI/browser integration areas that should remain in TypeScript/TSX
- cloud-agent delegation shards for parallel planning or execution
