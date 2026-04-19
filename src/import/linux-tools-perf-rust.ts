import initLinuxPerf, {
  initSync as initLinuxPerfSync,
  parse_linux_perf_bytes_js as parseLinuxPerfBytesJs,
} from '../../rust/linux-perf/pkg/linux_perf.js'
import {readNodeFileSync} from '../lib/node-shim'

interface RawRustPerfStackFrame {
  address: string
  symbolName: string
  file: string
}

interface RawRustPerfEvent {
  command: string | null
  processId: number | null
  threadId: number | null
  time: number | null
  eventType: string
  stack: RawRustPerfStackFrame[]
}

export interface RustPerfStackFrame {
  address: string
  symbolName: string
  file: string
}

export interface RustPerfEvent {
  command: string | null
  processID: number | null
  threadID: number | null
  time: number | null
  eventType: string
  stack: RustPerfStackFrame[]
}

let modulePromise: Promise<void> | null = null

async function initializeModule(): Promise<void> {
  if (typeof window === 'undefined') {
    initLinuxPerfSync(readNodeFileSync('rust/linux-perf/pkg/linux_perf_bg.wasm'))
    return
  }
  await initLinuxPerf()
}

export async function parseLinuxPerfEventsWithRust(buffer: ArrayBuffer): Promise<RustPerfEvent[]> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise
  return (parseLinuxPerfBytesJs(new Uint8Array(buffer)) as RawRustPerfEvent[]).map(event => ({
    command: event.command,
    processID: event.processId,
    threadID: event.threadId,
    time: event.time,
    eventType: event.eventType,
    stack: event.stack.map(frame => ({
      address: frame.address,
      symbolName: frame.symbolName,
      file: frame.file,
    })),
  }))
}
