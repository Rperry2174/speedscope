import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'import-parsers', 'pkg', 'import_parsers_bg.wasm'),
)

module.exports = wasmModule
