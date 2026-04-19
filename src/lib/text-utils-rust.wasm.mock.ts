import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'text-utils', 'pkg', 'text_utils_bg.wasm'),
)

module.exports = wasmModule
