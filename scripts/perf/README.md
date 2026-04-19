# SpeedScope performance experiment harness

This directory contains the reproducible benchmark, parity, and orchestration
scripts used to evaluate end-to-end browser file-open latency in SpeedScope.

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
    for the same experiment loop.

## Runtime flags

The browser app reads the following query parameters and environment variables:

- `perf=1` or `SPEEDSCOPE_PERF=1`
  - Enables instrumentation and exposes `window.__speedscopePerf`
- `experiments=deferDemangle,optimizedForEachCall`
  - Enables one or more experiment flags
- `deferDemangle=1`
  - Defers demangling until after first meaningful paint
- `optimizedForEachCall=1`
  - Uses the optimized `Profile.forEachCall()` implementation

## Artifacts

Generated outputs are written under `artifacts/perf/`. The scripts create the
directory automatically.
