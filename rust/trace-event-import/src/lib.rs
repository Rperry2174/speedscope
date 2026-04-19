use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::collections::{BTreeMap, VecDeque};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
struct ImportRequest {
    events: Vec<ImportableEvent>,
}

#[derive(Clone, Deserialize)]
struct ImportableEvent {
    pid: i32,
    tid: i32,
    ph: String,
    ts: f64,
    name: Option<String>,
    args_json: Option<String>,
    dur: Option<f64>,
    tdur: Option<f64>,
    ordinal: usize,
}

#[derive(Clone)]
struct QueuedEvent {
    ts: f64,
    ordinal: usize,
    name: Option<String>,
    frame_key: String,
}

#[derive(Clone, Serialize)]
struct FrameDescriptor {
    key: String,
    name: String,
}

#[derive(Serialize)]
struct ImportResponse {
    profiles: Vec<ThreadProfile>,
}

#[derive(Serialize)]
struct ThreadProfile {
    pid: i32,
    tid: i32,
    ops: Vec<ReplayOp>,
}

#[derive(Serialize)]
#[serde(tag = "kind")]
enum ReplayOp {
    #[serde(rename = "enter")]
    Enter { ts: f64, frame: FrameDescriptor },
    #[serde(rename = "leave")]
    Leave { ts: f64, frame: FrameDescriptor },
    #[serde(rename = "warn-unmatched-end")]
    WarnUnmatchedEnd { ts: f64, key: String },
    #[serde(rename = "warn-mismatched-name")]
    WarnMismatchedName {
        ts: f64,
        expected_key: String,
        actual_key: String,
    },
    #[serde(rename = "warn-mismatched-key")]
    WarnMismatchedKey {
        ts: f64,
        expected_key: String,
        actual_key: String,
        ended_key: String,
    },
    #[serde(rename = "warn-auto-close")]
    WarnAutoClose { key: String },
}

fn duration_for(event: &ImportableEvent) -> f64 {
    event.dur.or(event.tdur).unwrap_or(0.0)
}

fn event_name(event: &ImportableEvent) -> String {
    event.name
        .clone()
        .unwrap_or_else(|| "(unnamed)".to_string())
}

fn frame_key_for(event: &ImportableEvent) -> String {
    match &event.args_json {
        Some(args) => format!("{} {}", event_name(event), args),
        None => event_name(event),
    }
}

fn frame_descriptor(event: &QueuedEvent) -> FrameDescriptor {
    FrameDescriptor {
        key: event.frame_key.clone(),
        name: event
            .name
            .clone()
            .unwrap_or_else(|| "(unnamed)".to_string()),
    }
}

fn compare_timestamp_then_ordinal(a_ts: f64, a_ordinal: usize, b_ts: f64, b_ordinal: usize) -> Ordering {
    a_ts.partial_cmp(&b_ts)
        .unwrap_or(Ordering::Equal)
        .then_with(|| a_ordinal.cmp(&b_ordinal))
}

fn compare_x_events(a: &ImportableEvent, b: &ImportableEvent, first_ts: f64) -> Ordering {
    let a_ts = a.ts - first_ts;
    let b_ts = b.ts - first_ts;
    a_ts.partial_cmp(&b_ts)
        .unwrap_or(Ordering::Equal)
        .then_with(|| {
            duration_for(b)
                .partial_cmp(&duration_for(a))
                .unwrap_or(Ordering::Equal)
        })
        .then_with(|| a.ordinal.cmp(&b.ordinal))
}

fn select_queue_to_take_from_next(
    begin_queue: &VecDeque<QueuedEvent>,
    end_queue: &VecDeque<QueuedEvent>,
) -> &'static str {
    if begin_queue.is_empty() && end_queue.is_empty() {
        panic!("both queues cannot be empty");
    }
    if end_queue.is_empty() {
        return "B";
    }
    if begin_queue.is_empty() {
        return "E";
    }

    let b_front = begin_queue.front().unwrap();
    let e_front = end_queue.front().unwrap();

    if b_front.ts < e_front.ts {
        return "B";
    }
    if e_front.ts < b_front.ts {
        return "E";
    }

    if b_front.frame_key == e_front.frame_key {
        "B"
    } else {
        "E"
    }
}

fn process_thread(pid: i32, tid: i32, events: &[ImportableEvent]) -> ThreadProfile {
    let first_ts = events.iter().map(|event| event.ts).fold(f64::INFINITY, f64::min);
    let first_ts = if first_ts.is_finite() { first_ts } else { 0.0 };

    let mut begin_events: Vec<QueuedEvent> = Vec::new();
    let mut end_events: Vec<QueuedEvent> = Vec::new();
    let mut x_events: Vec<ImportableEvent> = Vec::new();

    for event in events {
        match event.ph.as_str() {
            "B" => begin_events.push(QueuedEvent {
                ts: event.ts - first_ts,
                ordinal: begin_events.len(),
                name: event.name.clone(),
                frame_key: frame_key_for(event),
            }),
            "E" => end_events.push(QueuedEvent {
                ts: event.ts - first_ts,
                ordinal: end_events.len(),
                name: event.name.clone(),
                frame_key: frame_key_for(event),
            }),
            "X" => x_events.push(event.clone()),
            _ => {}
        }
    }

    x_events.sort_by(|a, b| compare_x_events(a, b, first_ts));
    for x_event in x_events {
        let rebased_ts = x_event.ts - first_ts;
        let end_ts = rebased_ts + duration_for(&x_event);
        let frame_key = frame_key_for(&x_event);
        begin_events.push(QueuedEvent {
            ts: rebased_ts,
            ordinal: begin_events.len(),
            name: x_event.name.clone(),
            frame_key: frame_key.clone(),
        });
        end_events.push(QueuedEvent {
            ts: end_ts,
            ordinal: end_events.len(),
            name: x_event.name,
            frame_key,
        });
    }

    begin_events.sort_by(|a, b| compare_timestamp_then_ordinal(a.ts, a.ordinal, b.ts, b.ordinal));
    end_events.sort_by(|a, b| compare_timestamp_then_ordinal(a.ts, a.ordinal, b.ts, b.ordinal));

    let mut begin_queue: VecDeque<QueuedEvent> = begin_events.into();
    let mut end_queue: VecDeque<QueuedEvent> = end_events.into();
    let mut frame_stack: Vec<QueuedEvent> = Vec::new();
    let mut ops: Vec<ReplayOp> = Vec::new();
    let mut last_value = 0.0;

    while !begin_queue.is_empty() || !end_queue.is_empty() {
        match select_queue_to_take_from_next(&begin_queue, &end_queue) {
            "B" => {
                let begin = begin_queue.pop_front().unwrap();
                last_value = begin.ts;
                ops.push(ReplayOp::Enter {
                    ts: begin.ts,
                    frame: frame_descriptor(&begin),
                });
                frame_stack.push(begin);
            }
            "E" => {
                if let Some(stack_top) = frame_stack.last() {
                    let target_ts = end_queue.front().unwrap().ts;
                    let mut swap_index: Option<usize> = None;

                    for index in 1..end_queue.len() {
                        let end_event = &end_queue[index];
                        if end_event.ts > target_ts {
                            break;
                        }
                        if end_event.frame_key == stack_top.frame_key {
                            swap_index = Some(index);
                            break;
                        }
                    }

                    if swap_index.is_none() {
                        for index in 1..end_queue.len() {
                            let end_event = &end_queue[index];
                            if end_event.ts > target_ts {
                                break;
                            }
                            if end_event.name == stack_top.name {
                                swap_index = Some(index);
                                break;
                            }
                        }
                    }

                    if let Some(index) = swap_index {
                        end_queue.swap(0, index);
                    }
                }

                let end_event = end_queue.pop_front().unwrap();
                let maybe_begin = frame_stack.last().cloned();
                if maybe_begin.is_none() {
                    ops.push(ReplayOp::WarnUnmatchedEnd {
                        ts: end_event.ts,
                        key: end_event.frame_key,
                    });
                    continue;
                }

                let begin_event = maybe_begin.unwrap();
                if end_event.name != begin_event.name {
                    ops.push(ReplayOp::WarnMismatchedName {
                        ts: end_event.ts,
                        expected_key: end_event.frame_key,
                        actual_key: begin_event.frame_key,
                    });
                    continue;
                }

                let begin_event = frame_stack.pop().unwrap();
                if end_event.frame_key != begin_event.frame_key {
                    ops.push(ReplayOp::WarnMismatchedKey {
                        ts: end_event.ts,
                        expected_key: end_event.frame_key,
                        actual_key: begin_event.frame_key.clone(),
                        ended_key: begin_event.frame_key.clone(),
                    });
                }
                last_value = end_event.ts;
                ops.push(ReplayOp::Leave {
                    ts: end_event.ts,
                    frame: frame_descriptor(&begin_event),
                });
            }
            _ => unreachable!(),
        }
    }

    for frame in frame_stack.iter().rev() {
        ops.push(ReplayOp::WarnAutoClose {
            key: frame.frame_key.clone(),
        });
        ops.push(ReplayOp::Leave {
            ts: last_value,
            frame: frame_descriptor(frame),
        });
    }

    ThreadProfile { pid, tid, ops }
}

#[wasm_bindgen]
pub fn import_trace_events_json(json: &str) -> String {
    let request: ImportRequest = match serde_json::from_str(json) {
        Ok(parsed) => parsed,
        Err(_) => {
            return "{\"profiles\":[]}".to_string();
        }
    };

    let mut by_thread: BTreeMap<(i32, i32), Vec<ImportableEvent>> = BTreeMap::new();
    for event in request.events {
        if event.ph != "B" && event.ph != "E" && event.ph != "X" {
            continue;
        }
        by_thread.entry((event.pid, event.tid)).or_default().push(event);
    }

    let profiles = by_thread
        .into_iter()
        .map(|((pid, tid), events)| process_thread(pid, tid, &events))
        .collect::<Vec<_>>();

    serde_json::to_string(&ImportResponse { profiles })
        .unwrap_or_else(|_| "{\"profiles\":[]}".to_string())
}
