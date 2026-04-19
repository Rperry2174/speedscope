import initRustFuzzyFind, {
  fuzzy_match_strings as fuzzyMatchStringsWasm,
  fuzzy_match_strings_json as fuzzyMatchStringsJson,
} from '../../rust/fuzzy-find/pkg/fuzzy_find.js'
import wasmBinaryPath from '../../rust/fuzzy-find/pkg/fuzzy_find_bg.wasm'
import {FuzzyMatch} from './fuzzy-find-types'
import {fuzzyMatchStringsTs} from './fuzzy-find'
import {isExperimentEnabled} from './runtime-config'

let modulePromise: Promise<void> | null = null
let rustMatcher: ((text: string, pattern: string) => FuzzyMatch | null) | null = null
const FALL_BACK_TO_JSON = Symbol('FALL_BACK_TO_JSON')

async function initializeModule(): Promise<void> {
  await initRustFuzzyFind({module_or_path: wasmBinaryPath as unknown as string})
}

export async function loadRustFuzzyMatcher(): Promise<(text: string, pattern: string) => FuzzyMatch | null> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise

  const matcher = (text: string, pattern: string) => {
    const typedResult = tryTypedRustMatch(text, pattern)
    if (typedResult !== FALL_BACK_TO_JSON) {
      return typedResult
    }

    try {
      const result = fuzzyMatchStringsJson(text, pattern)
      if (!result || result === 'null') return null
      return JSON.parse(result) as FuzzyMatch
    } catch {
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
    // Older generated wasm bindings only expose the JSON entrypoint.
    return FALL_BACK_TO_JSON
  }
}

function preloadRustFuzzyMatcher() {
  if (rustMatcher != null || modulePromise != null) return
  loadRustFuzzyMatcher()
    .then(matcher => {
      rustMatcher = matcher
    })
    .catch(() => {
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
