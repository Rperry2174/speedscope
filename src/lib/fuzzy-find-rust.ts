import initRustFuzzyFind, {
  fuzzy_match_strings as fuzzyMatchStringsWasm,
  fuzzy_match_strings_json as fuzzyMatchStringsJson,
} from '../../rust/fuzzy-find/pkg/fuzzy_find.js'
import wasmBinaryPath from '../../rust/fuzzy-find/pkg/fuzzy_find_bg.wasm'
import {fuzzyMatchStringsTs} from './fuzzy-find'
import {FuzzyMatch} from './fuzzy-find-types'
import {isExperimentEnabled} from './runtime-config'

let modulePromise: Promise<void> | null = null
let rustMatcher: ((text: string, pattern: string) => FuzzyMatch | null) | null = null
let rustLoadFailed = false
let initializeModuleImpl = initializeModule
let fuzzyMatchStringsJsonImpl = fuzzyMatchStringsJson

const FALL_BACK_TO_JSON = Symbol('FALL_BACK_TO_JSON')

function getWasmModuleOrPath(): unknown {
  let candidate: unknown = wasmBinaryPath
  for (let depth = 0; depth < 4; depth++) {
    if (
      candidate &&
      typeof candidate === 'object' &&
      'default' in (candidate as Record<string, unknown>)
    ) {
      candidate = (candidate as Record<string, unknown>).default
      continue
    }
    break
  }
  if (typeof ArrayBuffer !== 'undefined' && ArrayBuffer.isView(candidate)) {
    return candidate.buffer.slice(candidate.byteOffset, candidate.byteOffset + candidate.byteLength)
  }
  return candidate
}

async function initializeModule(): Promise<void> {
  await initRustFuzzyFind({module_or_path: getWasmModuleOrPath() as any})
}

export async function loadRustFuzzyMatcher(): Promise<(text: string, pattern: string) => FuzzyMatch | null> {
  if (rustMatcher) {
    return rustMatcher
  }
  if (rustLoadFailed) {
    return fuzzyMatchStringsTs
  }
  if (!modulePromise) {
    modulePromise = initializeModuleImpl()
  }
  try {
    await modulePromise
  } catch (error) {
    modulePromise = null
    rustLoadFailed = true
    throw error
  }

  const matcher = (text: string, pattern: string) => {
    const typedResult = tryTypedRustMatch(text, pattern)
    if (typedResult !== FALL_BACK_TO_JSON) {
      return typedResult
    }

    try {
      const result = fuzzyMatchStringsJsonImpl(text, pattern)
      if (!result || result === 'null') return null
      return JSON.parse(result) as FuzzyMatch
    } catch {
      // If the WASM bridge misbehaves after initialization, fall back to the
      // known-good TypeScript implementation for the remainder of the session.
      rustLoadFailed = true
      rustMatcher = null
      return fuzzyMatchStringsTs(text, pattern)
    }
  }
  rustMatcher = matcher
  return matcher
}

function tryTypedRustMatch(
  text: string,
  pattern: string,
): FuzzyMatch | null | typeof FALL_BACK_TO_JSON {
  try {
    return fuzzyMatchStringsWasm(text, pattern) as FuzzyMatch | null
  } catch {
    // Fall back when the typed export is unavailable or a loader mismatch
    // forces us to use the JSON bridge instead.
    return FALL_BACK_TO_JSON
  }
}

function preloadRustFuzzyMatcher() {
  if (rustLoadFailed || rustMatcher != null || modulePromise != null) return
  loadRustFuzzyMatcher()
    .then(matcher => {
      rustMatcher = matcher
    })
    .catch(() => {
      rustLoadFailed = true
      modulePromise = null
      rustMatcher = null
    })
}

export function getFuzzyMatcher(): (text: string, pattern: string) => FuzzyMatch | null {
  if (isExperimentEnabled('rustFuzzyFind')) {
    preloadRustFuzzyMatcher()
    if (rustMatcher) {
      return rustMatcher
    }
  }
  return fuzzyMatchStringsTs
}

export function resetRustFuzzyMatcherForTesting() {
  modulePromise = null
  rustMatcher = null
  rustLoadFailed = false
  initializeModuleImpl = initializeModule
  fuzzyMatchStringsJsonImpl = fuzzyMatchStringsJson
}

export function setRustFuzzyMatcherTestingHooks(
  hooks: Partial<{
    initializeModule: () => Promise<void>
    fuzzyMatchStringsJson: (text: string, pattern: string) => string
  }>,
) {
  if (hooks.initializeModule) {
    initializeModuleImpl = hooks.initializeModule
  }
  if (hooks.fuzzyMatchStringsJson) {
    fuzzyMatchStringsJsonImpl = hooks.fuzzyMatchStringsJson
  }
}
