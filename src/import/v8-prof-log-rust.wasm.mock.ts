import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'v8-prof-log', 'pkg', 'v8_prof_log_bg.wasm'),
)

module.exports = wasmModule
