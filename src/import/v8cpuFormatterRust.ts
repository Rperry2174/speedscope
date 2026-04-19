import initV8CpuFormatter, {
  chrome_tree_to_nodes as chromeTreeToNodesWasm,
} from '../../rust/v8-cpu-formatter/pkg/v8_cpu_formatter.js'
import type {CPUProfile} from './chrome'
import type {OldCPUProfile} from './v8cpuFormatter'

let modulePromise: Promise<void> | null = null

function isNodeRuntime() {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null
}

async function initializeModule(): Promise<void> {
  if (isNodeRuntime()) {
    const [{default: fs}, {default: path}] = await Promise.all([import('fs'), import('path')])
    const wasmBinary = fs.readFileSync(
      path.join(process.cwd(), 'rust', 'v8-cpu-formatter', 'pkg', 'v8_cpu_formatter_bg.wasm'),
    )
    await initV8CpuFormatter(wasmBinary)
    return
  }

  const wasmModule = await import('../../rust/v8-cpu-formatter/pkg/v8_cpu_formatter_bg.wasm')
  await initV8CpuFormatter({module_or_path: wasmModule.default as unknown as string})
}

async function ensureModuleLoaded() {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise
}

export async function chromeTreeToNodesRust(content: OldCPUProfile): Promise<CPUProfile> {
  await ensureModuleLoaded()
  return chromeTreeToNodesWasm(content) as CPUProfile
}
