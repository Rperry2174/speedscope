import initRustProfileSearch, {
  exact_match_strings_batch as exactMatchStringsBatchRust,
} from '../../rust/profile-search/pkg/profile_search.js'
import wasmBinaryPath from '../../rust/profile-search/pkg/profile_search_bg.wasm'
import {Profile, Frame, CallTreeNode} from './profile'
import {Flamechart, FlamechartFrame} from './flamechart'
import {Rect, Vec2} from './math'
import {isExperimentEnabled} from './runtime-config'

export enum FlamechartType {
  CHRONO_FLAME_CHART,
  LEFT_HEAVY_FLAME_GRAPH,
}

// In previous versions of speedscope, searching for strings within the profile
// was done using fuzzy finding. As it turns out, this was surprising behavior
// to most people, so we've switched to a more traditional substring search that
// more closely mimics browser behavior.
//
// This is case insensitive for both the needle & the haystack. This means
// searching for "hello" will match "Hello" and "HELLO", and searching for
// "HELLO" will match both "hello" and "Hello". This matches Chrome's behavior
// as far as I can tell.
//
// See https://github.com/jlfwong/speedscope/issues/352
//
// Return ranges for all matches in order to highlight them.
export type ExactMatchRanges = [number, number][]
export type ExactMatchBatchResult = Array<ExactMatchRanges | null>

export function exactMatchStringsTs(text: string, pattern: string): ExactMatchRanges {
  if (pattern.length === 0) {
    return []
  }

  const lowerText = text.toLocaleLowerCase()
  const lowerPattern = pattern.toLocaleLowerCase()

  let lastIndex = 0
  const matchedRanges: Array<[number, number]> = []
  while (true) {
    let index = lowerText.indexOf(lowerPattern, lastIndex)
    if (index === -1) {
      return matchedRanges
    }
    matchedRanges.push([index, index + pattern.length])
    lastIndex = index + pattern.length
  }
}

export function exactMatchStrings(text: string, pattern: string): ExactMatchRanges {
  return exactMatchStringsTs(text, pattern)
}

export function exactMatchStringsBatchTs(texts: string[], pattern: string): ExactMatchBatchResult {
  return texts.map(text => {
    const match = exactMatchStringsTs(text, pattern)
    return match.length === 0 ? null : match
  })
}

let modulePromise: Promise<void> | null = null
let rustBatchMatcher: ((texts: string[], pattern: string) => ExactMatchBatchResult) | null = null

async function initializeModule(): Promise<void> {
  await initRustProfileSearch({module_or_path: wasmBinaryPath as unknown as string})
}

function isAscii(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 0x7f) {
      return false
    }
  }
  return true
}

function shouldUseRustExactMatcher(texts: string[], pattern: string): boolean {
  return isAscii(pattern) && texts.every(isAscii)
}

function normalizeExactMatchBatchResult(result: unknown): ExactMatchBatchResult {
  if (!Array.isArray(result)) {
    throw new Error('Rust profile search returned a non-array result')
  }

  return result.map(entry => {
    if (entry == null) {
      return null
    }
    if (!Array.isArray(entry)) {
      throw new Error('Rust profile search returned an invalid match list')
    }

    return entry.map(range => {
      if (!Array.isArray(range) || range.length !== 2) {
        throw new Error('Rust profile search returned an invalid range')
      }
      const [start, end] = range
      if (typeof start !== 'number' || typeof end !== 'number') {
        throw new Error('Rust profile search returned a non-numeric range')
      }
      return [start, end] as [number, number]
    })
  })
}

export async function loadRustExactMatchBatchMatcher(): Promise<
  (texts: string[], pattern: string) => ExactMatchBatchResult
> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise

  const matcher = (texts: string[], pattern: string) => {
    if (!shouldUseRustExactMatcher(texts, pattern)) {
      return exactMatchStringsBatchTs(texts, pattern)
    }

    try {
      return normalizeExactMatchBatchResult(exactMatchStringsBatchRust(texts, pattern))
    } catch {
      return exactMatchStringsBatchTs(texts, pattern)
    }
  }
  rustBatchMatcher = matcher
  return matcher
}

function preloadRustExactMatchBatchMatcher() {
  if (rustBatchMatcher != null || modulePromise != null) return
  loadRustExactMatchBatchMatcher()
    .then(matcher => {
      rustBatchMatcher = matcher
    })
    .catch(() => {
      rustBatchMatcher = null
    })
}

function getExactMatchBatchMatcher(): (texts: string[], pattern: string) => ExactMatchBatchResult {
  if (isExperimentEnabled('rustProfileSearch')) {
    preloadRustExactMatchBatchMatcher()
    if (rustBatchMatcher) {
      return rustBatchMatcher
    }
  }
  return exactMatchStringsBatchTs
}

export function exactMatchStringsBatch(texts: string[], pattern: string): ExactMatchBatchResult {
  return getExactMatchBatchMatcher()(texts, pattern)
}

// A utility class for storing cached search results to avoid recomputation when
// the search results & profile did not change.
export class ProfileSearchResults {
  constructor(
    readonly profile: Profile,
    readonly searchQuery: string,
  ) {}

  private matches: Map<Frame, [number, number][] | null> | null = null
  getMatchForFrame(frame: Frame): [number, number][] | null {
    if (!this.matches) {
      this.matches = new Map()
      const frames: Frame[] = []
      this.profile.forEachFrame(frame => {
        frames.push(frame)
      })
      const matches = exactMatchStringsBatch(
        frames.map(frame => frame.name),
        this.searchQuery,
      )
      frames.forEach((frame, index) => {
        this.matches!.set(frame, matches[index] || null)
      })
    }
    return this.matches.get(frame) || null
  }
}

export interface FlamechartSearchMatch {
  configSpaceBounds: Rect
  node: CallTreeNode
}

interface CachedFlamechartResult {
  matches: FlamechartSearchMatch[]
  indexForNode: Map<CallTreeNode, number>
}

export class FlamechartSearchResults {
  constructor(
    readonly flamechart: Flamechart,
    readonly profileResults: ProfileSearchResults,
  ) {}

  private matches: CachedFlamechartResult | null = null
  private getResults(): CachedFlamechartResult {
    if (this.matches == null) {
      const matches: FlamechartSearchMatch[] = []
      const indexForNode = new Map<CallTreeNode, number>()
      const visit = (frame: FlamechartFrame, depth: number) => {
        const {node} = frame
        if (this.profileResults.getMatchForFrame(node.frame)) {
          const configSpaceBounds = new Rect(
            new Vec2(frame.start, depth),
            new Vec2(frame.end - frame.start, 1),
          )
          indexForNode.set(node, matches.length)
          matches.push({configSpaceBounds, node})
        }

        frame.children.forEach(child => {
          visit(child, depth + 1)
        })
      }

      const layers = this.flamechart.getLayers()
      if (layers.length > 0) {
        layers[0].forEach(frame => visit(frame, 0))
      }

      this.matches = {matches, indexForNode}
    }
    return this.matches
  }

  count(): number {
    return this.getResults().matches.length
  }

  indexOf(node: CallTreeNode): number | null {
    const result = this.getResults().indexForNode.get(node)
    return result === undefined ? null : result
  }

  at(index: number): FlamechartSearchMatch {
    const matches = this.getResults().matches
    if (index < 0 || index >= matches.length) {
      throw new Error(`Index ${index} out of bounds in list of ${matches.length} matches.`)
    }
    return matches[index]
  }
}
