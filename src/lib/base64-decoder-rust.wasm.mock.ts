import fs from 'fs'
import path from 'path'

const wasmModule = fs.readFileSync(
  path.join(process.cwd(), 'rust', 'base64-decoder', 'pkg', 'base64_decoder_bg.wasm'),
)

module.exports = wasmModule
