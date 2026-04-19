export interface FuzzyMatch {
  // List of [start, end] indices in the haystack string that match the needle string
  matchedRanges: [number, number][]

  // The score of the match for relative ranking. Higher scores indicate
  // "better" matches.
  score: number
}
