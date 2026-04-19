use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

struct TrimmedTextResult {
    prefix_length: usize,
    suffix_length: usize,
    original_length: usize,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum IndexTypeInTrimmed {
    InPrefix,
    InSuffix,
    Elided,
}

type Range = (usize, usize);

#[derive(Deserialize, Serialize)]
struct RangeSerde(usize, usize);

fn get_index_type_in_trimmed(result: &TrimmedTextResult, index: usize) -> IndexTypeInTrimmed {
    if index < result.prefix_length {
        IndexTypeInTrimmed::InPrefix
    } else if index < result.original_length.saturating_sub(result.suffix_length) {
        IndexTypeInTrimmed::Elided
    } else {
        IndexTypeInTrimmed::InSuffix
    }
}

fn remap_ranges_impl(
    trimmed_length: usize,
    prefix_length: usize,
    suffix_length: usize,
    original_length: usize,
    flat_ranges: &[usize],
) -> Result<Vec<Range>, String> {
    if flat_ranges.len() % 2 != 0 {
        return Err("Expected an even number of range endpoints".to_string());
    }

    let trimmed = TrimmedTextResult {
        prefix_length,
        suffix_length,
        original_length,
    };

    let mut ranges_to_highlight = Vec::new();
    let length_loss = original_length
        .checked_sub(trimmed_length)
        .ok_or_else(|| "trimmedLength cannot exceed originalLength".to_string())?;
    let mut highlighted_ellipsis = false;

    for chunk in flat_ranges.chunks_exact(2) {
        let orig_start = chunk[0];
        let orig_end = chunk[1];

        if orig_end == 0 {
            return Err("Highlight ranges must be non-empty".to_string());
        }

        let start_pos_type = get_index_type_in_trimmed(&trimmed, orig_start);
        let end_pos_type = get_index_type_in_trimmed(&trimmed, orig_end - 1);

        match start_pos_type {
            IndexTypeInTrimmed::InPrefix => match end_pos_type {
                IndexTypeInTrimmed::InPrefix => {
                    ranges_to_highlight.push((orig_start, orig_end));
                }
                IndexTypeInTrimmed::Elided => {
                    ranges_to_highlight.push((orig_start, prefix_length + 1));
                    highlighted_ellipsis = true;
                }
                IndexTypeInTrimmed::InSuffix => {
                    ranges_to_highlight.push((orig_start, orig_end - length_loss));
                }
            },
            IndexTypeInTrimmed::Elided => match end_pos_type {
                IndexTypeInTrimmed::InPrefix => {
                    return Err(
                        "Unexpected highlight range starts in elided and ends in prefix"
                            .to_string(),
                    );
                }
                IndexTypeInTrimmed::Elided => {
                    if !highlighted_ellipsis {
                        ranges_to_highlight.push((prefix_length, prefix_length + 1));
                        highlighted_ellipsis = true;
                    }
                }
                IndexTypeInTrimmed::InSuffix => {
                    if highlighted_ellipsis {
                        ranges_to_highlight.push((trimmed_length - suffix_length, orig_end - length_loss));
                    } else {
                        ranges_to_highlight.push((prefix_length, orig_end - length_loss));
                        highlighted_ellipsis = true;
                    }
                }
            },
            IndexTypeInTrimmed::InSuffix => match end_pos_type {
                IndexTypeInTrimmed::InPrefix => {
                    return Err(
                        "Unexpected highlight range starts in suffix and ends in prefix"
                            .to_string(),
                    );
                }
                IndexTypeInTrimmed::Elided => {
                    return Err(
                        "Unexpected highlight range starts in suffix and ends in elided"
                            .to_string(),
                    );
                }
                IndexTypeInTrimmed::InSuffix => {
                    ranges_to_highlight.push((orig_start - length_loss, orig_end - length_loss));
                }
            },
        }
    }

    Ok(ranges_to_highlight)
}

#[wasm_bindgen]
pub fn remap_ranges_to_trimmed_text_json(
    trimmed_length: usize,
    prefix_length: usize,
    suffix_length: usize,
    original_length: usize,
    ranges_json: &str,
) -> Result<String, JsValue> {
    let ranges: Vec<RangeSerde> =
        serde_json::from_str(ranges_json).map_err(|error| JsValue::from(error.to_string()))?;
    let flat_ranges: Vec<usize> = ranges
        .iter()
        .flat_map(|RangeSerde(start, end)| [*start, *end])
        .collect();
    let result = remap_ranges_impl(
        trimmed_length,
        prefix_length,
        suffix_length,
        original_length,
        &flat_ranges,
    )
    .map_err(JsValue::from)?;
    serde_json::to_string(&result).map_err(|error| JsValue::from(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::remap_ranges_impl;

    #[test]
    fn remaps_prefix_and_suffix_ranges() {
        let ranges = remap_ranges_impl(4, 2, 1, 11, &[0, 5, 6, 11]).unwrap();
        assert_eq!(ranges.len(), 2);
        assert_eq!(ranges[0], (0, 3));
        assert_eq!(ranges[1], (2, 4));
    }

    #[test]
    fn validates_even_range_endpoints() {
        let result = remap_ranges_impl(4, 2, 1, 11, &[1]);
        assert!(result.is_err());
    }
}
