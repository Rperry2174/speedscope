# Recursive Rust migration delegation

Generated tasks: 42
Completed records: 42

## Tasks

### proof-point-fuzzy-find
- title: Validate Rust fuzzy-find proof point
- mode: proof-point
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-054b26f9-c43a-463b-b270-006e63418523
- agentUrl: https://cursor.com/agents/bc-054b26f9-c43a-463b-b270-006e63418523
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/fuzzy-find.ts
  - src/lib/fuzzy-find-rust.ts
  - rust/fuzzy-find/**

### scripts-keep-ts-review-1
- title: Review keep-in-TS: scripts
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-55008333-01d3-40dd-907d-409b69c11e6c
- agentUrl: https://cursor.com/agents/bc-55008333-01d3-40dd-907d-409b69c11e6c
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - scripts/build-release.ts
  - scripts/dev-server.ts
  - scripts/esbuild-shared.ts

### scripts-perf-keep-ts-review-1
- title: Review keep-in-TS: scripts/perf
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-62f9e5f9-7748-4bd0-aaa3-852ac71859b3
- agentUrl: https://cursor.com/agents/bc-62f9e5f9-7748-4bd0-aaa3-852ac71859b3
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - scripts/perf/benchmark.ts
  - scripts/perf/cursor-api.ts
  - scripts/perf/cursor-orchestrator.ts
  - scripts/perf/delegate-migration.ts
  - scripts/perf/fixtures.ts
  - scripts/perf/migration-plan.ts

### scripts-perf-keep-ts-review-2
- title: Review keep-in-TS: scripts/perf
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-88b881a2-ba7f-4f3b-8744-fb6a6a9dd9b3
- agentUrl: https://cursor.com/agents/bc-88b881a2-ba7f-4f3b-8744-fb6a6a9dd9b3
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - scripts/perf/migration-status.ts
  - scripts/perf/parity.ts
  - scripts/perf/recursive-rust-migrate.ts
  - scripts/perf/report.ts
  - scripts/perf/run-experiment.ts
  - scripts/perf/types.ts

### src-keep-ts-review-1
- title: Review keep-in-TS: src
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-001b7fd3-5200-4a16-927e-b6fb6a1cf72c
- agentUrl: https://cursor.com/agents/bc-001b7fd3-5200-4a16-927e-b6fb6a1cf72c
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/speedscope.tsx

### src-app-state-keep-ts-review-1
- title: Review keep-in-TS: src/app-state
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-f1df3975-8707-4102-a292-29c55c26b130
- agentUrl: https://cursor.com/agents/bc-f1df3975-8707-4102-a292-29c55c26b130
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/app-state/active-profile-state.ts
  - src/app-state/color-scheme.ts
  - src/app-state/getters.ts
  - src/app-state/index.ts
  - src/app-state/profile-group.ts

### src-gl-keep-ts-review-1
- title: Review keep-in-TS: src/gl
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-184b67aa-f279-4103-9d45-81a8296be8bd
- agentUrl: https://cursor.com/agents/bc-184b67aa-f279-4103-9d45-81a8296be8bd
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/gl/canvas-context.ts
  - src/gl/flamechart-color-pass-renderer.ts
  - src/gl/flamechart-renderer.ts
  - src/gl/graphics.ts
  - src/gl/overlay-rectangle-renderer.ts
  - src/gl/rectangle-batch-renderer.ts

### src-gl-keep-ts-review-2
- title: Review keep-in-TS: src/gl
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-c4d446b1-d8c0-4bab-bc6b-a1eb1139fe6d
- agentUrl: https://cursor.com/agents/bc-c4d446b1-d8c0-4bab-bc6b-a1eb1139fe6d
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/gl/row-atlas.ts
  - src/gl/texture-renderer.ts
  - src/gl/utils.ts

### src-import-migrate-rust-1
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-b70e0d4d-8e9e-4572-ad91-c9168835b135
- agentUrl: https://cursor.com/agents/bc-b70e0d4d-8e9e-4572-ad91-c9168835b135
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/bg-flamegraph.test.ts
  - src/import/bg-flamegraph.ts
  - src/import/callgrind.test.ts

### src-import-migrate-rust-2
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-6eab609e-3491-4a22-9f1b-efefd80e552b
- agentUrl: https://cursor.com/agents/bc-6eab609e-3491-4a22-9f1b-efefd80e552b
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/callgrind.ts
  - src/import/chrome.test.ts
  - src/import/chrome.ts

### src-import-migrate-rust-3
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-36ad628d-566b-4576-89ee-759a00c7814a
- agentUrl: https://cursor.com/agents/bc-36ad628d-566b-4576-89ee-759a00c7814a
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/firefox.test.ts
  - src/import/firefox.ts
  - src/import/haskell.test.ts

### src-import-migrate-rust-4
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-7f279795-2efd-49bd-9517-8ba76f60b53c
- agentUrl: https://cursor.com/agents/bc-7f279795-2efd-49bd-9517-8ba76f60b53c
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/haskell.ts
  - src/import/index.test.ts
  - src/import/index.ts

### src-import-migrate-rust-5
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-314e39b5-7b62-45ee-9617-02a8f6a682c6
- agentUrl: https://cursor.com/agents/bc-314e39b5-7b62-45ee-9617-02a8f6a682c6
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/instruments.test.ts
  - src/import/instruments.ts
  - src/import/java-flight-record.mock.ts

### src-import-migrate-rust-6
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-69308715-5d7b-429f-aaaa-21cc4d45c30c
- agentUrl: https://cursor.com/agents/bc-69308715-5d7b-429f-aaaa-21cc4d45c30c
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/java-flight-recorder.test.ts
  - src/import/linux-tools-perf.test.ts
  - src/import/linux-tools-perf.ts

### src-import-migrate-rust-7
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-7266d376-338b-4bb3-abd7-13326d2c14d5
- agentUrl: https://cursor.com/agents/bc-7266d376-338b-4bb3-abd7-13326d2c14d5
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/papyrus.test.ts
  - src/import/papyrus.ts
  - src/import/pmcstat-callgraph.test.ts

### src-import-migrate-rust-8
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-b8d27b4e-6b76-4e16-9d1b-d7c9da848193
- agentUrl: https://cursor.com/agents/bc-b8d27b4e-6b76-4e16-9d1b-d7c9da848193
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/pmcstat-callgraph.ts
  - src/import/pprof.test.ts
  - src/import/profile.proto.d.ts

### src-import-migrate-rust-9
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-ee5e2c1d-41c4-4da4-b15f-cea60d58b166
- agentUrl: https://cursor.com/agents/bc-ee5e2c1d-41c4-4da4-b15f-cea60d58b166
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/safari.test.ts
  - src/import/safari.ts
  - src/import/stackprof.test.ts

### src-import-migrate-rust-10
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-0ef48549-5788-46a6-a30a-624502108cc7
- agentUrl: https://cursor.com/agents/bc-0ef48549-5788-46a6-a30a-624502108cc7
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/stackprof.ts
  - src/import/trace-event.test.ts
  - src/import/trace-event.ts

### src-import-migrate-rust-11
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-33a899a7-b846-4b77-894d-cf2499af6f96
- agentUrl: https://cursor.com/agents/bc-33a899a7-b846-4b77-894d-cf2499af6f96
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/utils.ts
  - src/import/v8cpuFormatter.ts
  - src/import/v8heapalloc.test.ts

### src-import-migrate-rust-12
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-37dd4512-d876-41a2-8e43-269c7c36a7e0
- agentUrl: https://cursor.com/agents/bc-37dd4512-d876-41a2-8e43-269c7c36a7e0
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/v8heapalloc.ts
  - src/import/v8proflog.test.ts
  - src/import/v8proflog.ts

### src-import-migrate-rust-1
- title: Migrate to Rust: src/import
- mode: migrate-rust
- model: claude-4.6-opus-high-thinking-fast
- status: CREATING
- agentId: bc-221c4225-bea9-43cd-865c-b07f71815585
- agentUrl: https://cursor.com/agents/bc-221c4225-bea9-43cd-865c-b07f71815585
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/import/java-flight-recorder.ts
  - src/import/pprof.ts

### src-lib-migrate-rust-1
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-8468ebd2-b7dc-4d7c-b08a-69f54ddca432
- agentUrl: https://cursor.com/agents/bc-8468ebd2-b7dc-4d7c-b08a-69f54ddca432
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/atom.test.ts
  - src/lib/atom.ts
  - src/lib/canvas-2d-batch-renderers.ts

### src-lib-migrate-rust-2
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-a7ae2c91-eb0d-44a8-949d-29663419f8a7
- agentUrl: https://cursor.com/agents/bc-a7ae2c91-eb0d-44a8-949d-29663419f8a7
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/color.test.ts
  - src/lib/color.ts
  - src/lib/emscripten.test.ts

### src-lib-migrate-rust-3
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-457eee51-4b4b-48e6-9f2b-2f5017743b5d
- agentUrl: https://cursor.com/agents/bc-457eee51-4b4b-48e6-9f2b-2f5017743b5d
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/emscripten.ts
  - src/lib/file-format-spec.ts
  - src/lib/file-format.test.ts

### src-lib-migrate-rust-4
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-9967e8c6-aa84-4e24-b88d-a191142dca27
- agentUrl: https://cursor.com/agents/bc-9967e8c6-aa84-4e24-b88d-a191142dca27
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/file-format.ts
  - src/lib/fuzzy-find-rust.ts
  - src/lib/fuzzy-find-rust.wasm.mock.ts

### src-lib-migrate-rust-5
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-8cb471f6-b7d6-4c7d-8e14-89ac4e01f083
- agentUrl: https://cursor.com/agents/bc-8cb471f6-b7d6-4c7d-8e14-89ac4e01f083
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/fuzzy-find-types.ts
  - src/lib/fuzzy-find.test.ts
  - src/lib/hash-params.test.ts

### src-lib-migrate-rust-6
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-93270531-7757-41a8-a0df-699d3d8ef07c
- agentUrl: https://cursor.com/agents/bc-93270531-7757-41a8-a0df-699d3d8ef07c
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/hash-params.ts
  - src/lib/js-source-map.test.ts
  - src/lib/js-source-map.ts

### src-lib-migrate-rust-7
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-3c46e525-e30a-40a6-b072-879647591fbd
- agentUrl: https://cursor.com/agents/bc-3c46e525-e30a-40a6-b072-879647591fbd
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/lru-cache.test.ts
  - src/lib/lru-cache.ts
  - src/lib/math.test.ts

### src-lib-migrate-rust-8
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-2d79f2ea-33e3-4451-8bf1-46d3a1daf124
- agentUrl: https://cursor.com/agents/bc-2d79f2ea-33e3-4451-8bf1-46d3a1daf124
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/math.ts
  - src/lib/perf.ts
  - src/lib/profile-parity.test.ts

### src-lib-migrate-rust-9
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-aac7de8e-e416-4bdf-ae86-0bfb16303d73
- agentUrl: https://cursor.com/agents/bc-aac7de8e-e416-4bdf-ae86-0bfb16303d73
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/profile-parity.ts
  - src/lib/profile-search.test.ts
  - src/lib/profile-search.ts

### src-lib-migrate-rust-10
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-5e66d9af-7c48-4391-84ce-cfb886f5d67b
- agentUrl: https://cursor.com/agents/bc-5e66d9af-7c48-4391-84ce-cfb886f5d67b
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/profile.test.ts
  - src/lib/runtime-config.ts
  - src/lib/stats.ts

### src-lib-migrate-rust-11
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-d0b1ab98-7e85-4233-94d8-e3b4d86cfe6f
- agentUrl: https://cursor.com/agents/bc-d0b1ab98-7e85-4233-94d8-e3b4d86cfe6f
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/test-utils.ts
  - src/lib/text-utils.test.ts
  - src/lib/text-utils.ts

### src-lib-migrate-rust-12
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-68c9d383-d248-4225-b460-3a527ef63793
- agentUrl: https://cursor.com/agents/bc-68c9d383-d248-4225-b460-3a527ef63793
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/utils.test.ts
  - src/lib/utils.ts
  - src/lib/value-formatters.test.ts

### src-lib-migrate-rust-13
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: gpt-5.4-high
- status: CREATING
- agentId: bc-0d9ac9e5-cd69-4593-a5b8-afc229d6254a
- agentUrl: https://cursor.com/agents/bc-0d9ac9e5-cd69-4593-a5b8-afc229d6254a
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/value-formatters.ts
  - src/lib/view-mode.ts

### src-lib-migrate-rust-1
- title: Migrate to Rust: src/lib
- mode: migrate-rust
- model: claude-4.6-opus-high-thinking-fast
- status: CREATING
- agentId: bc-ea0ca89d-3891-4b8c-84ef-d2aa259668a5
- agentUrl: https://cursor.com/agents/bc-ea0ca89d-3891-4b8c-84ef-d2aa259668a5
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/flamechart.ts
  - src/lib/profile.ts

### src-lib-keep-ts-review-1
- title: Review keep-in-TS: src/lib
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-913328c7-1cf6-4b4a-b04a-e5c91807a63f
- agentUrl: https://cursor.com/agents/bc-913328c7-1cf6-4b4a-b04a-e5c91807a63f
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/preact-helpers.tsx

### src-lib-demangle-keep-ts-review-1
- title: Review keep-in-TS: src/lib/demangle
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-c70d568e-f478-4f31-ae68-3e84edbee4e1
- agentUrl: https://cursor.com/agents/bc-c70d568e-f478-4f31-ae68-3e84edbee4e1
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/lib/demangle/demangle.test.ts
  - src/lib/demangle/demangle.ts
  - src/lib/demangle/demangle.wasm.d.ts
  - src/lib/demangle/index.ts

### src-views-keep-ts-review-1
- title: Review keep-in-TS: src/views
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-454e3665-6658-4648-950b-afc41c32f06f
- agentUrl: https://cursor.com/agents/bc-454e3665-6658-4648-950b-afc41c32f06f
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/views/application-container.tsx
  - src/views/application.tsx
  - src/views/callee-flamegraph-view.tsx
  - src/views/color-chit.tsx
  - src/views/flamechart-detail-view.tsx
  - src/views/flamechart-minimap-view.tsx

### src-views-keep-ts-review-2
- title: Review keep-in-TS: src/views
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-56cb72d0-41e8-4b4c-ac85-d575cc035170
- agentUrl: https://cursor.com/agents/bc-56cb72d0-41e8-4b4c-ac85-d575cc035170
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/views/flamechart-pan-zoom-view.tsx
  - src/views/flamechart-search-view.tsx
  - src/views/flamechart-style.ts
  - src/views/flamechart-view-container.tsx
  - src/views/flamechart-view.tsx
  - src/views/flamechart-wrapper.tsx

### src-views-keep-ts-review-3
- title: Review keep-in-TS: src/views
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-79bc927f-3421-48ae-bf96-3ca17244cf9c
- agentUrl: https://cursor.com/agents/bc-79bc927f-3421-48ae-bf96-3ca17244cf9c
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/views/hovertip.tsx
  - src/views/inverted-caller-flamegraph-view.tsx
  - src/views/profile-select.tsx
  - src/views/profile-table-view.tsx
  - src/views/sandwich-search-view.tsx
  - src/views/sandwich-view.tsx

### src-views-keep-ts-review-4
- title: Review keep-in-TS: src/views
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-d505551d-8260-4723-8096-6633676e260c
- agentUrl: https://cursor.com/agents/bc-d505551d-8260-4723-8096-6633676e260c
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/views/scrollable-list-view.tsx
  - src/views/search-view.tsx
  - src/views/style.ts
  - src/views/toolbar.tsx

### src-views-themes-keep-ts-review-1
- title: Review keep-in-TS: src/views/themes
- mode: keep-ts-review
- model: composer-2
- status: CREATING
- agentId: bc-14a05749-766c-4283-ae34-05ac4b9167cb
- agentUrl: https://cursor.com/agents/bc-14a05749-766c-4283-ae34-05ac4b9167cb
- branch: cursor/speedscope-perf-orchestration-bc66
- files:
  - src/views/themes/dark-theme.ts
  - src/views/themes/light-theme.ts
  - src/views/themes/theme.tsx
