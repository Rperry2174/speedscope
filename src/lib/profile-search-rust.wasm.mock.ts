import * as fs from 'fs'
import * as path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'profile-search', 'pkg', 'profile_search_bg.wasm'),
)

module.exports = wasmModule
