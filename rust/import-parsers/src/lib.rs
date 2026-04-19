use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct WeightedStack {
    frames: Vec<NormalizedFrame>,
    weight: f64,
}

#[derive(Clone, Serialize)]
struct NormalizedFrame {
    key: serde_json::Value,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    col: Option<u32>,
}

#[derive(Serialize)]
struct SafariImport {
    profile_duration: f64,
    display_name: String,
    samples: Vec<WeightedStack>,
}

#[derive(Serialize)]
struct StackprofImport {
    mode: String,
    interval: f64,
    samples: Vec<WeightedStack>,
}

#[derive(Deserialize)]
struct SafariProfileInput {
    recording: SafariRecordingInput,
}

#[derive(Deserialize)]
struct SafariRecordingInput {
    #[serde(rename = "displayName")]
    display_name: String,
    #[serde(rename = "sampleStackTraces")]
    sample_stack_traces: Vec<SafariSampleInput>,
    #[serde(rename = "sampleDurations")]
    sample_durations: Vec<f64>,
}

#[derive(Deserialize)]
struct SafariSampleInput {
    timestamp: f64,
    #[serde(rename = "stackFrames")]
    stack_frames: Vec<SafariFrameInput>,
}

#[derive(Deserialize)]
struct SafariFrameInput {
    name: String,
    line: u32,
    column: u32,
    url: String,
}

#[derive(Deserialize)]
struct StackprofProfileInput {
    frames: HashMap<String, StackprofFrameInput>,
    mode: String,
    raw: Vec<u64>,
    raw_timestamp_deltas: Option<Vec<f64>>,
    interval: f64,
}

#[derive(Deserialize, Clone)]
struct StackprofFrameInput {
    name: Option<String>,
    file: Option<String>,
    line: Option<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PapyrusLine {
    at: i32,
    event: String,
    stack_int: i32,
    name: String,
}

#[derive(Serialize)]
struct PmcstatSample {
    frames: Vec<PmcstatFrame>,
    duration: i32,
}

#[derive(Clone, Serialize)]
struct PmcstatFrame {
    key: String,
    name: String,
    file: Option<String>,
}

fn js_error(message: impl Into<String>) -> JsValue {
    JsValue::from_str(&message.into())
}

fn take_raw_value(raw: &[u64], index: &mut usize, label: &str) -> Result<u64, JsValue> {
    let value = raw
        .get(*index)
        .copied()
        .ok_or_else(|| js_error(format!("Malformed stackprof profile: missing {label}")))?;
    *index += 1;
    Ok(value)
}

fn last_path_segment(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn normalize_safari_frame(frame: &SafariFrameInput) -> NormalizedFrame {
    let name = if frame.name.is_empty() {
        if frame.url.is_empty() {
            "(anonymous)".to_string()
        } else {
            format!("(anonymous {}:{})", last_path_segment(&frame.url), frame.line)
        }
    } else {
        frame.name.clone()
    };

    NormalizedFrame {
        key: serde_json::Value::String(format!(
            "{}:{}:{}:{}",
            frame.name, frame.url, frame.line, frame.column
        )),
        name,
        file: Some(frame.url.clone()),
        line: Some(frame.line),
        col: Some(frame.column),
    }
}

fn convert_js_value<T>(value: T) -> Result<JsValue, JsValue>
where
    T: Serialize,
{
    serde_wasm_bindgen::to_value(&value)
        .map_err(|error| js_error(format!("Failed to serialize Rust import parser result: {error}")))
}

#[wasm_bindgen]
pub fn normalize_safari_profile(profile: JsValue) -> Result<JsValue, JsValue> {
    let input: SafariProfileInput = serde_wasm_bindgen::from_value(profile)
        .map_err(|error| js_error(format!("Failed to deserialize Safari profile: {error}")))?;

    let samples = input.recording.sample_stack_traces;
    let durations = input.recording.sample_durations;
    if samples.is_empty() {
        return convert_js_value(SafariImport {
            profile_duration: 0.0,
            display_name: input.recording.display_name,
            samples: Vec::new(),
        });
    }

    let profile_duration = samples
        .last()
        .map(|sample| sample.timestamp)
        .unwrap_or(0.0)
        - samples[0].timestamp
        + durations[0];

    let mut normalized_samples = Vec::new();
    let mut previous_end_time = f64::MAX;

    for (index, sample) in samples.iter().enumerate() {
        let duration = *durations.get(index).ok_or_else(|| {
            js_error("Malformed Safari profile: sampleDurations is shorter than sampleStackTraces")
        })?;
        let end_time = sample.timestamp;
        let start_time = end_time - duration;
        let idle_duration_before = start_time - previous_end_time;

        if idle_duration_before > 0.002 {
            normalized_samples.push(WeightedStack {
                frames: Vec::new(),
                weight: idle_duration_before,
            });
        }

        let frames = sample
            .stack_frames
            .iter()
            .rev()
            .map(normalize_safari_frame)
            .collect();
        normalized_samples.push(WeightedStack {
            frames,
            weight: duration,
        });
        previous_end_time = end_time;
    }

    convert_js_value(SafariImport {
        profile_duration,
        display_name: input.recording.display_name,
        samples: normalized_samples,
    })
}

#[wasm_bindgen]
pub fn normalize_stackprof_profile(profile: JsValue) -> Result<JsValue, JsValue> {
    let input: StackprofProfileInput = serde_wasm_bindgen::from_value(profile)
        .map_err(|error| js_error(format!("Failed to deserialize stackprof profile: {error}")))?;

    let mut raw_index = 0usize;
    let mut sample_index = 0usize;
    let mut previous_stack: Vec<NormalizedFrame> = Vec::new();
    let mut normalized_samples = Vec::new();

    while raw_index < input.raw.len() {
        let stack_height = take_raw_value(&input.raw, &mut raw_index, "stack height")? as usize;
        let mut stack = Vec::with_capacity(stack_height);

        for _ in 0..stack_height {
            let frame_id = take_raw_value(&input.raw, &mut raw_index, "frame id")?;
            let frame = input
                .frames
                .get(&frame_id.to_string())
                .ok_or_else(|| js_error(format!("Malformed stackprof profile: unknown frame {frame_id}")))?;
            let name = frame
                .name
                .clone()
                .filter(|name| !name.is_empty())
                .unwrap_or_else(|| "(unknown)".to_string());

            stack.push(NormalizedFrame {
                key: serde_json::Value::Number(serde_json::Number::from(frame_id)),
                name,
                file: frame.file.clone(),
                line: frame.line,
                col: None,
            });
        }

        if stack.len() == 1 && stack[0].name == "(garbage collection)" {
            let mut gc_stack = previous_stack.clone();
            gc_stack.extend(stack.into_iter());
            stack = gc_stack;
        }

        let n_samples = take_raw_value(&input.raw, &mut raw_index, "sample count")? as usize;
        let weight = match input.mode.as_str() {
            "object" => n_samples as f64,
            "cpu" => n_samples as f64 * input.interval,
            _ => {
                let deltas = input.raw_timestamp_deltas.as_ref().ok_or_else(|| {
                    js_error(
                        "Malformed stackprof profile: raw_timestamp_deltas is required for non-cpu/object modes",
                    )
                })?;
                let mut sample_duration = 0.0;
                for _ in 0..n_samples {
                    let delta = deltas.get(sample_index).copied().ok_or_else(|| {
                        js_error(
                            "Malformed stackprof profile: raw_timestamp_deltas is shorter than raw samples",
                        )
                    })?;
                    sample_duration += delta;
                    sample_index += 1;
                }
                sample_duration
            }
        };

        normalized_samples.push(WeightedStack {
            frames: stack.clone(),
            weight,
        });
        previous_stack = stack;
    }

    convert_js_value(StackprofImport {
        mode: input.mode,
        interval: input.interval,
        samples: normalized_samples,
    })
}

fn parse_papyrus_line(line: &str, start_value: Option<i32>) -> Option<PapyrusLine> {
    let parts: Vec<&str> = line.split(':').collect();
    if parts.len() < 3 {
        return None;
    }

    let at_raw = parts[0].parse::<i32>().ok()?;
    let event = parts[1].to_string();
    let stack_int = parts[2].parse::<i32>().ok()?;
    let name = parts.get(5).copied().unwrap_or("").to_string();
    Some(PapyrusLine {
        at: at_raw - start_value.unwrap_or(0),
        event,
        stack_int,
        name,
    })
}

#[wasm_bindgen]
pub fn parse_papyrus_json(contents: &str) -> String {
    let lines: Vec<&str> = contents
        .lines()
        .filter(|line| !line.is_empty() && *line != "Log closed" && !line.contains("log opened"))
        .collect();

    if lines.is_empty() {
        return "[]".to_string();
    }

    let start_value = match parse_papyrus_line(lines[0], None) {
        Some(parsed) => parsed.at,
        None => return "[]".to_string(),
    };

    let parsed_lines: Vec<PapyrusLine> = lines
        .into_iter()
        .filter_map(|line| parse_papyrus_line(line, Some(start_value)))
        .collect();

    serde_json::to_string(&parsed_lines).unwrap_or_else(|_| "[]".to_string())
}

fn parse_pmcstat_match(line: &str) -> Option<(usize, i32, String, Option<String>)> {
    let bytes = line.as_bytes();
    let mut indent = 0usize;
    while indent < bytes.len() && bytes[indent] == b' ' {
        indent += 1;
    }

    let rest = &line[indent..];
    let percent_end = rest.find("%  [")?;
    let after_percent = &rest[percent_end + 4..];
    let duration_end = after_percent.find(']')?;
    let duration = after_percent[..duration_end].parse::<i32>().ok()?;

    let mut symbol_part = after_percent[duration_end + 1..].trim_start();
    if symbol_part.is_empty() {
        return None;
    }

    let mut file: Option<String> = None;
    if let Some((symbol, file_part)) = symbol_part.split_once(" @ ") {
        symbol_part = symbol.trim_end();
        file = Some(file_part.to_string());
    }

    if symbol_part.is_empty() || symbol_part.split_whitespace().count() != 1 {
        return None;
    }

    Some((indent, duration, symbol_part.to_string(), file))
}

#[wasm_bindgen]
pub fn parse_pmcstat_json(contents: &str) -> String {
    let mut parsed_lines: Vec<PmcstatSample> = Vec::new();
    let mut stack: Vec<Option<PmcstatFrame>> = Vec::new();
    let mut file: Option<String> = None;
    let mut prev_duration = 0i32;
    let mut prev_indent: Option<usize> = None;

    for line in contents.lines() {
        let Some((indent, duration, name, line_file)) = parse_pmcstat_match(line) else {
            continue;
        };

        if let Some(previous_indent) = prev_indent {
            if indent <= previous_indent {
                let frames = stack
                    .iter()
                    .take(previous_indent + 1)
                    .filter_map(|frame| frame.clone())
                    .rev()
                    .collect::<Vec<_>>();
                parsed_lines.push(PmcstatSample {
                    frames,
                    duration: prev_duration,
                });
            }
        }

        file = line_file.or(file);
        if stack.len() <= indent {
            stack.resize_with(indent + 1, || None);
        }
        stack[indent] = Some(PmcstatFrame {
            key: name.clone(),
            name,
            file: file.clone(),
        });
        prev_duration = duration;
        prev_indent = Some(indent);
    }

    if let Some(previous_indent) = prev_indent {
        let frames = stack
            .iter()
            .take(previous_indent + 1)
            .filter_map(|frame| frame.clone())
            .rev()
            .collect::<Vec<_>>();
        parsed_lines.push(PmcstatSample {
            frames,
            duration: prev_duration,
        });
    }

    serde_json::to_string(&parsed_lines).unwrap_or_else(|_| "[]".to_string())
}

#[cfg(test)]
mod tests {
    use super::{parse_papyrus_line, parse_pmcstat_match};

    #[test]
    fn parses_papyrus_line() {
        let parsed = parse_papyrus_line(
            "500:PUSH:3053:1:abcExampleQuest (24021278):abc_example_quest..exampleFunction1",
            Some(500),
        )
        .unwrap();
        assert_eq!(parsed.at, 0);
        assert_eq!(parsed.event, "PUSH");
        assert_eq!(parsed.stack_int, 3053);
        assert_eq!(parsed.name, "abc_example_quest..exampleFunction1");
    }

    #[test]
    fn parses_pmcstat_line() {
        let parsed =
            parse_pmcstat_match("    100.0%  [7447]         taskqueue_run_locked @ /boot/kernel/kernel")
                .unwrap();
        assert_eq!(parsed.0, 4);
        assert_eq!(parsed.1, 7447);
        assert_eq!(parsed.2, "taskqueue_run_locked");
        assert_eq!(parsed.3.as_deref(), Some("/boot/kernel/kernel"));
    }

    #[test]
    fn ignores_invalid_pmcstat_line() {
        assert!(parse_pmcstat_match("invalid line").is_none());
    }
}
