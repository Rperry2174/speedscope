use serde::Serialize;
use wasm_bindgen::prelude::*;

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
