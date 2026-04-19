use regex::Regex;
use serde::Serialize;
use std::sync::OnceLock;
use wasm_bindgen::prelude::*;

#[derive(Serialize, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PerfStackFrame {
    address: String,
    symbol_name: String,
    file: String,
}

#[derive(Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PerfEvent {
    command: Option<String>,
    process_id: Option<u32>,
    thread_id: Option<u32>,
    time: Option<f64>,
    event_type: String,
    stack: Vec<PerfStackFrame>,
}

fn event_start_re() -> &'static Regex {
    static EVENT_START_RE: OnceLock<Regex> = OnceLock::new();
    EVENT_START_RE.get_or_init(|| Regex::new(r"^(\S.+?)\s+(\d+)(?:/?(\d+))?\s+").unwrap())
}

fn time_re() -> &'static Regex {
    static TIME_RE: OnceLock<Regex> = OnceLock::new();
    TIME_RE.get_or_init(|| Regex::new(r"\s+(\d+\.\d+):\s+").unwrap())
}

fn event_name_re() -> &'static Regex {
    static EVENT_NAME_RE: OnceLock<Regex> = OnceLock::new();
    EVENT_NAME_RE.get_or_init(|| Regex::new(r"(\S+):\s*$").unwrap())
}

fn frame_re() -> &'static Regex {
    static FRAME_RE: OnceLock<Regex> = OnceLock::new();
    FRAME_RE.get_or_init(|| Regex::new(r"^\s*(\w+)\s*(.+) \((\S*)\)").unwrap())
}

fn symbol_offset_re() -> &'static Regex {
    static SYMBOL_OFFSET_RE: OnceLock<Regex> = OnceLock::new();
    SYMBOL_OFFSET_RE.get_or_init(|| Regex::new(r"\+0x[\da-f]+$").unwrap())
}

fn parse_event(lines: &[&str]) -> Option<PerfEvent> {
    let filtered: Vec<&str> = lines
        .iter()
        .copied()
        .filter(|line| !line.trim_start().starts_with('#'))
        .collect();
    let first_line = *filtered.first()?;

    let event_start = event_start_re().captures(first_line)?;
    let command = event_start.get(1).map(|m| m.as_str().to_string());
    let id_a = event_start.get(2).and_then(|m| m.as_str().parse::<u32>().ok());
    let id_b = event_start.get(3).and_then(|m| m.as_str().parse::<u32>().ok());

    let (process_id, thread_id) = if let Some(thread_id) = id_b {
        (id_a, Some(thread_id))
    } else {
        (None, id_a)
    };

    let time = time_re()
        .captures(first_line)
        .and_then(|captures| captures.get(1))
        .and_then(|m| m.as_str().parse::<f64>().ok());

    let event_type = event_name_re()
        .captures(first_line)
        .and_then(|captures| captures.get(1))
        .map(|m| m.as_str().to_string())
        .unwrap_or_default();

    let mut stack = Vec::new();
    for line in filtered.iter().skip(1) {
        let Some(captures) = frame_re().captures(line) else {
            continue;
        };
        let address = captures.get(1)?.as_str();
        let symbol_name = captures.get(2)?.as_str();
        let file = captures.get(3)?.as_str();
        let symbol_name = symbol_offset_re().replace(symbol_name, "").into_owned();
        stack.push(PerfStackFrame {
            address: format!("0x{address}"),
            symbol_name,
            file: file.to_string(),
        });
    }
    stack.reverse();

    Some(PerfEvent {
        command,
        process_id,
        thread_id,
        time,
        event_type,
        stack,
    })
}

fn parse_events_impl(contents: &str) -> Vec<PerfEvent> {
    let mut events = Vec::new();
    let mut current_lines = Vec::new();

    for line in contents.split('\n') {
        if line.is_empty() {
            if let Some(event) = parse_event(&current_lines) {
                events.push(event);
            }
            current_lines.clear();
        } else {
            current_lines.push(line);
        }
    }

    if let Some(event) = parse_event(&current_lines) {
        events.push(event);
    }

    events
}

fn parse_events_from_bytes(bytes: &[u8]) -> Vec<PerfEvent> {
    parse_events_impl(&String::from_utf8_lossy(bytes))
}

#[wasm_bindgen]
pub fn parse_linux_perf_json(contents: &str) -> String {
    serde_json::to_string(&parse_events_impl(contents)).unwrap_or_else(|_| "[]".to_string())
}

#[wasm_bindgen]
pub fn parse_linux_perf_js(contents: &str) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&parse_events_impl(contents))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[wasm_bindgen]
pub fn parse_linux_perf_bytes_js(bytes: &[u8]) -> Result<JsValue, JsValue> {
    serde_wasm_bindgen::to_value(&parse_events_from_bytes(bytes))
        .map_err(|error| JsValue::from_str(&error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::parse_events_impl;

    #[test]
    fn parses_simple_perf_output() {
        let input = "simple-terminat    10 198792.736893:    1001001 cpu-clock:\n\
\t             643 _Z4betav (/workdir/simple-terminates)\n\
\t             695 _Z5deltav (/workdir/simple-terminates)\n\
\t             6f3 main (/workdir/simple-terminates)\n\
\t           21b97 __libc_start_main (/lib/x86_64-linux-gnu/libc-2.27.so)\n\
\t 6ce258d4c544155 [unknown] ([unknown])";

        let parsed = parse_events_impl(input);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].command.as_deref(), Some("simple-terminat"));
        assert_eq!(parsed[0].thread_id, Some(10));
        assert_eq!(parsed[0].process_id, None);
        assert_eq!(parsed[0].event_type, "cpu-clock");
        assert_eq!(parsed[0].stack.first().unwrap().symbol_name, "[unknown]");
        assert_eq!(parsed[0].stack.last().unwrap().symbol_name, "_Z4betav");
    }

    #[test]
    fn parses_pid_tid_and_ignores_header_comments() {
        let input = "# ========\n\
# header\n\
simple-terminat     9/9     198791.127353: cpu-clock: \n\
\t             643 _Z4betav (/workdir/simple-terminates)\n\
\t             695 _Z5deltav+0x800047c022ec ([kernel.kallsyms])\n";

        let parsed = parse_events_impl(input);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].process_id, Some(9));
        assert_eq!(parsed[0].thread_id, Some(9));
        assert_eq!(parsed[0].stack[0].symbol_name, "_Z5deltav");
    }
}
