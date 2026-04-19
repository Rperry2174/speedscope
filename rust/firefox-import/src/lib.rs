use serde::Serialize;
use serde_json::Value;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FirefoxImportFrame {
    key: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    col: Option<u32>,
}

#[derive(Serialize)]
struct FirefoxImportSample {
    stack: Vec<usize>,
    value: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FirefoxImportPayload {
    duration: f64,
    frames: Vec<FirefoxImportFrame>,
    samples: Vec<FirefoxImportSample>,
}

fn get_thread<'a>(threads: &'a [Value]) -> Option<&'a Value> {
    if threads.len() == 1 {
        return threads.first();
    }
    threads
        .iter()
        .find(|thread| thread.get("name").and_then(Value::as_str) == Some("GeckoMain"))
}

fn parse_location(location: &str) -> Option<FirefoxImportFrame> {
    let suffix_start = location.rfind(" (")?;
    if !location.ends_with(')') {
        return None;
    }

    let name = &location[..suffix_start];
    let mut remainder = &location[suffix_start + 2..location.len() - 1];
    if remainder.is_empty() {
        return None;
    }

    let mut col = None;
    if let Some((prefix, tail)) = split_trailing_number(remainder) {
        remainder = prefix;
        col = Some(tail + 1);
    }

    let mut line = None;
    if let Some((prefix, tail)) = split_trailing_number(remainder) {
        remainder = prefix;
        line = Some(tail);
    }

    if remainder.starts_with("resource:") || remainder == "self-hosted" || remainder.starts_with("self-hosted:") {
        return None;
    }

    Some(FirefoxImportFrame {
        key: location.to_string(),
        name: name.to_string(),
        file: Some(remainder.to_string()),
        line,
        col,
    })
}

fn split_trailing_number(input: &str) -> Option<(&str, u32)> {
    let split = input.rfind(':')?;
    let digits = input[split + 1..].parse::<u32>().ok()?;
    Some((&input[..split], digits))
}

fn as_array<'a>(value: &'a Value, key: &str) -> Result<&'a [Value], String> {
    value
        .get(key)
        .and_then(Value::as_array)
        .map(Vec::as_slice)
        .ok_or_else(|| format!("Expected array at \"{}\"", key))
}

fn as_f64(value: &Value, key: &str) -> Result<f64, String> {
    value
        .get(key)
        .and_then(Value::as_f64)
        .ok_or_else(|| format!("Expected number at \"{}\"", key))
}

fn as_usize(value: &Value) -> Result<usize, String> {
    value.as_u64()
        .map(|number| number as usize)
        .ok_or_else(|| "Expected non-negative integer".to_string())
}

fn extract_payload(profile: &Value) -> Result<FirefoxImportPayload, String> {
    let duration = as_f64(profile, "duration")?;
    let cpu_profile = profile
        .get("profile")
        .ok_or_else(|| "Expected object at \"profile\"".to_string())?;
    let threads = as_array(cpu_profile, "threads")?;
    let thread = get_thread(threads).ok_or_else(|| "Could not locate GeckoMain thread".to_string())?;

    let stack_table = thread
        .get("stackTable")
        .ok_or_else(|| "Expected object at \"profile.threads[].stackTable\"".to_string())?;
    let stack_rows = as_array(stack_table, "data")?;

    let frame_table = thread
        .get("frameTable")
        .ok_or_else(|| "Expected object at \"profile.threads[].frameTable\"".to_string())?;
    let frame_rows = as_array(frame_table, "data")?;

    let string_table = as_array(thread, "stringTable")?;

    let samples_object = thread
        .get("samples")
        .ok_or_else(|| "Expected object at \"profile.threads[].samples\"".to_string())?;
    let samples = as_array(samples_object, "data")?;

    let mut frames = Vec::<FirefoxImportFrame>::new();
    let mut frame_indices = std::collections::HashMap::<String, usize>::new();
    let mut normalized_samples = Vec::<FirefoxImportSample>::with_capacity(samples.len());

    for sample in samples {
        let sample_row = sample
            .as_array()
            .ok_or_else(|| "Expected Firefox sample row to be an array".to_string())?;
        if sample_row.len() < 2 {
            return Err("Expected Firefox sample row to include stack and time".to_string());
        }

        let mut stack_frame_id = if sample_row[0].is_null() {
            None
        } else {
            Some(as_usize(&sample_row[0])?)
        };

        let mut stack = Vec::<usize>::new();
        while let Some(current_stack_id) = stack_frame_id {
            let stack_row = stack_rows
                .get(current_stack_id)
                .and_then(Value::as_array)
                .ok_or_else(|| "Expected Firefox stack row to be an array".to_string())?;
            if stack_row.len() < 2 {
                return Err("Expected Firefox stack row to contain prefix and frame".to_string());
            }

            let next_prefix = if stack_row[0].is_null() {
                None
            } else {
                Some(as_usize(&stack_row[0])?)
            };
            let frame_id = as_usize(&stack_row[1])?;
            stack.push(frame_id);
            stack_frame_id = next_prefix;
        }

        stack.reverse();

        let mut normalized_stack = Vec::<usize>::new();
        for frame_id in stack {
            let frame_row = frame_rows
                .get(frame_id)
                .and_then(Value::as_array)
                .ok_or_else(|| "Expected Firefox frame row to be an array".to_string())?;
            let location_index = frame_row
                .first()
                .ok_or_else(|| "Expected Firefox frame row to include a location".to_string())
                .and_then(as_usize)?;
            let location = string_table
                .get(location_index)
                .and_then(Value::as_str)
                .ok_or_else(|| "Expected Firefox string table location to be a string".to_string())?;

            if let Some(frame) = parse_location(location) {
                let index = if let Some(index) = frame_indices.get(&frame.key) {
                    *index
                } else {
                    let index = frames.len();
                    frame_indices.insert(frame.key.clone(), index);
                    frames.push(frame);
                    index
                };
                normalized_stack.push(index);
            }
        }

        normalized_samples.push(FirefoxImportSample {
            stack: normalized_stack,
            value: sample_row[1]
                .as_f64()
                .ok_or_else(|| "Expected Firefox sample value to be a number".to_string())?,
        });
    }

    Ok(FirefoxImportPayload {
        duration,
        frames,
        samples: normalized_samples,
    })
}

#[wasm_bindgen]
pub fn extract_firefox_import_payload_json(input: &[u8]) -> String {
    let parsed = match serde_json::from_slice::<Value>(input) {
        Ok(value) => value,
        Err(error) => return format!("{{\"error\":\"{}\"}}", error),
    };

    match extract_payload(&parsed) {
        Ok(payload) => match serde_json::to_string(&payload) {
            Ok(json) => json,
            Err(error) => format!("{{\"error\":\"{}\"}}", error),
        },
        Err(error) => format!("{{\"error\":\"{}\"}}", error.replace('"', "\\\"")),
    }
}
