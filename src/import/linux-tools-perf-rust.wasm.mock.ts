import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'linux-perf', 'pkg', 'linux_perf_bg.wasm'),
)

module.exports = wasmModule
