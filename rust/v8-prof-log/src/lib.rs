use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::LazyLock;
use wasm_bindgen::prelude::*;

static CPP_NAME_REGEX: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[tT] ([^(<]*)").expect("valid CPP regex"));
static JS_NAME_REGEX: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"([a-zA-Z0-9\._\-$]*) ([a-zA-Z0-9\.\-_/$]*):(\d+):(\d+)")
        .expect("valid JS regex")
});

#[derive(Deserialize)]
struct Code {
    name: String,
    #[serde(rename = "type")]
    code_type: Option<String>,
    kind: Option<String>,
}

#[derive(Deserialize)]
struct Tick {
    tm: i64,
    s: Vec<i64>,
}

#[derive(Deserialize)]
struct V8LogProfile {
    code: Vec<Code>,
    ticks: Vec<Tick>,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq, Serialize)]
#[serde(untagged)]
enum FrameKey {
    String(String),
    Number(i64),
}

#[derive(Clone, Debug, Hash, PartialEq, Eq, Serialize)]
struct ExportedFrame {
    key: FrameKey,
    name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    line: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    col: Option<i64>,
}

#[derive(Serialize)]
struct ExportedSample {
    frames: Vec<usize>,
    weight: i64,
}

#[derive(Serialize)]
struct ExportedProfile {
    frames: Vec<ExportedFrame>,
    samples: Vec<ExportedSample>,
}

fn basename(path: &str) -> &str {
    path.rsplit('/').next().unwrap_or(path)
}

fn code_to_frame_info(code: Option<&Code>) -> ExportedFrame {
    let Some(code) = code else {
        return ExportedFrame {
            key: FrameKey::String("(unknown type)".to_string()),
            name: "(unknown type)".to_string(),
            file: None,
            line: None,
            col: None,
        };
    };

    let Some(code_type) = &code.code_type else {
        return ExportedFrame {
            key: FrameKey::String("(unknown type)".to_string()),
            name: "(unknown type)".to_string(),
            file: None,
            line: None,
            col: None,
        };
    };

    let mut name = code.name.clone();

    match code_type.as_str() {
        "CPP" => {
            if let Some(matches) = CPP_NAME_REGEX.captures(&name) {
                if let Some(cpp_name) = matches.get(1) {
                    name = format!("(c++) {}", cpp_name.as_str());
                }
            }
        }
        "SHARED_LIB" => {
            name = format!("(LIB) {}", name);
        }
        "JS" => {
            if let Some(matches) = JS_NAME_REGEX.captures(&name) {
                let file = matches
                    .get(2)
                    .map(|capture| capture.as_str().to_string())
                    .unwrap_or_default();
                let line = matches
                    .get(3)
                    .and_then(|capture| capture.as_str().parse::<i64>().ok())
                    .unwrap_or(0);
                let col = matches
                    .get(4)
                    .and_then(|capture| capture.as_str().parse::<i64>().ok())
                    .unwrap_or(0);
                let function_name = matches
                    .get(1)
                    .map(|capture| capture.as_str())
                    .filter(|function_name| !function_name.is_empty())
                    .map(str::to_string)
                    .unwrap_or_else(|| {
                        if !file.is_empty() {
                            format!("(anonymous {}:{})", basename(&file), line)
                        } else {
                            "(anonymous)".to_string()
                        }
                    });
                return ExportedFrame {
                    key: FrameKey::String(name),
                    name: function_name,
                    file: Some(if file.is_empty() {
                        "(unknown file)".to_string()
                    } else {
                        file
                    }),
                    line: Some(line),
                    col: Some(col),
                };
            }
        }
        "CODE" => {
            if let Some(kind) = &code.kind {
                name = match kind.as_str() {
                    "LoadIC"
                    | "StoreIC"
                    | "KeyedStoreIC"
                    | "KeyedLoadIC"
                    | "LoadGlobalIC"
                    | "Handler" => format!("(IC) {}", name),
                    "BytecodeHandler" => format!("(bytecode) ~{}", name),
                    "Stub" => format!("(stub) {}", name),
                    "Builtin" => format!("(builtin) {}", name),
                    "RegExp" => format!("(regexp) {}", name),
                    _ => name,
                };
            }
        }
        _ => {
            name = format!("({}) {}", code_type, name);
        }
    }

    ExportedFrame {
        key: FrameKey::String(name.clone()),
        name,
        file: None,
        line: None,
        col: None,
    }
}

fn frame_index_for(
    frame: ExportedFrame,
    frames: &mut Vec<ExportedFrame>,
    frame_indexes: &mut HashMap<ExportedFrame, usize>,
) -> usize {
    if let Some(index) = frame_indexes.get(&frame) {
        return *index;
    }

    let index = frames.len();
    frame_indexes.insert(frame.clone(), index);
    frames.push(frame);
    index
}

fn import_v8_prof_log(input: &[u8]) -> Result<ExportedProfile, String> {
    let mut parsed: V8LogProfile =
        serde_json::from_slice(input).map_err(|error| format!("Failed to parse v8 log JSON: {error}"))?;
    parsed.ticks.sort_by_key(|tick| tick.tm);

    let mut frames: Vec<ExportedFrame> = Vec::new();
    let mut frame_indexes: HashMap<ExportedFrame, usize> = HashMap::new();
    let mut code_indexes: HashMap<i64, usize> = HashMap::new();
    let mut samples: Vec<ExportedSample> = Vec::with_capacity(parsed.ticks.len());
    let mut last_tm = 0i64;

    for tick in parsed.ticks {
        let mut stack: Vec<usize> = Vec::new();
        let mut i = tick.s.len().saturating_sub(2);
        while i < tick.s.len() {
            let id = tick.s[i];
            if id != -1 {
                if let Ok(code_len) = i64::try_from(parsed.code.len()) {
                    if id > code_len {
                        let frame = ExportedFrame {
                            key: FrameKey::Number(id),
                            name: format!("0x{id:x}"),
                            file: None,
                            line: None,
                            col: None,
                        };
                        stack.push(frame_index_for(frame, &mut frames, &mut frame_indexes));
                    } else {
                        let index = if let Some(existing) = code_indexes.get(&id) {
                            *existing
                        } else {
                            let frame = if let Ok(code_index) = usize::try_from(id) {
                                code_to_frame_info(parsed.code.get(code_index))
                            } else {
                                code_to_frame_info(None)
                            };
                            let frame_index = frame_index_for(frame, &mut frames, &mut frame_indexes);
                            code_indexes.insert(id, frame_index);
                            frame_index
                        };
                        stack.push(index);
                    }
                }
            }

            if i < 2 {
                break;
            }
            i -= 2;
        }

        samples.push(ExportedSample {
            frames: stack,
            weight: tick.tm - last_tm,
        });
        last_tm = tick.tm;
    }

    Ok(ExportedProfile { frames, samples })
}

#[wasm_bindgen]
pub fn import_v8_prof_log_json(input: &[u8]) -> Result<String, JsValue> {
    let profile = import_v8_prof_log(input).map_err(|error| JsValue::from_str(&error))?;
    serde_json::to_string(&profile)
        .map_err(|error| JsValue::from_str(&format!("Failed to serialize imported v8 log: {error}")))
}

#[cfg(test)]
mod tests {
    use super::import_v8_prof_log;

    #[test]
    fn imports_representative_v8_log_shapes() {
        let fixture = br#"{
          "code": [
            {"name":"outer /tmp/demo.js:10:4","type":"JS"},
            {"name":"inner /tmp/demo.js:20:8","type":"JS"},
            {"name":"T Foo::Bar(int)","type":"CPP"},
            {"name":"LoadICStub","type":"CODE","kind":"LoadIC"}
          ],
          "functions": [],
          "ticks": [
            {"tm": 10, "vm": 0, "s": [2, -1, 0, -1]},
            {"tm": 5, "vm": 0, "s": [1, -1, 0, -1]},
            {"tm": 12, "vm": 0, "s": [99, -1, 0, -1]},
            {"tm": 7, "vm": 0, "s": [3, -1, 0, -1]},
            {"tm": 15, "vm": 0, "s": [4, -1, 0, -1]}
          ]
        }"#;

        let imported = import_v8_prof_log(fixture).expect("fixture should import");

        assert_eq!(imported.samples.len(), 5);
        assert_eq!(imported.samples[0].weight, 5);
        assert_eq!(imported.samples[1].weight, 2);

        let frame_names: Vec<&str> = imported.frames.iter().map(|frame| frame.name.as_str()).collect();
        assert!(frame_names.contains(&"outer"));
        assert!(frame_names.contains(&"inner"));
        assert!(frame_names.contains(&"(c++) Foo::Bar"));
        assert!(frame_names.contains(&"(IC) LoadICStub"));
        assert!(frame_names.contains(&"0x63"));
        assert!(frame_names.contains(&"(unknown type)"));
    }
}
