import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'trace-event-import', 'pkg', 'trace_event_import_bg.wasm'),
)

module.exports = wasmModule
