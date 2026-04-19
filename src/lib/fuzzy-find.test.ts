import fs from 'fs'
import path from 'path'
import {fuzzyMatchStrings, fuzzyMatchStringsTs} from './fuzzy-find'
import {
  fuzzy_match_strings_json as fuzzyMatchStringsJsonFromRust,
  initSync as initRustFuzzyFindSync,
} from '../../rust/fuzzy-find/pkg/fuzzy_find.js'
import {
  loadRustFuzzyMatcher,
  resetRustFuzzyMatcherForTesting,
  setRustFuzzyMatcherTestingHooks,
} from './fuzzy-find-rust'
import {setExperimentOverridesForTesting} from './runtime-config'
import {sortBy} from './utils'

function loadDirectRustMatcher() {
  const wasmModule = fs.readFileSync(
    path.join(process.cwd(), 'rust', 'fuzzy-find', 'pkg', 'fuzzy_find_bg.wasm'),
  )
  const wasmBytes = wasmModule.buffer.slice(
    wasmModule.byteOffset,
    wasmModule.byteOffset + wasmModule.byteLength,
  )
  initRustFuzzyFindSync(wasmBytes)
  return (text: string, pattern: string) => {
    const result = fuzzyMatchStringsJsonFromRust(text, pattern)
    if (!result || result === 'null') return null
    return JSON.parse(result)
  }
}

function assertMatches(texts: string[], pattern: string, expectedResults: string[]) {
  const results: {score: number; highlighted: string}[] = []

  for (let text of texts) {
    const match = fuzzyMatchStrings(text, pattern)
    if (match == null) {
      continue
    }

    let highlighted = ''
    let last = 0
    for (let range of match.matchedRanges) {
      highlighted += `${text.slice(last, range[0])}[${text.slice(range[0], range[1])}]`
      last = range[1]
    }
    highlighted += text.slice(last)

    results.push({score: match.score, highlighted})
  }

  // Sort scores in descending order
  sortBy(results, r => -r.score)
  expect(results.map(r => r.highlighted)).toEqual(expectedResults)
}

function assertMatch(text: string, pattern: string, expected: string) {
  assertMatches([text], pattern, [expected])
}

function assertNoMatch(text: string, pattern: string) {
  assertMatches([text], pattern, [])
}

describe('fuzzyMatchStrings', () => {
  test('no match', () => {
    assertNoMatch('a', 'b')
    assertNoMatch('aa', 'ab')
    assertNoMatch('a', 'aa')
    assertNoMatch('ca', 'ac')
  })

  test('full text match', () => {
    assertMatch('hello', 'hello', '[hello]')
    assertMatch('multiple words', 'multiple words', '[multiple words]')
  })

  test('case sensitivity', () => {
    assertMatch('HELLO', 'hello', '[HELLO]')
    assertMatch('Hello', 'hello', '[Hello]')
    assertNoMatch('hello', 'Hello')
    assertNoMatch('hello', 'HELLO')
  })

  test('multiple occurrences', () => {
    assertMatch('hello hello', 'hello', '[hello] hello')
    assertMatch('hellohello', 'hello', '[hello]hello')
  })

  test('prefer earlier matches', () => {
    assertMatches(['cab', 'ab'], 'ab', ['[ab]', 'c[ab]'])
  })

  test('prefer shorter matches', () => {
    assertMatches(['abbc', 'abc', 'abbbc'], 'ac', ['[a]b[c]', '[a]bb[c]', '[a]bbb[c]'])
  })

  test('prefer word boundaries', () => {
    assertMatches(['abc', 'a c'], 'ac', ['[a] [c]', '[a]b[c]'])
  })

  test('prefer camelCase matches', () => {
    assertMatches(['downtown', 'OutNode'], 'n', ['Out[N]ode', 'dow[n]town'])
  })

  test('prefer number prefix matches', () => {
    assertMatches(['211', 'a123'], '1', ['a[1]23', '2[1]1'])
  })
})

describe('rust fuzzy matcher parity', () => {
  afterEach(() => {
    resetRustFuzzyMatcherForTesting()
    setExperimentOverridesForTesting(null)
  })

  test('generated Rust/WASM matcher matches the TypeScript implementation for representative cases', () => {
    const rustMatcher = loadDirectRustMatcher()
    const cases: Array<{text: string; pattern: string}> = [
      {text: 'hello', pattern: 'hello'},
      {text: 'HELLO', pattern: 'hello'},
      {text: 'hello hello', pattern: 'hello'},
      {text: 'abc', pattern: 'ac'},
      {text: 'a c', pattern: 'ac'},
      {text: 'OutNode', pattern: 'n'},
      {text: 'a123', pattern: '1'},
      {text: 'ruby-stackprof.json', pattern: 'rsj'},
      {text: 'Trace-20230603T221323.json', pattern: 'ttj'},
      {text: 'firefox.json', pattern: 'fx'},
      {text: 'hello world', pattern: 'world'},
      {text: 'ca', pattern: 'ac'},
    ]

    for (const testCase of cases) {
      expect(rustMatcher(testCase.text, testCase.pattern)).toEqual(
        fuzzyMatchStringsTs(testCase.text, testCase.pattern),
      )
    }
  })

  test('returns null for non-matches from the wasm boundary', async () => {
    const rustMatcher = await loadRustFuzzyMatcher()
    expect(rustMatcher('ca', 'ac')).toBeNull()
  })

  test('public API switches to rust matcher when experiment flag is enabled and loaded', async () => {
    setExperimentOverridesForTesting({rustFuzzyFind: true})
    const rustMatcher = await loadRustFuzzyMatcher()
    expect(fuzzyMatchStrings('hello world', 'hw')).toEqual(rustMatcher('hello world', 'hw'))
  })

  test('public API stays aligned with the TypeScript fallback when rust flag is off', () => {
    expect(fuzzyMatchStrings('hello world', 'hw')).toEqual(fuzzyMatchStringsTs('hello world', 'hw'))
  })

  test('falls back to TypeScript when wasm initialization fails', () => {
    setExperimentOverridesForTesting({rustFuzzyFind: true})
    setRustFuzzyMatcherTestingHooks({
      initializeModule: async () => {
        throw new Error('init failed')
      },
    })

    expect(fuzzyMatchStrings('hello world', 'hw')).toEqual(fuzzyMatchStringsTs('hello world', 'hw'))
  })

  test('falls back to TypeScript when wasm execution throws after initialization', async () => {
    setRustFuzzyMatcherTestingHooks({
      initializeModule: async () => {},
      fuzzyMatchStringsJson: () => {
        throw new Error('execution failed')
      },
    })

    const rustMatcher = await loadRustFuzzyMatcher()
    expect(rustMatcher('hello world', 'hw')).toEqual(fuzzyMatchStringsTs('hello world', 'hw'))
  })
})
