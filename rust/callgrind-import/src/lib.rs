use serde::Serialize;
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[derive(Serialize)]
struct ParsedCallgrindData {
    #[serde(rename = "fieldNames")]
    field_names: Vec<String>,
    operations: Vec<ParsedCallgrindOperation>,
}

#[derive(Serialize)]
#[serde(tag = "kind")]
enum ParsedCallgrindOperation {
    #[serde(rename = "self")]
    SelfWeight {
        file: Option<String>,
        name: Option<String>,
        weights: Vec<i64>,
    },
    #[serde(rename = "child")]
    ChildWeight {
        #[serde(rename = "parentFile")]
        parent_file: Option<String>,
        #[serde(rename = "parentName")]
        parent_name: Option<String>,
        #[serde(rename = "childFile")]
        child_file: Option<String>,
        #[serde(rename = "childName")]
        child_name: Option<String>,
        weights: Vec<i64>,
    },
}

struct CallgrindParser<'a> {
    lines: Vec<&'a str>,
    line_num: usize,
    field_names: Option<Vec<String>>,
    events_line: Option<String>,
    operations: Vec<ParsedCallgrindOperation>,
    filename: Option<String>,
    function_name: Option<String>,
    callee_filename: Option<String>,
    callee_function_name: Option<String>,
    saved_file_names: HashMap<String, String>,
    saved_function_names: HashMap<String, String>,
    prev_cost_line_numbers: Vec<i64>,
}

impl<'a> CallgrindParser<'a> {
    fn new(contents: &'a str) -> Self {
        Self {
            lines: contents.split('\n').collect(),
            line_num: 0,
            field_names: None,
            events_line: None,
            operations: Vec::new(),
            filename: None,
            function_name: None,
            callee_filename: None,
            callee_function_name: None,
            saved_file_names: HashMap::new(),
            saved_function_names: HashMap::new(),
            prev_cost_line_numbers: Vec::new(),
        }
    }

    fn parse(mut self) -> Result<Option<ParsedCallgrindData>, String> {
        while self.line_num < self.lines.len() {
            let raw_line = self.lines[self.line_num];
            self.line_num += 1;
            let line = raw_line.trim_end_matches('\r');

            if line.trim_start().starts_with('#') {
                continue;
            }

            if line.trim().is_empty() {
                continue;
            }

            if self.parse_header_line(line)? {
                continue;
            }

            if self.parse_assignment_line(line)? {
                continue;
            }

            if self.parse_cost_line(line, CostType::SelfWeight)? {
                continue;
            }

            return Err(format!(
                "Unrecognized line \"{}\" on line {}",
                line, self.line_num
            ));
        }

        Ok(self.field_names.map(|field_names| ParsedCallgrindData {
            field_names,
            operations: self.operations,
        }))
    }

    fn parse_header_line(&mut self, line: &str) -> Result<bool, String> {
        let trimmed = line.trim_start();
        let Some(colon_index) = trimmed.find(':') else {
            return Ok(false);
        };

        let key = &trimmed[..colon_index];
        if key.is_empty() || !key.chars().all(|ch| ch == '_' || ch.is_ascii_alphanumeric()) {
            return Ok(false);
        }

        if key != "events" {
            return Ok(true);
        }

        let value = trimmed[colon_index + 1..].trim();
        if self.field_names.is_some() {
            return Err(format!(
                "Duplicate \"events: \" lines specified. First was \"{}\", now received \"{}\" on {}.",
                self.events_line.as_deref().unwrap_or(""),
                line,
                self.line_num
            ));
        }

        self.events_line = Some(line.to_string());
        self.field_names = Some(
            value
                .split(' ')
                .filter(|field| !field.is_empty())
                .map(|field| field.to_string())
                .collect(),
        );
        Ok(true)
    }

    fn parse_assignment_line(&mut self, line: &str) -> Result<bool, String> {
        let Some(equals_index) = line.find('=') else {
            return Ok(false);
        };

        let key = &line[..equals_index];
        if key.is_empty() || !key.chars().all(|ch| ch == '_' || ch.is_ascii_alphanumeric()) {
            return Ok(false);
        }

        let value = line[equals_index + 1..].trim_start();
        match key {
            "fe" | "fi" => {
                parse_name_with_compression(
                    value,
                    &mut self.saved_file_names,
                    self.line_num,
                )?;
            }
            "fl" => {
                self.filename = Some(parse_name_with_compression(
                    value,
                    &mut self.saved_file_names,
                    self.line_num,
                )?);
            }
            "fn" => {
                self.function_name = Some(parse_name_with_compression(
                    value,
                    &mut self.saved_function_names,
                    self.line_num,
                )?);
            }
            "cfi" | "cfl" => {
                self.callee_filename = Some(parse_name_with_compression(
                    value,
                    &mut self.saved_file_names,
                    self.line_num,
                )?);
            }
            "cfn" => {
                self.callee_function_name = Some(parse_name_with_compression(
                    value,
                    &mut self.saved_function_names,
                    self.line_num,
                )?);
            }
            "calls" => {
                if self.line_num >= self.lines.len() {
                    return Err(format!(
                        "Encountered a \"calls=\" line on line {} without a following child cost line.",
                        self.line_num
                    ));
                }

                let child_line = self.lines[self.line_num].trim_end_matches('\r');
                self.line_num += 1;
                self.parse_cost_line(child_line, CostType::ChildWeight)?;
                self.callee_filename = None;
                self.callee_function_name = None;
            }
            "cob" | "ob" => {}
            _ => {}
        }

        Ok(true)
    }

    fn parse_cost_line(&mut self, line: &str, cost_type: CostType) -> Result<bool, String> {
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.is_empty() {
            return Ok(false);
        }

        let mut nums = Vec::with_capacity(parts.len());
        for (index, part) in parts.iter().enumerate() {
            if *part == "*" || part.starts_with('+') || part.starts_with('-') {
                if *part == "*" {
                    let Some(previous_value) = self.prev_cost_line_numbers.get(index) else {
                        return Err(format!(
                            "Line {} has a subposition on column {} but previous cost line has only {} columns. Line contents: {}",
                            self.line_num,
                            index,
                            self.prev_cost_line_numbers.len(),
                            line
                        ));
                    };
                    nums.push(*previous_value);
                    continue;
                }

                let Some(previous_value) = self.prev_cost_line_numbers.get(index) else {
                    return Err(format!(
                        "Line {} has a subposition on column {} but previous cost line has only {} columns. Line contents: {}",
                        self.line_num,
                        index,
                        self.prev_cost_line_numbers.len(),
                        line
                    ));
                };

                let offset = part.parse::<i64>().map_err(|_| {
                    format!(
                        "Line {} has a subposition on column {} but the offset is not a number. Line contents: {}",
                        self.line_num, index, line
                    )
                })?;
                nums.push(previous_value + offset);
                continue;
            }

            let Ok(as_num) = part.parse::<i64>() else {
                return Ok(false);
            };
            nums.push(as_num);
        }

        if nums.is_empty() {
            return Ok(false);
        }

        let Some(field_names) = self.field_names.as_ref() else {
            return Err(format!(
                "Encountered a cost line on line {} before event specification was provided.",
                self.line_num
            ));
        };

        let num_position_fields = 1usize;
        if nums.len() < num_position_fields + field_names.len() {
            return Err(format!(
                "Encountered a cost line on line {} with {} cost fields, but expected at least {}. Line contents: {}",
                self.line_num,
                nums.len().saturating_sub(num_position_fields),
                field_names.len(),
                line
            ));
        }

        let weights = nums[num_position_fields..num_position_fields + field_names.len()].to_vec();
        match cost_type {
            CostType::SelfWeight => {
                self.operations.push(ParsedCallgrindOperation::SelfWeight {
                    file: normalize_optional(self.filename.as_deref()),
                    name: normalize_optional(self.function_name.as_deref()),
                    weights,
                });
            }
            CostType::ChildWeight => {
                self.operations.push(ParsedCallgrindOperation::ChildWeight {
                    parent_file: normalize_optional(self.filename.as_deref()),
                    parent_name: normalize_optional(self.function_name.as_deref()),
                    child_file: normalize_optional(self.callee_filename.as_deref())
                        .or_else(|| normalize_optional(self.filename.as_deref())),
                    child_name: normalize_optional(self.callee_function_name.as_deref()),
                    weights,
                });
            }
        }

        self.prev_cost_line_numbers = nums;
        Ok(true)
    }
}

fn parse_name_with_compression(
    name: &str,
    saved: &mut HashMap<String, String>,
    line_num: usize,
) -> Result<String, String> {
    if let Some(rest) = name.strip_prefix('(') {
        if let Some(close_paren) = rest.find(')') {
            let id = &rest[..close_paren];
            let remainder = &rest[close_paren + 1..];
            if !id.is_empty() && id.chars().all(|ch| ch.is_ascii_digit()) {
                let trimmed_remainder = remainder.trim_start();
                if !trimmed_remainder.is_empty() {
                    if let Some(original) = saved.get(id) {
                        return Err(format!(
                            "Redefinition of name with id: {}. Original value was \"{}\". Tried to redefine as \"{}\" on line {}.",
                            id, original, trimmed_remainder, line_num
                        ));
                    }
                    saved.insert(id.to_string(), trimmed_remainder.to_string());
                    return Ok(trimmed_remainder.to_string());
                }

                if let Some(existing) = saved.get(id) {
                    return Ok(existing.clone());
                }

                return Err(format!(
                    "Tried to use name with id {} on line {} before it was defined.",
                    id, line_num
                ));
            }
        }
    }

    Ok(name.to_string())
}

#[derive(Clone, Copy)]
enum CostType {
    SelfWeight,
    ChildWeight,
}

fn normalize_optional(value: Option<&str>) -> Option<String> {
    match value {
        Some(value) if !value.is_empty() => Some(value.to_string()),
        _ => None,
    }
}

#[wasm_bindgen]
pub fn parse_callgrind_json(bytes: &[u8]) -> Result<String, JsValue> {
    let contents = std::str::from_utf8(bytes)
        .map_err(|error| JsValue::from_str(&format!("Callgrind input was not valid UTF-8: {}", error)))?;
    let parsed = CallgrindParser::new(contents)
        .parse()
        .map_err(|error| JsValue::from_str(&error))?;
    serde_json::to_string(&parsed).map_err(|error| JsValue::from_str(&error.to_string()))
}
