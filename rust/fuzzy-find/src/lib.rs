use wasm_bindgen::prelude::*;

const CHAR_CODE_LOWER_A: u32 = 'a' as u32;
const CHAR_CODE_LOWER_Z: u32 = 'z' as u32;
const CHAR_CODE_UPPER_A: u32 = 'A' as u32;
const CHAR_CODE_UPPER_Z: u32 = 'Z' as u32;
const CHAR_CODE_DIGIT_0: u32 = '0' as u32;
const CHAR_CODE_DIGIT_9: u32 = '9' as u32;

const FZF_SCORE_MATCH: i32 = 16;
const FZF_SCORE_GAP_START: i32 = -3;
const FZF_SCORE_GAP_EXTENSION: i32 = -1;
const FZF_BONUS_BOUNDARY: i32 = FZF_SCORE_MATCH / 2;
const FZF_BONUS_NON_WORD: i32 = FZF_SCORE_MATCH / 2;
const FZF_BONUS_CAMEL123: i32 = FZF_BONUS_BOUNDARY + FZF_SCORE_GAP_EXTENSION;
const FZF_BONUS_CONSECUTIVE: i32 = -(FZF_SCORE_GAP_START + FZF_SCORE_GAP_EXTENSION);
const FZF_BONUS_FIRST_CHAR_MULTIPLIER: i32 = 2;

#[derive(Clone, Copy, PartialEq, Eq)]
enum FzfCharClass {
    NonWord,
    Lower,
    Upper,
    Number,
}

fn char_class_of(ch: char) -> FzfCharClass {
    let code = ch as u32;
    if CHAR_CODE_LOWER_A <= code && code <= CHAR_CODE_LOWER_Z {
        FzfCharClass::Lower
    } else if CHAR_CODE_UPPER_A <= code && code <= CHAR_CODE_UPPER_Z {
        FzfCharClass::Upper
    } else if CHAR_CODE_DIGIT_0 <= code && code <= CHAR_CODE_DIGIT_9 {
        FzfCharClass::Number
    } else {
        FzfCharClass::NonWord
    }
}

fn chars_match(text_char: char, pattern_char: char) -> bool {
    if text_char == pattern_char {
        return true;
    }

    let pattern_code = pattern_char as u32;
    if CHAR_CODE_LOWER_A <= pattern_code && pattern_code <= CHAR_CODE_LOWER_Z {
        return (text_char as u32) == pattern_code - CHAR_CODE_LOWER_A + CHAR_CODE_UPPER_A;
    }

    false
}

fn bonus_for(prev_class: FzfCharClass, cur_class: FzfCharClass) -> i32 {
    if prev_class == FzfCharClass::NonWord && cur_class != FzfCharClass::NonWord {
        return FZF_BONUS_BOUNDARY;
    }

    if (prev_class == FzfCharClass::Lower && cur_class == FzfCharClass::Upper)
        || (prev_class != FzfCharClass::Number && cur_class == FzfCharClass::Number)
    {
        return FZF_BONUS_CAMEL123;
    }

    if cur_class == FzfCharClass::NonWord {
        return FZF_BONUS_NON_WORD;
    }

    0
}

fn calculate_score(
    chars: &[char],
    pattern_chars: &[char],
    sidx: usize,
    eidx: usize,
) -> Option<(i32, Vec<(usize, usize)>)> {
    let mut pidx = 0usize;
    let mut score = 0i32;
    let mut in_gap = false;
    let mut consecutive = 0i32;
    let mut first_bonus = 0i32;
    let mut pos = vec![0usize; pattern_chars.len()];

    let mut prev_class = FzfCharClass::NonWord;
    if sidx > 0 {
        prev_class = char_class_of(chars[sidx - 1]);
    }

    for idx in sidx..eidx {
        let ch = chars[idx];
        let cur_class = char_class_of(ch);
        if chars_match(ch, pattern_chars[pidx]) {
            pos[pidx] = idx;
            score += FZF_SCORE_MATCH;
            let mut bonus = bonus_for(prev_class, cur_class);
            if consecutive == 0 {
                first_bonus = bonus;
            } else {
                if bonus == FZF_BONUS_BOUNDARY {
                    first_bonus = bonus;
                }
                bonus = bonus.max(first_bonus).max(FZF_BONUS_CONSECUTIVE);
            }

            if pidx == 0 {
                score += bonus * FZF_BONUS_FIRST_CHAR_MULTIPLIER;
            } else {
                score += bonus;
            }

            in_gap = false;
            consecutive += 1;
            pidx += 1;
            if pidx == pattern_chars.len() {
                break;
            }
        } else {
            if in_gap {
                score += FZF_SCORE_GAP_EXTENSION;
            } else {
                score += FZF_SCORE_GAP_START;
            }
            in_gap = true;
            consecutive = 0;
            first_bonus = 0;
        }
        prev_class = cur_class;
    }

    if pidx != pattern_chars.len() {
        return None;
    }

    let mut matched_ranges = vec![(pos[0], pos[0] + 1)];
    for index in 1..pos.len() {
        let cur_pos = pos[index];
        if let Some(last_range) = matched_ranges.last_mut() {
            if last_range.1 == cur_pos {
                last_range.1 = cur_pos + 1;
            } else {
                matched_ranges.push((cur_pos, cur_pos + 1));
            }
        }
    }

    Some((score, matched_ranges))
}

fn fuzzy_match_impl(text: &str, pattern: &str) -> Option<(i32, Vec<(usize, usize)>)> {
    if pattern.is_empty() {
        return Some((0, Vec::new()));
    }

    let chars: Vec<char> = text.chars().collect();
    let pattern_chars: Vec<char> = pattern.chars().collect();
    let len_pattern = pattern_chars.len();

    let mut pidx = 0usize;
    let mut sidx: Option<usize> = None;
    let mut eidx: Option<usize> = None;

    for (index, ch) in chars.iter().enumerate() {
        let pchar = pattern_chars[pidx];
        if chars_match(*ch, pchar) {
            if sidx.is_none() {
                sidx = Some(index);
            }
            pidx += 1;
            if pidx == len_pattern {
                eidx = Some(index + 1);
                break;
            }
        }
    }

    let mut sidx = sidx?;
    let eidx = eidx?;

    pidx = len_pattern - 1;
    for index in (sidx..eidx).rev() {
        let ch = chars[index];
        let pchar = pattern_chars[pidx];
        if chars_match(ch, pchar) {
            if pidx == 0 {
                sidx = index;
                return calculate_score(&chars, &pattern_chars, sidx, eidx);
            }
            pidx -= 1;
        }
    }

    None
}

#[wasm_bindgen]
pub fn fuzzy_match_strings_json(text: &str, pattern: &str) -> String {
    match fuzzy_match_impl(text, pattern) {
        None => "null".to_string(),
        Some((score, ranges)) => {
            let mut json = format!("{{\"score\":{},\"matchedRanges\":[", score);
            for (index, (start, end)) in ranges.iter().enumerate() {
                if index > 0 {
                    json.push(',');
                }
                json.push('[');
                json.push_str(&start.to_string());
                json.push(',');
                json.push_str(&end.to_string());
                json.push(']');
            }
            json.push_str("]}");
            json
        }
    }
}

#[cfg(test)]
mod tests {
    use super::fuzzy_match_impl;

    #[test]
    fn no_match() {
        assert!(fuzzy_match_impl("a", "b").is_none());
        assert!(fuzzy_match_impl("aa", "ab").is_none());
    }

    #[test]
    fn full_match() {
        let result = fuzzy_match_impl("hello", "hello").unwrap();
        assert_eq!(result.0 > 0, true);
        assert_eq!(result.1, vec![(0, 5)]);
    }

    #[test]
    fn lowercase_matches_uppercase() {
        assert!(fuzzy_match_impl("HELLO", "hello").is_some());
        assert!(fuzzy_match_impl("hello", "HELLO").is_none());
    }
}
