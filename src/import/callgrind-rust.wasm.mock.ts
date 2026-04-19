import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'callgrind-import', 'pkg', 'callgrind_import_bg.wasm'),
)

module.exports = wasmModule
