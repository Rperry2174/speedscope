# SpeedScope TypeScript to Rust migration strategy

## Goal

Use measured boundaries and many cloud agents to migrate the parts of the
SpeedScope codebase that make sense to move from TypeScript to Rust/WASM,
while leaving browser/UI glue in TypeScript.

This is not a blanket transliteration plan. The migration should prioritize:

- pure algorithmic modules
- parser and traversal stages
- performance-sensitive compute paths
- stable, testable contracts between TS and Rust

## What should stay in TypeScript

These areas are still the wrong layer for Rust-first migration:

- `src/views/**`
  - Preact components, DOM event handling, interaction UX
- `src/gl/**`
  - WebGL and canvas integration
- `src/app-state/**`
  - browser/runtime state wiring
- theming and media-query integration
- benchmark/report/orchestration scripts that are primarily Node/browser glue

Reason:

- these modules are tightly coupled to browser APIs, DOM lifecycle, WebGL, or
  Preact hooks
- crossing the JS/WASM boundary here would add complexity without a clear
  compute-heavy win

## Strong Rust migration candidates

### Already migrated on this branch

- `src/lib/fuzzy-find.ts`
  - a Rust/WASM implementation now exists in `rust/fuzzy-find`
  - the TS path remains as the safe fallback
  - parity is covered in `src/lib/fuzzy-find.test.ts`

### Best next candidates

1. `src/import/**`
   - per-format parsing and normalization stages
   - especially `trace-event`, `chrome`, `pprof`

2. `src/lib/profile.ts`
   - traversal and profile construction logic
   - best treated as a stage-level boundary rather than class-by-class

3. `src/lib/flamechart.ts`
   - flamechart layer construction and frame packing

4. `src/lib/profile-search.ts`
   - search/index traversal over flamechart/profile data

5. selected pure math/helper modules
   - only when bundled into a larger Rust boundary

## Cloud-agent delegation strategy

The migration should be sharded across many cloud agents rather than handled as
one rewrite. The checked-in orchestrator now uses these shard labels:

- `import-core`
- `profile-core`
- `flamechart-core`
- `search-and-ranking`
- `browser-boundary`
- `tooling-and-tests`
- `migrated-proof-points`

### Recommended model split

- Composer 2
  - conductor
  - integrates shard results
  - makes keep/stop decisions

- GPT 5.4
  - benchmark analyst
  - compares before/after artifacts
  - checks whether each shard actually improves end-to-end behavior

- Opus 4.6
  - architecture reviewer
  - rejects bad WASM boundaries
  - decides what should remain in TS

## Migration rules

Each shard should:

1. define a narrow TS ↔ Rust contract
2. keep a TS fallback path
3. add or update parity coverage
4. rerun the browser benchmark harness if the shard affects the critical path
5. stop if the Rust version does not improve the end-to-end metric

## Current branch recommendation

- keep the repo mostly TypeScript for UI, browser integration, and rendering glue
- continue Rust migration only for narrow, compute-heavy modules
- do not attempt a full repo rewrite all at once
- use many cloud agents to work shard-by-shard with measurable checkpoints

