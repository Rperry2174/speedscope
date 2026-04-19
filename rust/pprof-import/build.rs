fn main() {
    prost_build::Config::new()
        .compile_protos(&["../../src/import/profile.proto"], &["../../src/import/"])
        .expect("Failed to compile profile.proto");
}
