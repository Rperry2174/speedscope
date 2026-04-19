# SpeedScope browser latency experiment report

## Scope

This report summarizes the browser-side latency experiment implemented in this branch. The primary metric is end-to-end time from file selection to first meaningful flamegraph render in the browser, using real fixtures and app-side instrumentation.

Primary commands:

- `npm run perf:bench`
- `npm run perf:parity`
- `npm run perf:run`
- `npm run perf:orchestrate`

Primary artifacts from the measured experiment run:

- `artifacts/perf/legacy/browser-benchmark.json`
- `artifacts/perf/optimized-for-each-call/browser-benchmark.json`
- `artifacts/perf/defer-demangle/browser-benchmark.json`
- `artifacts/perf/experiment-summary.json`

## What was actually slow

The instrumentation shows that parsing/import alone was not the dominant source of user-visible latency on the heaviest supported fixture.

Representative baseline observations from `artifacts/perf/legacy/browser-benchmark.json`:

- `chrome-cpuprofile-sucrase`
  - import/parse finished around `242 ms`
  - profile/state applied around `242 ms`
  - first meaningful paint around `982 ms`
  - build work recorded:
    - `build_chrono_flamechart`: about `45-71 ms`
    - `build_flamechart_renderer`: about `37-72 ms`
- `chrome-timeline-large`
  - import/parse finished around `69-96 ms`
  - first meaningful paint around `178-286 ms`
- `firefox-large`
  - import/parse finished around `45-50 ms`
  - first meaningful paint around `143-147 ms`

Takeaway: on representative supported fixtures, the common user-visible cost is the post-import path into flamechart construction and first render, with import still mattering but not fully explaining perceived latency.

## What changed

### Instrumentation and harness

- Added browser performance instrumentation for:
  - load start
  - bytes available
  - import/parse finished
  - profile/state applied
  - first meaningful paint
  - total wall-clock completion
- Added structured browser-readable perf state via:
  - `src/lib/perf.ts`
  - `src/lib/runtime-config.ts`
  - `window.__speedscopePerf`
  - `window.__speedscopeDebug`
- Added a Playwright-based benchmark harness and report generation under `scripts/perf/`.
- Added a parity harness using representative real fixtures.

### Optimization candidates tested

1. `optimizedForEachCall`
   - Replaced the legacy lowest-common-ancestor scan in `Profile.forEachCall()` with a prefix-based stack comparison when the experiment flag is enabled.
   - This reduces traversal overhead on sampled profiles without changing the profile model or importer output.

2. `deferDemangle`
   - Moved demangling out of the blocking pre-render path behind an experiment flag.
   - First meaningful paint is allowed to occur before symbol demangling completes.

### First concrete TypeScript -> Rust migrations

- Added a Rust/WASM implementation of `src/lib/fuzzy-find.ts` as the first actual migration that fit the repo's constraints well.
  - Rust crate:
    - `rust/fuzzy-find/`
  - Browser/runtime wrapper:
    - `src/lib/fuzzy-find-rust.ts`
  - Public API:
    - `src/lib/fuzzy-find.ts`
  - Gated behind:
    - `rustFuzzyFind=1`
    - `SPEEDSCOPE_RUSTFUZZYFIND=1`
  - Verified in:
    - `src/lib/fuzzy-find.test.ts`

- Added a second Rust/WASM migration for the exact substring search core in `src/lib/profile-search.ts`.
  - Rust crate:
    - `rust/profile-search/`
  - Browser/runtime wrapper:
    - `src/lib/profile-search-rust.ts`
  - Public API remains stable for callers:
    - `src/lib/profile-search.ts`
  - Gated behind:
    - `rustProfileSearch=1`
    - `SPEEDSCOPE_RUSTPROFILESEARCH=1`
  - Verified in:
    - `src/lib/profile-search.test.ts`

### Supporting fix

- Made the JFR importer lazy-loaded in `src/import/index.ts` so Node-based experiment scripts do not eagerly load `jfrview_bg.wasm` on non-JFR paths.

## What did not help or did not justify a bigger move

- A language rewrite was not justified by the evidence collected here.
- Rust/WASM was not needed to produce measurable end-to-end wins on the tested supported browser paths.
- The data does not support claiming parser-only or importer-only wins as the main story; the post-import render path remains a large contributor, especially on the Chrome CPU profile fixture.

## Measured results

From the final `artifacts/perf/experiment-summary.json`:

- `optimized-for-each-call`
  - final recommendation from current experiment script: `keep-experimental`
  - median total wall-clock change: about `5.8 ms` (`3.4%`)
- `defer-demangle`
  - final recommendation from current experiment script: `keep-experimental`
  - median total wall-clock change: about `16.7 ms` (`9.7%`)
  - but with a representative fixture regression:
    - `instruments-random-allocations`: about `+47.6 ms` (`+44.2%`)

Important per-fixture observations from the final rerun:

- `optimized-for-each-call` materially improved the heaviest Chrome CPU profile case:
  - legacy warm median total wall-clock: about `1013 ms`
  - optimized warm median total wall-clock: about `819 ms`
- `defer-demangle` also materially improved that same case:
  - legacy warm median total wall-clock: about `1013 ms`
  - deferred-demangle warm median total wall-clock: about `813 ms`
- `optimized-for-each-call` also improved several smaller supported fixtures in the final run, but not enough to justify a default flip on this sample.
- `defer-demangle` improved most measured fixtures, but the Instruments deep-copy case regressed enough that it should stay gated.

## Parity status

All measured experiment variants passed parity on the representative fixture set used by the harness:

- `chrome-timeline-large`
- `firefox-large`
- `instruments-random-allocations`
- `stackprof-ruby-large`
- `chrome-cpuprofile-sucrase`
- `chrome-trace-116`

Artifacts:

- `artifacts/perf/legacy/parity.json`
- `artifacts/perf/optimized-for-each-call/parity.json`
- `artifacts/perf/defer-demangle/parity.json`

## Was Rust/WASM worthwhile?

Not for the main measured browser bottleneck yet.

The current measured wins came from:

- reducing traversal overhead in JS
- reducing blocking work before first render
- tightening the experiment boundary and benchmark visibility
- migrating small, self-contained algorithmic modules (`fuzzy-find` and `profile-search` exact substring matching) where the boundary was low-risk and testable

That is enough to say the initial hypothesis of needing a broader rewrite is not yet supported by the browser-end-to-end data collected so far. The evidence supports selective Rust migration for isolated algorithmic modules, not a blanket rewrite.

## Recommendation

Recommendation: keep both `deferDemangle` and `optimizedForEachCall` experimental for now.

Reasoning:

- Both experiments improved the heavy Chrome CPU profile path, which is the strongest evidence gathered in this run.
- Neither experiment cleared the stricter default-ship bar across the representative fixture set in the final rerun.
- `optimizedForEachCall` is parity-safe and promising, but its overall median win is modest in the final run.
- `deferDemangle` delivered the best median improvement overall, but it also produced a clear regression on the representative Instruments deep-copy fixture.

In ship/experimental/stop terms:

- `deferDemangle`: keep experimental
- `optimizedForEachCall`: keep experimental
- targeted Rust migration of low-coupling algorithmic modules: continue
- broad Rust/WASM rewrite of the app: stop for now; hypothesis not yet supported

## Next best steps

1. Add an experiment that combines `deferDemangle` and `optimizedForEachCall` and rerun the same harness.
2. Investigate why `deferDemangle` regresses the Instruments deep-copy fixture before making it default.
3. Use the new shard map in `docs/perf/rust-migration-strategy.md` and `scripts/perf/migration-plan.ts` to delegate Rust migration across many cloud agents rather than attempting a monolithic rewrite.
4. Prioritize the next Rust candidates by low coupling and high algorithmic density:
   - import/parser stages
   - flamechart construction helpers
   - profile core traversal
5. Add one more render-focused candidate for the heaviest CPU profile path:
   - lazy flamechart construction
   - incremental renderer setup
   - or delayed non-essential overlay work
6. If render setup still dominates after those steps, then reconsider a coarser-grained rewrite boundary based on measured browser wins, not on parser-only assumptions.
