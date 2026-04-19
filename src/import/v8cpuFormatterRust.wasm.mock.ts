import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'v8-cpu-formatter', 'pkg', 'v8_cpu_formatter_bg.wasm'),
)

module.exports = wasmModule
