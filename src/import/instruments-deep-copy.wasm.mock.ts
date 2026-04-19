import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'instruments-deep-copy', 'pkg', 'instruments_deep_copy_bg.wasm'),
)

module.exports = wasmModule
