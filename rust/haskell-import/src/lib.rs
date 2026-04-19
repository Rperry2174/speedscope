use serde::{Deserialize, Serialize};
use std::alloc::{alloc, dealloc, Layout};
use std::mem::ManuallyDrop;
use std::ptr;

#[derive(Deserialize)]
struct CostCentre {
    id: u32,
    label: String,
    module: String,
    src_loc: String,
    #[allow(dead_code)]
    is_caf: bool,
}

#[derive(Deserialize)]
struct ProfileTree {
    id: u32,
    entries: f64,
    alloc: f64,
    ticks: f64,
    children: Vec<ProfileTree>,
}

#[derive(Deserialize)]
struct HaskellProfile {
    program: String,
    #[allow(dead_code)]
    arguments: Vec<String>,
    #[allow(dead_code)]
    rts_arguments: Vec<String>,
    #[allow(dead_code)]
    end_time: String,
    #[allow(dead_code)]
    initial_capabilities: f64,
    #[allow(dead_code)]
    total_time: f64,
    total_ticks: f64,
    #[allow(dead_code)]
    tick_interval: f64,
    #[allow(dead_code)]
    total_alloc: f64,
    cost_centres: Vec<CostCentre>,
    profile: ProfileTree,
}

#[derive(Serialize)]
struct FrameData {
    key: u32,
    name: String,
    file: Option<String>,
}

#[derive(Serialize)]
struct ProfileEvent {
    frame: u32,
    at: f64,
    open: bool,
}

#[derive(Serialize)]
struct ImportedHaskellProfile {
    program: String,
    total_ticks: f64,
    frames: Vec<FrameData>,
    time_events: Vec<ProfileEvent>,
    alloc_events: Vec<ProfileEvent>,
}

fn should_skip_node(tree: &ProfileTree) -> bool {
    tree.ticks == 0.0 && tree.entries == 0.0 && tree.alloc == 0.0 && tree.children.is_empty()
}

fn add_to_profile_events(
    tree: &ProfileTree,
    start_value: f64,
    events: &mut Vec<ProfileEvent>,
    attribute: fn(&ProfileTree) -> f64,
) -> f64 {
    if should_skip_node(tree) {
        return start_value;
    }

    let mut current_value = start_value;
    events.push(ProfileEvent {
        frame: tree.id,
        at: current_value,
        open: true,
    });

    for child in &tree.children {
        current_value = add_to_profile_events(child, current_value, events, attribute);
    }

    current_value += attribute(tree);
    events.push(ProfileEvent {
        frame: tree.id,
        at: current_value,
        open: false,
    });

    current_value
}

fn ticks_of(tree: &ProfileTree) -> f64 {
    tree.ticks
}

fn alloc_of(tree: &ProfileTree) -> f64 {
    tree.alloc
}

fn import_profile(input: HaskellProfile) -> ImportedHaskellProfile {
    let frames = input
        .cost_centres
        .into_iter()
        .map(|centre| FrameData {
            key: centre.id,
            name: format!("{}.{}", centre.module, centre.label),
            file: if centre.src_loc.starts_with('<') {
                None
            } else {
                Some(centre.src_loc)
            },
        })
        .collect();

    let mut time_events = Vec::new();
    add_to_profile_events(&input.profile, 0.0, &mut time_events, ticks_of);

    let mut alloc_events = Vec::new();
    add_to_profile_events(&input.profile, 0.0, &mut alloc_events, alloc_of);

    ImportedHaskellProfile {
        program: input.program,
        total_ticks: input.total_ticks,
        frames,
        time_events,
        alloc_events,
    }
}

#[no_mangle]
pub extern "C" fn alloc_buffer(size: usize) -> *mut u8 {
    if size == 0 {
        return ptr::null_mut();
    }
    unsafe { alloc(Layout::array::<u8>(size).unwrap()) }
}

#[no_mangle]
pub extern "C" fn free_buffer(ptr: *mut u8, size: usize) {
    if ptr.is_null() || size == 0 {
        return;
    }
    unsafe {
        dealloc(ptr, Layout::array::<u8>(size).unwrap());
    }
}

#[no_mangle]
pub extern "C" fn import_haskell_profile(ptr: *const u8, len: usize) -> *mut u8 {
    let result = import_haskell_profile_impl(ptr, len);
    string_into_raw(result)
}

fn import_haskell_profile_impl(ptr: *const u8, len: usize) -> String {
    let input = unsafe { std::slice::from_raw_parts(ptr, len) };
    match serde_json::from_slice::<HaskellProfile>(input) {
        Ok(parsed) => match serde_json::to_string(&import_profile(parsed)) {
            Ok(output) => output,
            Err(error) => format!("{{\"error\":{}}}", serde_json::to_string(&error.to_string()).unwrap()),
        },
        Err(error) => format!("{{\"error\":{}}}", serde_json::to_string(&error.to_string()).unwrap()),
    }
}

fn string_into_raw(s: String) -> *mut u8 {
    let mut bytes = s.into_bytes();
    bytes.push(0);
    let mut bytes = ManuallyDrop::new(bytes);
    bytes.as_mut_ptr()
}

#[no_mangle]
pub extern "C" fn free_c_string(ptr: *mut u8) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        let mut len = 0usize;
        while *ptr.add(len) != 0 {
            len += 1;
        }
        let _ = Vec::from_raw_parts(ptr, len + 1, len + 1);
    }
}

#[cfg(test)]
mod tests {
    use super::{import_profile, CostCentre, HaskellProfile, ProfileTree};

    #[test]
    fn skips_empty_leaf_nodes() {
        let imported = import_profile(HaskellProfile {
            program: "demo".to_owned(),
            arguments: Vec::new(),
            rts_arguments: Vec::new(),
            end_time: String::new(),
            initial_capabilities: 0.0,
            total_time: 0.0,
            total_ticks: 3.0,
            tick_interval: 1.0,
            total_alloc: 0.0,
            cost_centres: vec![
                CostCentre {
                    id: 1,
                    label: "root".to_owned(),
                    module: "Main".to_owned(),
                    src_loc: "src/Main.hs:1:1".to_owned(),
                    is_caf: false,
                },
                CostCentre {
                    id: 2,
                    label: "empty".to_owned(),
                    module: "Main".to_owned(),
                    src_loc: "<no location info>".to_owned(),
                    is_caf: false,
                },
            ],
            profile: ProfileTree {
                id: 1,
                entries: 1.0,
                alloc: 5.0,
                ticks: 3.0,
                children: vec![ProfileTree {
                    id: 2,
                    entries: 0.0,
                    alloc: 0.0,
                    ticks: 0.0,
                    children: Vec::new(),
                }],
            },
        });

        assert_eq!(imported.time_events.len(), 2);
        assert_eq!(imported.alloc_events.len(), 2);
        assert_eq!(imported.frames.len(), 2);
    }
}
