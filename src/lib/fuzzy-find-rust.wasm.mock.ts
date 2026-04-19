import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'fuzzy-find', 'pkg', 'fuzzy_find_bg.wasm'),
)

export default wasmModule
