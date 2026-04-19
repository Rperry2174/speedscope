use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OldCpuProfileNode {
    function_name: String,
    line_number: i32,
    script_id: String,
    url: String,
    hit_count: u32,
    id: u32,
    children: Vec<OldCpuProfileNode>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct OldCpuProfile {
    start_time: f64,
    end_time: f64,
    head: OldCpuProfileNode,
    samples: Vec<u32>,
    timestamps: Vec<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CpuProfileCallFrame {
    column_number: u32,
    function_name: String,
    line_number: i32,
    script_id: String,
    url: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CpuProfileNode {
    id: u32,
    call_frame: CpuProfileCallFrame,
    hit_count: u32,
    children: Vec<u32>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CpuProfile {
    start_time: f64,
    end_time: f64,
    nodes: Vec<CpuProfileNode>,
    samples: Vec<u32>,
    time_deltas: Vec<f64>,
}

fn visit_tree(node: &OldCpuProfileNode, nodes: &mut Vec<CpuProfileNode>) {
    nodes.push(CpuProfileNode {
        id: node.id,
        call_frame: CpuProfileCallFrame {
            column_number: 0,
            function_name: node.function_name.clone(),
            line_number: node.line_number,
            script_id: node.script_id.clone(),
            url: node.url.clone(),
        },
        hit_count: node.hit_count,
        children: node.children.iter().map(|child| child.id).collect(),
    });

    for child in &node.children {
        visit_tree(child, nodes);
    }
}

fn tree_to_array(root: &OldCpuProfileNode) -> Vec<CpuProfileNode> {
    let mut nodes = Vec::new();
    visit_tree(root, &mut nodes);
    nodes
}

fn timestamps_to_deltas(timestamps: &[f64], start_time: f64) -> Vec<f64> {
    let mut deltas = Vec::with_capacity(timestamps.len());
    for (index, timestamp) in timestamps.iter().enumerate() {
        let previous_timestamp = if index == 0 {
            start_time * 1_000_000.0
        } else {
            timestamps[index - 1]
        };
        deltas.push(timestamp - previous_timestamp);
    }
    deltas
}

#[wasm_bindgen]
pub fn chrome_tree_to_nodes(profile: JsValue) -> Result<JsValue, JsValue> {
    let old_profile: OldCpuProfile =
        serde_wasm_bindgen::from_value(profile).map_err(|error| JsValue::from_str(&error.to_string()))?;

    let formatted = CpuProfile {
        start_time: old_profile.start_time * 1_000_000.0,
        end_time: old_profile.end_time * 1_000_000.0,
        nodes: tree_to_array(&old_profile.head),
        samples: old_profile.samples,
        time_deltas: timestamps_to_deltas(&old_profile.timestamps, old_profile.start_time),
    };

    serde_wasm_bindgen::to_value(&formatted).map_err(|error| JsValue::from_str(&error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{chrome_tree_to_nodes, JsValue};

    #[test]
    fn converts_old_v8_cpu_profile() {
        let input = serde_json::json!({
            "startTime": 10,
            "endTime": 15,
            "head": {
                "functionName": "(root)",
                "lineNumber": -1,
                "scriptId": "0",
                "url": "",
                "hitCount": 0,
                "id": 1,
                "children": [
                    {
                        "functionName": "work",
                        "lineNumber": 42,
                        "scriptId": "7",
                        "url": "app.js",
                        "hitCount": 2,
                        "id": 2,
                        "children": []
                    }
                ]
            },
            "samples": [1, 2],
            "timestamps": [10000005.0, 10000015.0]
        });

        let output = chrome_tree_to_nodes(serde_wasm_bindgen::to_value(&input).unwrap()).unwrap();
        let json = serde_wasm_bindgen::from_value::<serde_json::Value>(output).unwrap();

        assert_eq!(json["startTime"], 10_000_000.0);
        assert_eq!(json["endTime"], 15_000_000.0);
        assert_eq!(json["nodes"].as_array().unwrap().len(), 2);
        assert_eq!(json["nodes"][0]["children"][0], 2);
        assert_eq!(json["nodes"][1]["callFrame"]["functionName"], "work");
        assert_eq!(json["timeDeltas"][0], 5.0);
        assert_eq!(json["timeDeltas"][1], 10.0);
    }
}
