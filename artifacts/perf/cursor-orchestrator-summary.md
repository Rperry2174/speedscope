# Cursor orchestrator summary

## Summary

- conductor (composer-2, cloud, error): fetch failed
- analyst (gpt-5.4-high, cloud, error): fetch failed
- reviewer (claude-4.6-opus-high-thinking-fast, cloud, error): fetch failed
- 
- Proposed migration shards:
- core-algorithms: opus-4.6 / rust-candidate / Core algorithms and data structures
- importers: gpt-5.4 / rust-candidate / Importer pipeline
- search-and-indexing: gpt-5.4 / rust-candidate / Search and indexing
- render-prep: opus-4.6 / rust-candidate / Render preparation and geometry
- browser-ui: composer-2 / keep-ts / UI, DOM, and browser integration
- webgl-and-canvas: composer-2 / keep-ts / WebGL and canvas bindings
- tooling-and-orchestration: composer-2 / keep-ts / Tooling and orchestrator

## Browser benchmark

# SpeedScope browser benchmark

Generated at: 2026-04-19T08:36:02.908Z

Experiment: cursor-orchestrator

Flags:

- deferDemangle: false
- optimizedForEachCall: false

## Fixture results

- no results


## Parity

- All parity checks passed.
