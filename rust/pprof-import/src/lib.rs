use wasm_bindgen::prelude::*;

mod proto {
    include!(concat!(env!("OUT_DIR"), "/perftools.profiles.rs"));
}

use prost::Message;
use serde::Serialize;

#[derive(Serialize)]
struct FrameInfoOut {
    key: String,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<i64>,
}

#[derive(Serialize)]
struct SampleOut {
    stack: Vec<usize>,
    weight: i64,
}

#[derive(Serialize)]
struct PprofResult {
    frames: Vec<FrameInfoOut>,
    samples: Vec<SampleOut>,
    sample_unit: Option<String>,
    sample_type: Option<String>,
}

fn get_sample_type_index(profile: &proto::Profile) -> usize {
    let sample_types = &profile.sample_type;
    let fallback = if sample_types.is_empty() {
        0
    } else {
        sample_types.len() - 1
    };

    let dflt = profile.default_sample_type;
    if dflt == 0 {
        return fallback;
    }

    sample_types
        .iter()
        .position(|e| e.r#type == dflt)
        .unwrap_or(fallback)
}

fn import_pprof(data: &[u8]) -> Option<PprofResult> {
    if data.is_empty() {
        return None;
    }

    let profile = proto::Profile::decode(data).ok()?;

    let string_table = &profile.string_table;

    let str_val = |idx: i64| -> Option<&str> {
        let i = idx as usize;
        if i < string_table.len() {
            let s = string_table[i].as_str();
            if s.is_empty() {
                None
            } else {
                Some(s)
            }
        } else {
            None
        }
    };

    let mut frame_by_function_id: std::collections::HashMap<u64, usize> =
        std::collections::HashMap::new();
    let mut frames: Vec<FrameInfoOut> = Vec::new();

    for f in &profile.function {
        if f.id == 0 {
            continue;
        }
        let name_string = str_val(f.name).unwrap_or("(unknown)").to_string();
        let file_string = str_val(f.filename).map(|s| s.to_string());
        let start_line = if f.start_line != 0 {
            Some(f.start_line)
        } else {
            None
        };

        let key = format!(
            "{}:{}:{}",
            name_string,
            file_string.as_deref().unwrap_or(""),
            start_line.unwrap_or(0)
        );

        let frame_idx = frames.len();
        frames.push(FrameInfoOut {
            key,
            name: name_string,
            file: file_string,
            line: start_line,
        });
        frame_by_function_id.insert(f.id, frame_idx);
    }

    let mut frame_by_location_id: std::collections::HashMap<u64, usize> =
        std::collections::HashMap::new();

    for loc in &profile.location {
        if loc.id == 0 {
            continue;
        }
        if let Some(last_line) = loc.line.last() {
            if last_line.function_id != 0 {
                if let Some(&func_frame_idx) = frame_by_function_id.get(&last_line.function_id) {
                    if last_line.line > 0 {
                        frames[func_frame_idx].line = Some(last_line.line);
                    }
                    frame_by_location_id.insert(loc.id, func_frame_idx);
                }
            }
        }
    }

    let sample_types: Vec<(String, String)> = profile
        .sample_type
        .iter()
        .map(|st| {
            let type_str = str_val(st.r#type)
                .unwrap_or("samples")
                .to_string();
            let unit_str = str_val(st.unit).unwrap_or("count").to_string();
            (type_str, unit_str)
        })
        .collect();

    let sample_type_index = get_sample_type_index(&profile);

    if sample_type_index >= sample_types.len() && !sample_types.is_empty() {
        return None;
    }

    let (sample_type_name, sample_unit) = if sample_types.is_empty() {
        (None, None)
    } else {
        let (ref t, ref u) = sample_types[sample_type_index];
        (Some(t.clone()), Some(u.clone()))
    };

    let mut samples: Vec<SampleOut> = Vec::new();

    for s in &profile.sample {
        let mut stack_indices: Vec<usize> = Vec::new();
        for &loc_id in &s.location_id {
            if let Some(&frame_idx) = frame_by_location_id.get(&loc_id) {
                stack_indices.push(frame_idx);
            }
        }
        stack_indices.reverse();

        if sample_types.is_empty() {
            return None;
        }

        if s.value.len() <= sample_type_index {
            return None;
        }

        let weight = s.value[sample_type_index];
        samples.push(SampleOut {
            stack: stack_indices,
            weight,
        });
    }

    Some(PprofResult {
        frames,
        samples,
        sample_unit,
        sample_type: sample_type_name,
    })
}

#[wasm_bindgen]
pub fn import_pprof_json(data: &[u8]) -> String {
    match import_pprof(data) {
        None => "null".to_string(),
        Some(result) => serde_json::to_string(&result).unwrap_or_else(|_| "null".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_data_returns_null() {
        assert_eq!(import_pprof_json(&[]), "null");
    }

    #[test]
    fn invalid_data_returns_null() {
        assert_eq!(import_pprof_json(&[0xFF, 0xFF, 0xFF]), "null");
    }
}
