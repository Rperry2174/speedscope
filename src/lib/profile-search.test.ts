import {
  exactMatchStrings,
  exactMatchStringsBatch,
  exactMatchStringsBatchTs,
  exactMatchStringsTs,
  loadRustExactMatchBatchMatcher,
} from './profile-search'
import {setExperimentOverridesForTesting} from './runtime-config'

function assertMatch(text: string, pattern: string, expected: string) {
  const match = exactMatchStrings(text, pattern)

  let highlighted = ''
  let last = 0
  for (let range of match) {
    highlighted += `${text.slice(last, range[0])}[${text.slice(range[0], range[1])}]`
    last = range[1]
  }
  highlighted += text.slice(last)

  expect(highlighted).toEqual(expected)
}

function assertNoMatch(text: string, pattern: string) {
  assertMatch(text, pattern, text)
}

describe('exactMatchStrings', () => {
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
    assertMatch('hello', 'Hello', '[hello]')
    assertMatch('hello', 'HELLO', '[hello]')
  })

  test('multiple occurrences', () => {
    assertMatch('hello hello', 'hello', '[hello] [hello]')
    assertMatch('hellohello', 'hello', '[hello][hello]')
  })

  test('overlapping occurrences', () => {
    assertMatch('aaaaa', 'aa', '[aa][aa]a')
    assertMatch('abababa', 'aba', '[aba]b[aba]')
  })

  test('empty pattern produces no highlights', () => {
    assertMatch('hello', '', 'hello')
  })
})

describe('exactMatchStringsBatch', () => {
  test('returns null for unmatched entries', () => {
    expect(exactMatchStringsBatchTs(['hello', 'world'], 'zz')).toEqual([null, null])
  })

  test('returns aligned per-string matches', () => {
    expect(exactMatchStringsBatchTs(['hello hello', 'world'], 'hello')).toEqual([
      [
        [0, 5],
        [6, 11],
      ],
      null,
    ])
  })
})

describe('rust exact matcher parity', () => {
  afterEach(() => {
    setExperimentOverridesForTesting(null)
  })

  test('matches TypeScript batch implementation for representative ASCII cases', async () => {
    const rustMatcher = await loadRustExactMatchBatchMatcher()
    const cases: Array<{texts: string[]; pattern: string}> = [
      {texts: ['hello', 'HELLO', 'world'], pattern: 'hello'},
      {texts: ['hello hello', 'hellohello'], pattern: 'hello'},
      {texts: ['aaaaa', 'abababa'], pattern: 'aa'},
      {texts: ['abababa', 'ca'], pattern: 'aba'},
      {texts: ['hello', 'world'], pattern: ''},
    ]

    for (const testCase of cases) {
      expect(rustMatcher(testCase.texts, testCase.pattern)).toEqual(
        exactMatchStringsBatchTs(testCase.texts, testCase.pattern),
      )
    }
  })

  test('falls back to TypeScript behavior for non-ascii input', async () => {
    const rustMatcher = await loadRustExactMatchBatchMatcher()
    const texts = ['Straße', 'STRASSE']
    const pattern = 'ß'
    expect(rustMatcher(texts, pattern)).toEqual(exactMatchStringsBatchTs(texts, pattern))
  })

  test('public APIs stay aligned with TypeScript fallback when rust flag is off', () => {
    setExperimentOverridesForTesting({rustProfileSearch: false})
    expect(exactMatchStrings('hello world', 'world')).toEqual(exactMatchStringsTs('hello world', 'world'))
    expect(exactMatchStringsBatch(['hello world', 'world'], 'world')).toEqual(
      exactMatchStringsBatchTs(['hello world', 'world'], 'world'),
    )
  })
})
