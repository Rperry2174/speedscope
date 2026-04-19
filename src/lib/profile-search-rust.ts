import initRustProfileSearch, {
  exact_match_strings_batch as exactMatchStringsBatchRust,
} from '../../rust/profile-search/pkg/profile_search.js'
import wasmBinaryPath from '../../rust/profile-search/pkg/profile_search_bg.wasm'
import {isExperimentEnabled} from './runtime-config'

let modulePromise: Promise<void> | null = null
type ExactMatchRanges = [number, number][]
type ExactMatchBatchResult = Array<ExactMatchRanges | null>

let rustBatchMatcher: ((texts: string[], pattern: string) => ExactMatchBatchResult) | null = null

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

export function exactMatchStringsBatchTs(texts: string[], pattern: string): ExactMatchBatchResult {
  return texts.map(text => {
    const match = exactMatchStringsTs(text, pattern)
    return match.length === 0 ? null : match
  })
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

export function exactMatchStringsRustAware(text: string, pattern: string): [number, number][] {
  const result = exactMatchStringsBatch([text], pattern)[0]
  return result || []
}
