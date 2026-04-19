use wasm_bindgen::prelude::*;

type MatchRange = (usize, usize);
type MatchRanges = Vec<MatchRange>;
type BatchResult = Vec<Option<MatchRanges>>;

fn exact_match_ranges(text: &str, pattern: &str) -> MatchRanges {
    if pattern.is_empty() {
        return Vec::new();
    }

    let lower_text = text.to_ascii_lowercase();
    let lower_pattern = pattern.to_ascii_lowercase();

    let mut last_index = 0usize;
    let mut matches = Vec::new();

    while let Some(relative_index) = lower_text[last_index..].find(&lower_pattern) {
        let index = last_index + relative_index;
        matches.push((index, index + pattern.len()));
        last_index = index + pattern.len();
    }

    matches
}

fn batch_exact_match_ranges(texts: Vec<String>, pattern: &str) -> BatchResult {
    texts.into_iter()
        .map(|text| {
            let matches = exact_match_ranges(&text, pattern);
            if matches.is_empty() {
                None
            } else {
                Some(matches)
            }
        })
        .collect()
}

#[wasm_bindgen]
pub fn exact_match_strings_batch(texts: Box<[JsValue]>, pattern: &str) -> JsValue {
    let input = texts
        .iter()
        .map(|value| value.as_string().unwrap_or_default())
        .collect::<Vec<_>>();
    let result = batch_exact_match_ranges(input, pattern);
    serde_wasm_bindgen::to_value(&result).unwrap_or(JsValue::NULL)
}

#[cfg(test)]
mod tests {
    use super::{batch_exact_match_ranges, exact_match_ranges};

    #[test]
    fn no_match() {
        assert_eq!(exact_match_ranges("a", "b"), vec![]);
        assert_eq!(exact_match_ranges("aa", "ab"), vec![]);
        assert_eq!(exact_match_ranges("a", "aa"), vec![]);
    }

    #[test]
    fn case_insensitive_ascii_match() {
        assert_eq!(exact_match_ranges("HELLO", "hello"), vec![(0, 5)]);
        assert_eq!(exact_match_ranges("hello", "HELLO"), vec![(0, 5)]);
    }

    #[test]
    fn repeated_non_overlapping_matches() {
        assert_eq!(exact_match_ranges("hello hello", "hello"), vec![(0, 5), (6, 11)]);
        assert_eq!(exact_match_ranges("aaaaa", "aa"), vec![(0, 2), (2, 4)]);
    }

    #[test]
    fn batch_results_preserve_nulls() {
        let result = batch_exact_match_ranges(
            vec!["hello".to_string(), "bye".to_string(), "HelloHello".to_string()],
            "hello",
        );
        assert_eq!(
            result,
            vec![Some(vec![(0, 5)]), None, Some(vec![(0, 5), (5, 10)])]
        );
    }
}
