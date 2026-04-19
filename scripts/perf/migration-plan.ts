export interface MigrationShard {
  id: string
  label: string
  keepInTypeScript: boolean
  rationale: string
  paths: string[]
  suggestedModelFamily: 'composer-2' | 'gpt-5.4' | 'opus-4.6'
}

export interface MigrationDelegationTask {
  id: string
  title: string
  mode: 'migrate-rust' | 'keep-ts-review' | 'proof-point'
  rationale: string
  paths: string[]
  suggestedModelFamily: 'composer-2' | 'gpt-5.4' | 'opus-4.6'
  verification: string[]
}

export const MIGRATION_SHARDS: MigrationShard[] = [
  {
    id: 'core-algorithms',
    label: 'Core algorithms and data structures',
    keepInTypeScript: false,
    rationale:
      'Pure algorithmic code and profile traversal logic are the strongest Rust candidates because they are CPU-heavy and minimally coupled to the browser.',
    suggestedModelFamily: 'opus-4.6',
    paths: ['src/lib/profile.ts', 'src/lib/flamechart.ts', 'src/lib/fuzzy-find.ts', 'src/lib/math.ts'],
  },
  {
    id: 'importers',
    label: 'Importer pipeline',
    keepInTypeScript: false,
    rationale:
      'Format parsing and normalization are natural Rust/WASM boundaries, with TS kept for File/ArrayBuffer I/O and browser integration.',
    suggestedModelFamily: 'gpt-5.4',
    paths: ['src/import/*.ts', 'src/import/utils.ts', 'src/lib/file-format.ts'],
  },
  {
    id: 'search-and-indexing',
    label: 'Search and indexing',
    keepInTypeScript: false,
    rationale:
      'Search, fuzzy match, and derived indexing are self-contained and easy to shard across agents for Rust experiments.',
    suggestedModelFamily: 'gpt-5.4',
    paths: ['src/lib/profile-search.ts', 'src/lib/fuzzy-find.ts', 'src/views/profile-select.tsx'],
  },
  {
    id: 'render-prep',
    label: 'Render preparation and geometry',
    keepInTypeScript: false,
    rationale:
      'Data preparation for flamechart layers and culling may move to Rust, but TS should retain direct WebGL and canvas ownership.',
    suggestedModelFamily: 'opus-4.6',
    paths: ['src/lib/flamechart.ts', 'src/gl/flamechart-renderer.ts', 'src/app-state/getters.ts'],
  },
  {
    id: 'browser-ui',
    label: 'UI, DOM, and browser integration',
    keepInTypeScript: true,
    rationale:
      'Preact views, canvas refs, DOM events, theming, and browser APIs should remain in TS/TSX even in a Rust-heavy architecture.',
    suggestedModelFamily: 'composer-2',
    paths: ['src/views/**/*.tsx', 'src/views/**/*.ts', 'src/speedscope.tsx', 'src/app-state/**/*.ts'],
  },
  {
    id: 'webgl-and-canvas',
    label: 'WebGL and canvas bindings',
    keepInTypeScript: true,
    rationale:
      'The browser owns WebGL/canvas APIs; Rust can prepare data, but draw submission and browser object lifecycle should stay in TS.',
    suggestedModelFamily: 'composer-2',
    paths: ['src/gl/**/*.ts', 'src/lib/canvas-2d-batch-renderers.ts', 'src/lib/text-utils.ts'],
  },
  {
    id: 'tooling-and-orchestration',
    label: 'Tooling and orchestrator',
    keepInTypeScript: true,
    rationale:
      'The Cursor SDK and the current benchmark/orchestration stack already live naturally in TS/Node and are useful as the control plane for migration work.',
    suggestedModelFamily: 'composer-2',
    paths: ['scripts/perf/*.ts', 'scripts/*.ts', 'package.json'],
  },
]

export const MIGRATION_TASKS: MigrationDelegationTask[] = [
  {
    id: 'proof-point-fuzzy-find',
    title: 'Validate fuzzy-find Rust proof point',
    mode: 'proof-point',
    rationale:
      'This branch already migrated fuzzy-find to Rust/WASM. Keep it as the reference implementation for future TS -> Rust shard work.',
    suggestedModelFamily: 'gpt-5.4',
    paths: ['src/lib/fuzzy-find.ts', 'src/lib/fuzzy-find-rust.ts', 'rust/fuzzy-find/**'],
    verification: ['npm run build:rust:fuzzy-find', 'npm run jest -- src/lib/fuzzy-find.test.ts'],
  },
  {
    id: 'migrate-profile-core',
    title: 'Migrate profile core',
    mode: 'migrate-rust',
    rationale:
      'Profile traversal and builders are central compute-heavy logic and natural Rust candidates when kept behind a stable TS fallback boundary.',
    suggestedModelFamily: 'opus-4.6',
    paths: ['src/lib/profile.ts'],
    verification: ['npm run jest -- src/lib/profile-parity.test.ts', 'npm run perf:parity'],
  },
  {
    id: 'migrate-flamechart-core',
    title: 'Migrate flamechart core',
    mode: 'migrate-rust',
    rationale:
      'Flamechart layer construction is a hot post-import path and should be tested as a Rust/WASM boundary without moving DOM or WebGL glue.',
    suggestedModelFamily: 'opus-4.6',
    paths: ['src/lib/flamechart.ts'],
    verification: ['npm run typecheck', 'npm run perf:bench'],
  },
  {
    id: 'migrate-profile-search',
    title: 'Migrate profile search',
    mode: 'migrate-rust',
    rationale:
      'Profile search and indexing logic are self-contained and likely easier to move than the full flamechart builder.',
    suggestedModelFamily: 'gpt-5.4',
    paths: ['src/lib/profile-search.ts'],
    verification: ['npm run typecheck', 'npm run jest -- src/lib/text-utils.test.ts'],
  },
  {
    id: 'migrate-import-chrome-trace',
    title: 'Migrate Chrome and trace-event importers',
    mode: 'migrate-rust',
    rationale:
      'Chrome timeline and trace-event importers are large parser stages with measurable end-to-end impact and clear byte/parse/profile boundaries.',
    suggestedModelFamily: 'gpt-5.4',
    paths: ['src/import/chrome.ts', 'src/import/trace-event.ts', 'src/import/utils.ts'],
    verification: ['npm run jest -- src/import/chrome.test.ts', 'npm run perf:parity', 'npm run perf:bench'],
  },
  {
    id: 'migrate-import-firefox-safari',
    title: 'Migrate Firefox and Safari importers',
    mode: 'migrate-rust',
    rationale:
      'These JSON importers are easier parser-boundary candidates than the DOM/UI shell that consumes their output.',
    suggestedModelFamily: 'gpt-5.4',
    paths: ['src/import/firefox.ts', 'src/import/safari.ts'],
    verification: ['npm run jest -- src/import/firefox.test.ts src/import/safari.test.ts', 'npm run perf:parity'],
  },
  {
    id: 'migrate-import-pprof-jfr',
    title: 'Migrate pprof and JFR importers',
    mode: 'migrate-rust',
    rationale:
      'Binary-format importers are strong Rust candidates, but they have higher compatibility risk and should be isolated from the rest of the pipeline.',
    suggestedModelFamily: 'opus-4.6',
    paths: ['src/import/pprof.ts', 'src/import/java-flight-recorder.ts'],
    verification: ['npm run jest -- src/import/pprof.test.ts src/import/java-flight-recorder.test.ts'],
  },
  {
    id: 'migrate-import-stackprof-v8',
    title: 'Migrate stackprof and V8-family importers',
    mode: 'migrate-rust',
    rationale:
      'These importers are parser-heavy and relatively self-contained, which makes them good follow-on Rust/WASM candidates.',
    suggestedModelFamily: 'gpt-5.4',
    paths: [
      'src/import/stackprof.ts',
      'src/import/v8proflog.ts',
      'src/import/v8heapalloc.ts',
      'src/import/callgrind.ts',
    ],
    verification: ['npm run jest -- src/import/stackprof.test.ts src/import/v8proflog.test.ts src/import/v8heapalloc.test.ts src/import/callgrind.test.ts'],
  },
  {
    id: 'migrate-import-text-family',
    title: 'Migrate text-based importer family',
    mode: 'migrate-rust',
    rationale:
      'Line-oriented text importers can often move cleanly to Rust while TS keeps browser file input and fallback wiring.',
    suggestedModelFamily: 'gpt-5.4',
    paths: [
      'src/import/linux-tools-perf.ts',
      'src/import/bg-flamegraph.ts',
      'src/import/papyrus.ts',
      'src/import/pmcstat-callgraph.ts',
      'src/import/haskell.ts',
      'src/lib/file-format.ts',
    ],
    verification: ['npm run jest -- src/import/linux-tools-perf.test.ts src/import/bg-flamegraph.test.ts src/import/papyrus.test.ts src/import/pmcstat-callgraph.test.ts src/import/haskell.test.ts'],
  },
  {
    id: 'keep-ts-browser-ui',
    title: 'Review browser UI retention',
    mode: 'keep-ts-review',
    rationale:
      'UI, Preact, DOM events, and browser state should remain in TS/TSX even in a Rust-heavy architecture.',
    suggestedModelFamily: 'composer-2',
    paths: ['src/views/**/*.tsx', 'src/views/**/*.ts', 'src/speedscope.tsx', 'src/app-state/**/*.ts'],
    verification: ['npm run typecheck'],
  },
  {
    id: 'keep-ts-webgl-canvas',
    title: 'Review WebGL and canvas retention',
    mode: 'keep-ts-review',
    rationale:
      'WebGL submission, canvas measurement, and browser graphics lifecycle remain TS concerns; only pure prep work should move to Rust.',
    suggestedModelFamily: 'composer-2',
    paths: ['src/gl/**/*.ts', 'src/lib/canvas-2d-batch-renderers.ts', 'src/lib/text-utils.ts'],
    verification: ['npm run typecheck'],
  },
  {
    id: 'keep-ts-tooling-control-plane',
    title: 'Review tooling and control plane retention',
    mode: 'keep-ts-review',
    rationale:
      'The SDK orchestration and benchmark scripts are already natural TS/Node control-plane code and should not be forced into Rust.',
    suggestedModelFamily: 'composer-2',
    paths: ['scripts/perf/*.ts', 'scripts/*.ts', 'package.json'],
    verification: ['npm run typecheck'],
  },
]
