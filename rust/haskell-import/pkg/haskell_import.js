/* @ts-self-types="./haskell_import.d.ts" */

let wasm
let cachedUint8Memory = null
let cachedTextDecoder = new TextDecoder('utf-8', {ignoreBOM: true, fatal: true})
const cachedTextEncoder = new TextEncoder()

function getUint8Memory() {
  if (cachedUint8Memory == null || cachedUint8Memory.buffer !== wasm.memory.buffer) {
    cachedUint8Memory = new Uint8Array(wasm.memory.buffer)
  }
  return cachedUint8Memory
}

function encodeString(value) {
  const encoded = cachedTextEncoder.encode(value)
  const ptr = wasm.alloc(encoded.length)
  getUint8Memory().subarray(ptr, ptr + encoded.length).set(encoded)
  return {ptr, len: encoded.length}
}

function decodeString(ptr, len) {
  return cachedTextDecoder.decode(getUint8Memory().subarray(ptr, ptr + len))
}

export function import_haskell_profile_json(profileJson) {
  const input = encodeString(profileJson)
  const resultPtr = wasm.import_haskell_profile_json(input.ptr, input.len)
  wasm.free(input.ptr, input.len)
  if (resultPtr === 0) {
    throw new Error('Rust Haskell importer returned a null pointer')
  }

  const memory = new Uint32Array(wasm.memory.buffer)
  const base = resultPtr >>> 2
  const outputPtr = memory[base]
  const outputLen = memory[base + 1]
  const errorPtr = memory[base + 2]
  const errorLen = memory[base + 3]
  const ok = memory[base + 4] === 1

  const payload = decodeString(ok ? outputPtr : errorPtr, ok ? outputLen : errorLen)
  wasm.free_result(resultPtr)
  if (!ok) {
    throw new Error(payload)
  }
  return payload
}

function finalizeInit(instance) {
  wasm = instance.exports
  cachedUint8Memory = null
  return wasm
}

export default async function init(moduleOrPath) {
  if (wasm !== undefined) return wasm

  if (
    moduleOrPath &&
    Object.getPrototypeOf(moduleOrPath) === Object.prototype &&
    'module_or_path' in moduleOrPath
  ) {
    ;({module_or_path: moduleOrPath} = moduleOrPath)
  }

  if (moduleOrPath == null) {
    moduleOrPath = new URL('haskell_import_bg.wasm', import.meta.url)
  }

  if (
    typeof moduleOrPath === 'string' ||
    (typeof Request === 'function' && moduleOrPath instanceof Request) ||
    (typeof URL === 'function' && moduleOrPath instanceof URL)
  ) {
    moduleOrPath = fetch(moduleOrPath)
  }

  const resolved = await moduleOrPath
  if (resolved instanceof Response) {
    const bytes = await resolved.arrayBuffer()
    const {instance} = await WebAssembly.instantiate(bytes)
    return finalizeInit(instance)
  }

  if (resolved instanceof WebAssembly.Module) {
    const instance = await WebAssembly.instantiate(resolved)
    return finalizeInit(instance)
  }

  const {instance} = await WebAssembly.instantiate(resolved)
  return finalizeInit(instance)
}
