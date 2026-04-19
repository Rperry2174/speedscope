use prost::Message;
use serde::Serialize;
use wasm_bindgen::prelude::*;

#[derive(Clone, PartialEq, Message)]
struct ProtoProfile {
    #[prost(message, repeated, tag = "1")]
    sample_type: Vec<ValueType>,
    #[prost(message, repeated, tag = "2")]
    sample: Vec<Sample>,
    #[prost(message, repeated, tag = "4")]
    location: Vec<Location>,
    #[prost(message, repeated, tag = "5")]
    function: Vec<Function>,
    #[prost(string, repeated, tag = "6")]
    string_table: Vec<String>,
    #[prost(int64, tag = "14")]
    default_sample_type: i64,
}

#[derive(Clone, PartialEq, Message)]
struct ValueType {
    #[prost(int64, tag = "1")]
    type_index: i64,
    #[prost(int64, tag = "2")]
    unit: i64,
}

#[derive(Clone, PartialEq, Message)]
struct Sample {
    #[prost(uint64, repeated, tag = "1")]
    location_id: Vec<u64>,
    #[prost(int64, repeated, tag = "2")]
    value: Vec<i64>,
}

#[derive(Clone, PartialEq, Message)]
struct Location {
    #[prost(uint64, tag = "1")]
    id: u64,
    #[prost(message, repeated, tag = "4")]
    line: Vec<Line>,
}

#[derive(Clone, PartialEq, Message)]
struct Line {
    #[prost(uint64, tag = "1")]
    function_id: u64,
    #[prost(int64, tag = "2")]
    line: i64,
}

#[derive(Clone, PartialEq, Message)]
struct Function {
    #[prost(uint64, tag = "1")]
    id: u64,
    #[prost(int64, tag = "2")]
    name: i64,
    #[prost(int64, tag = "4")]
    filename: i64,
    #[prost(int64, tag = "5")]
    start_line: i64,
}

#[derive(Serialize)]
struct DecodedProfile {
    sample_type: DecodedSampleType,
    samples: Vec<DecodedSample>,
}

#[derive(Serialize)]
struct DecodedSampleType {
    #[serde(rename = "type")]
    sample_type: String,
    unit: String,
}

#[derive(Serialize)]
struct DecodedSample {
    frames: Vec<DecodedFrame>,
    value: i64,
}

#[derive(Clone, Serialize)]
struct DecodedFrame {
    key: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<i64>,
}

fn i32(value: i64) -> Option<usize> {
    usize::try_from(value).ok()
}

fn string_value(strings: &[String], key: i64) -> Option<String> {
    i32(key).and_then(|index| strings.get(index)).cloned().filter(|s| !s.is_empty())
}

fn get_sample_type_index(profile: &ProtoProfile) -> usize {
    let fallback = profile.sample_type.len().saturating_sub(1);
    if profile.default_sample_type == 0 {
        return fallback;
    }

    profile
        .sample_type
        .iter()
        .position(|entry| entry.type_index == profile.default_sample_type)
        .unwrap_or(fallback)
}

fn frame_for_function(function: &Function, strings: &[String]) -> DecodedFrame {
    let name = string_value(strings, function.name).unwrap_or_else(|| "(unknown)".to_string());
    let file = string_value(strings, function.filename);
    let line = if function.start_line > 0 {
        Some(function.start_line)
    } else {
        None
    };

    DecodedFrame {
        key: format!(
            "{}:{}:{}",
            name,
            file.as_deref().unwrap_or("null"),
            line.map(|value| value.to_string()).unwrap_or_else(|| "null".to_string())
        ),
        name,
        file,
        line,
    }
}

#[wasm_bindgen]
pub fn decode_pprof_to_json(bytes: &[u8]) -> Option<String> {
    if bytes.is_empty() {
        return None;
    }

    let profile = ProtoProfile::decode(bytes).ok()?;
    if profile.sample_type.is_empty() {
        return None;
    }

    let sample_type_index = get_sample_type_index(&profile);
    let decoded_sample_type = profile.sample_type.get(sample_type_index)?;
    let sample_type = DecodedSampleType {
        sample_type: string_value(&profile.string_table, decoded_sample_type.type_index)
            .unwrap_or_else(|| "samples".to_string()),
        unit: string_value(&profile.string_table, decoded_sample_type.unit)
            .unwrap_or_else(|| "count".to_string()),
    };

    let mut frames_by_function_id = std::collections::HashMap::new();
    for function in &profile.function {
        if function.id != 0 {
            frames_by_function_id.insert(function.id, frame_for_function(function, &profile.string_table));
        }
    }

    let mut frame_by_location_id = std::collections::HashMap::new();
    for location in &profile.location {
        let Some(last_line) = location.line.last() else {
            continue;
        };
        if last_line.function_id == 0 {
            continue;
        }
        let Some(mut frame) = frames_by_function_id.get(&last_line.function_id).cloned() else {
            continue;
        };
        if last_line.line > 0 {
            frame.line = Some(last_line.line);
            frame.key = format!(
                "{}:{}:{}",
                frame.name,
                frame.file.as_deref().unwrap_or("null"),
                last_line.line
            );
        }
        frame_by_location_id.insert(location.id, frame);
    }

    let mut samples = Vec::with_capacity(profile.sample.len());
    for sample in &profile.sample {
        let value = *sample.value.get(sample_type_index)?;
        let mut frames: Vec<DecodedFrame> = sample
            .location_id
            .iter()
            .filter_map(|location_id| frame_by_location_id.get(location_id).cloned())
            .collect();
        frames.reverse();
        samples.push(DecodedSample { frames, value });
    }

    serde_json::to_string(&DecodedProfile { sample_type, samples }).ok()
}
