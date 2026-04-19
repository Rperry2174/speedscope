use serde::Serialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ParsedRow {
    source_path: Option<String>,
    symbol_name: String,
    depth: usize,
    weight: i64,
}

#[derive(Serialize)]
struct ParsedDeepCopy {
    formatter: Option<&'static str>,
    rows: Vec<ParsedRow>,
}

#[wasm_bindgen]
pub fn parse_instruments_deep_copy_json(bytes: &[u8]) -> String {
    match parse_impl(bytes) {
        Ok(parsed) => serde_json::to_string(&parsed)
            .unwrap_or_else(|error| format!("{{\"error\":\"{}\"}}", escape_json_string(&error.to_string()))),
        Err(error) => format!("{{\"error\":\"{}\"}}", escape_json_string(&error)),
    }
}

fn parse_impl(bytes: &[u8]) -> Result<ParsedDeepCopy, String> {
    let text = decode_text(bytes)?;
    let normalized = text.replace("\r\n", "\n").replace('\r', "\n");
    let mut lines = normalized.lines();

    let header_line = match lines.next() {
        Some(line) => line,
        None => {
            return Ok(ParsedDeepCopy {
                formatter: None,
                rows: Vec::new(),
            })
        }
    };

    let header_fields: Vec<&str> = header_line.split('\t').collect();
    let mut field_indexes = HashMap::new();
    for (index, field_name) in header_fields.iter().enumerate() {
        field_indexes.insert(*field_name, index);
    }

    let formatter = if field_indexes.contains_key("Bytes Used") {
        Some("bytes")
    } else if field_indexes.contains_key("Weight") || field_indexes.contains_key("Running Time") {
        Some("time")
    } else {
        None
    };

    let mut leading_first_row_spaces = 0usize;
    let mut rows = Vec::new();

    for (row_index, line) in lines.enumerate() {
        if line.is_empty() {
            continue;
        }

        let fields: Vec<&str> = line.split('\t').collect();
        if row_index == 0 {
            if let Some(raw_symbol_names) = get_field(&fields, &field_indexes, "Symbol Names") {
                leading_first_row_spaces = raw_symbol_names.rfind(' ').map(|index| index + 1).unwrap_or(0);
            }
        }

        let raw_symbol_name = if let Some(symbol_name) = get_field(&fields, &field_indexes, "Symbol Name") {
            symbol_name
        } else if let Some(symbol_names) = get_field(&fields, &field_indexes, "Symbol Names") {
            slice_from_char_index(symbol_names, leading_first_row_spaces)
        } else {
            continue;
        };

        let trimmed_symbol_name = raw_symbol_name.trim();
        if trimmed_symbol_name.is_empty() {
            continue;
        }

        let source_path = get_field(&fields, &field_indexes, "Source Path").and_then(|value| {
            let trimmed = value.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_owned())
            }
        });

        rows.push(ParsedRow {
            source_path,
            symbol_name: trimmed_symbol_name.to_owned(),
            depth: count_leading_whitespace(raw_symbol_name),
            weight: get_weight(&fields, &field_indexes)?,
        });
    }

    Ok(ParsedDeepCopy { formatter, rows })
}

fn decode_text(bytes: &[u8]) -> Result<String, String> {
    if bytes.len() >= 2 {
        if bytes[0] == 0xff && bytes[1] == 0xfe {
            return decode_utf16(bytes[2..].chunks_exact(2).map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]])));
        }
        if bytes[0] == 0xfe && bytes[1] == 0xff {
            return decode_utf16(bytes[2..].chunks_exact(2).map(|chunk| u16::from_be_bytes([chunk[0], chunk[1]])));
        }
    }

    String::from_utf8(bytes.to_vec())
        .map_err(|_| "Failed to decode Instruments deep copy as UTF-8".to_string())
}

fn decode_utf16<I>(code_units: I) -> Result<String, String>
where
    I: Iterator<Item = u16>,
{
    std::char::decode_utf16(code_units)
        .map(|result| result.map_err(|_| "Failed to decode Instruments deep copy as UTF-16".to_string()))
        .collect()
}

fn get_field<'a>(
    fields: &'a [&'a str],
    field_indexes: &HashMap<&str, usize>,
    key: &str,
) -> Option<&'a str> {
    field_indexes
        .get(key)
        .and_then(|index| fields.get(*index))
        .copied()
}

fn slice_from_char_index(input: &str, char_index: usize) -> &str {
    if char_index == 0 {
        return input;
    }
    let mut current_char_index = 0usize;
    for (byte_index, _) in input.char_indices() {
        if current_char_index == char_index {
            return &input[byte_index..];
        }
        current_char_index += 1;
    }
    if current_char_index == char_index {
        return "";
    }
    input
}

fn count_leading_whitespace(input: &str) -> usize {
    input.chars().take_while(|ch| ch.is_whitespace()).count()
}

fn get_weight(fields: &[&str], field_indexes: &HashMap<&str, usize>) -> Result<i64, String> {
    if let Some(bytes_used) = get_field(fields, field_indexes, "Bytes Used") {
        return parse_weight(bytes_used, WeightKind::Bytes);
    }

    if let Some(weight) = get_field(fields, field_indexes, "Weight") {
        return parse_weight(weight, WeightKind::TimeOrCycles);
    }

    if let Some(running_time) = get_field(fields, field_indexes, "Running Time") {
        return parse_weight(running_time, WeightKind::TimeOrCycles);
    }

    Ok(-1)
}

enum WeightKind {
    Bytes,
    TimeOrCycles,
}

fn parse_weight(input: &str, kind: WeightKind) -> Result<i64, String> {
    let mut tokens = input.split_whitespace();
    let value = match tokens.next() {
        Some(value) => value.parse::<f64>().ok().map(|parsed| parsed.trunc() as i64),
        None => None,
    };
    let units = tokens.next();
    let percentage = tokens.next();

    if value.is_none() || units.is_none() || percentage.is_none() {
        return Ok(0);
    }

    let value = value.unwrap();
    let units = units.unwrap();

    match kind {
        WeightKind::Bytes => match units {
            "Bytes" => Ok(value),
            "KB" => Ok(1024_i64 * value),
            "MB" => Ok(1024_i64 * 1024_i64 * value),
            "GB" => Ok(1024_i64 * 1024_i64 * 1024_i64 * value),
            _ => Err(format!("Unrecognized units {}", units)),
        },
        WeightKind::TimeOrCycles => match units {
            "ms" => Ok(value),
            "s" => Ok(1000_i64 * value),
            "min" => Ok(60_i64 * 1000_i64 * value),
            "cycles" => Ok(value),
            "Kc" => Ok(1000_i64 * value),
            "Mc" => Ok(1000_i64 * 1000_i64 * value),
            "Gc" => Ok(1000_i64 * 1000_i64 * 1000_i64 * value),
            _ => Err(format!("Unrecognized units {}", units)),
        },
    }
}

fn escape_json_string(input: &str) -> String {
    input.replace('\\', "\\\\").replace('"', "\\\"")
}
