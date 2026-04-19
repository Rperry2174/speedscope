import * as fs from 'fs'
import * as path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'firefox-import', 'pkg', 'firefox_import_bg.wasm'),
)

module.exports = wasmModule
