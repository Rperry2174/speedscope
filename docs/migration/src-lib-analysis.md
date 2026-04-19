# Migration Analysis: src/lib/profile.ts and src/lib/flamechart.ts

## Summary

After thorough analysis, **both files should remain in TypeScript**. The WASM
boundary serialization costs would exceed any performance gains due to deep
coupling with JS object graphs consumed across 40+ files.

---

## src/lib/flamechart.ts — Keep in TypeScript

### What it does

The `Flamechart` class (~148 lines) builds flamechart layers from a data source.
The constructor walks all call events via `openFrame`/`closeFrame` callbacks,
builds a stack of `FlamechartFrame` objects, and organizes them into horizontal
layers.

### Why it should stay in TypeScript

1. **Linear O(n) algorithm**: The constructor is a simple stack push/pop over
   call events. It is not compute-heavy enough to justify a WASM boundary.

2. **Tight JS object graph coupling**: Every `FlamechartFrame` holds a direct
   reference to a `CallTreeNode` from `profile.ts`. Views like
   `flamechart-pan-zoom-view.tsx` access `frame.node.frame.name` directly. Moving
   this to Rust would require either duplicating the entire CallTreeNode tree in
   WASM memory or round-tripping through serialization — both more expensive than
   the algorithm itself.

3. **Callback-driven interface**: The `FlamechartDataSource` interface uses
   JS callbacks (`openFrame`/`closeFrame`). Calling into Rust for each event and
   back would add per-call overhead that dwarfs the O(1) work per event.

4. **View coupling**: `Flamechart.getLayers()` returns `FlamechartFrame[][]`
   consumed directly by WebGL renderers and pan-zoom views. The real rendering
   bottleneck is GPU-side, not this layer construction.

---

## src/lib/profile.ts — Keep in TypeScript

### What it does

This ~750-line file is the core data model: `Frame`, `CallTreeNode`, `Profile`,
`StackListProfileBuilder`, and `CallTreeProfileBuilder`. It is the central
nervous system of speedscope — every importer writes to it, every view reads
from it.

### Compute-heavy methods identified

- **`forEachCall`**: Reconstructs the call timeline from `samples[]` and
  `weights[]` by finding the LCA between consecutive stacks. Original is
  O(n²·m); the `forEachCallOptimized` variant is O(n·m).
- **`sortGroupedCallTree`**: Recursive sort by total weight.
- **Builder `_appendSample`**: Tree-walking per sample in StackListProfileBuilder.

### Why it should stay in TypeScript

1. **Deep, pervasive object graph**: `Profile` contains `CallTreeNode` trees
   (with parent pointers), `KeyedSet<Frame>`, and `samples: CallTreeNode[]`.
   Serializing this graph across the WASM boundary — and deserializing it back
   into objects that views can traverse — would cost more than the computation.

2. **40+ consumers**: `Profile`, `Frame`, `CallTreeNode` types are imported in
   every importer (Chrome, Firefox, Safari, pprof, stackprof, etc.), every view,
   and the app-state layer. Wrapping these in WASM-backed proxies would be an
   invasive, high-risk refactor across the entire codebase.

3. **Builder pattern is inherently fine-grained**: Both builders are called
   method-by-method from importers (`enterFrame`, `leaveFrame`,
   `appendSampleWithWeight`). Each call does O(1) work on the tree. The
   per-method WASM call overhead would negate any benefit vs. native JS.

4. **Existing optimization addresses the hot path**: The
   `optimizedForEachCall` experiment flag already provides an O(n·m) algorithm
   vs. the O(n²·m) original. This reduces the performance gap that Rust would
   target.

5. **Callback-based output**: `forEachCall` emits events via callbacks consumed
   by `Flamechart`, `profile-search`, and views. Buffering these in Rust and
   returning as arrays would add allocation overhead and require refactoring all
   consumers.

---

## What would make sense as a future Rust target

If profiling reveals a bottleneck in the `forEachCall` → `Flamechart` pipeline
for very large profiles (>1M samples), a targeted approach would work better
than migrating the entire Profile class:

1. **Serialize compact sample data** (sample depths + frame indices + weights)
   into a flat typed array.
2. **Run layer construction in Rust**: Compute flamechart layer boundaries
   (start, end, depth, frame-index) as flat arrays.
3. **Return flat typed arrays** to JS for WebGL rendering.

This would bypass the object graph entirely and operate on flat numeric data —
the kind of work where WASM genuinely excels. But this is a rendering pipeline
optimization, not a migration of the Profile data model.

---

## Verification

- `npm run typecheck` — passes (pre-existing errors only in `scripts/perf/recursive-rust-migrate.ts`, unrelated)
- `npm run perf:parity` — passes for all 6 fixtures
