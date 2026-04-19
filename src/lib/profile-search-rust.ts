import initRustProfileSearch, {
  exact_match_strings_json as exactMatchStringsJson,
} from '../../rust/profile-search/pkg/profile_search.js'
import wasmBinaryPath from '../../rust/profile-search/pkg/profile_search_bg.wasm'
import {isExperimentEnabled} from './runtime-config'

let modulePromise: Promise<void> | null = null
let rustExactMatcher: ((text: string, pattern: string) => [number, number][]) | null = null

export function exactMatchStringsTs(text: string, pattern: string): [number, number][] {
  const lowerText = text.toLocaleLowerCase()
  const lowerPattern = pattern.toLocaleLowerCase()

  let lastIndex = 0
  const matchedRanges: Array<[number, number]> = []
  while (true) {
    const index = lowerText.indexOf(lowerPattern, lastIndex)
    if (index === -1) {
      return matchedRanges
    }
    matchedRanges.push([index, index + pattern.length])
    lastIndex = index + pattern.length
  }
}

async function initializeModule(): Promise<void> {
  await initRustProfileSearch({module_or_path: wasmBinaryPath as unknown as string})
}

export async function loadRustExactMatcher(): Promise<
  (text: string, pattern: string) => [number, number][]
> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise

  const matcher = (text: string, pattern: string) => {
    const result = exactMatchStringsJson(text, pattern)
    if (!result || result === '[]') return []
    return JSON.parse(result) as [number, number][]
  }
  rustExactMatcher = matcher
  return matcher
}

function preloadRustExactMatcher() {
  if (rustExactMatcher != null || modulePromise != null) return
  loadRustExactMatcher()
    .then(matcher => {
      rustExactMatcher = matcher
    })
    .catch(() => {
      rustExactMatcher = null
    })
}

export function getExactMatcher(
  fallback: (text: string, pattern: string) => [number, number][],
): (text: string, pattern: string) => [number, number][] {
  if (isExperimentEnabled('rustProfileSearch')) {
    preloadRustExactMatcher()
    if (rustExactMatcher) {
      return rustExactMatcher
    }
  }
  return fallback
}

export function exactMatchStringsRustAware(text: string, pattern: string): [number, number][] {
  return getExactMatcher(exactMatchStringsTs)(text, pattern)
}
