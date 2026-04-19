import fs from 'fs'
import initRustInstrumentsDeepCopy, {
  initSync as initRustInstrumentsDeepCopySync,
  parse_instruments_deep_copy_json as parseInstrumentsDeepCopyJson,
} from '../../rust/instruments-deep-copy/pkg/instruments_deep_copy.js'
import {CallTreeProfileBuilder, FrameInfo, Profile} from '../lib/profile'
import {isExperimentEnabled} from '../lib/runtime-config'
import {ByteFormatter, TimeFormatter} from '../lib/value-formatters'

interface RustParsedRow {
  sourcePath?: string | null
  symbolName: string
  depth: number
  weight: number
}

interface RustParsedDeepCopy {
  formatter?: 'bytes' | 'time' | null
  rows: RustParsedRow[]
  error?: string
}

interface FrameInfoWithWeight extends FrameInfo {
  endValue: number
}

let modulePromise: Promise<void> | null = null

async function initializeModule(): Promise<void> {
  if (typeof window === 'undefined') {
    initRustInstrumentsDeepCopySync(
      fs.readFileSync('rust/instruments-deep-copy/pkg/instruments_deep_copy_bg.wasm'),
    )
    return
  }
  await initRustInstrumentsDeepCopy()
}

async function ensureModuleReady() {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise
}

function parseJsonResult(buffer: ArrayBuffer): RustParsedDeepCopy {
  const result = parseInstrumentsDeepCopyJson(new Uint8Array(buffer))
  return JSON.parse(result) as RustParsedDeepCopy
}

function buildProfileFromParsedRows(parsed: RustParsedDeepCopy): Profile {
  if (parsed.error) {
    throw new Error(parsed.error)
  }

  const profile = new CallTreeProfileBuilder()
  const stack: FrameInfoWithWeight[] = []
  let cumulativeValue = 0

  for (const row of parsed.rows) {
    if (stack.length - row.depth < 0) {
      throw new Error('Invalid format')
    }

    while (row.depth < stack.length) {
      const frameToLeave = stack.pop()!
      cumulativeValue = Math.max(cumulativeValue, frameToLeave.endValue)
      profile.leaveFrame(frameToLeave, cumulativeValue)
    }

    const newFrameInfo: FrameInfoWithWeight = {
      key: `${row.sourcePath || ''}:${row.symbolName}`,
      name: row.symbolName,
      file: row.sourcePath || undefined,
      endValue: cumulativeValue + row.weight,
    }
    profile.enterFrame(newFrameInfo, cumulativeValue)
    stack.push(newFrameInfo)
  }

  while (stack.length > 0) {
    const frameToLeave = stack.pop()!
    cumulativeValue = Math.max(cumulativeValue, frameToLeave.endValue)
    profile.leaveFrame(frameToLeave, cumulativeValue)
  }

  if (parsed.formatter === 'bytes') {
    profile.setValueFormatter(new ByteFormatter())
  } else if (parsed.formatter === 'time') {
    profile.setValueFormatter(new TimeFormatter('milliseconds'))
  }

  return profile.build()
}

export async function importFromInstrumentsDeepCopyRust(buffer: ArrayBuffer): Promise<Profile> {
  await ensureModuleReady()
  return buildProfileFromParsedRows(parseJsonResult(buffer))
}

export function shouldUseRustInstrumentsDeepCopy(buffer: ArrayBuffer): boolean {
  if (!isExperimentEnabled('rustInstrumentsDeepCopy')) return false
  return buffer.byteLength <= 8 * 1024 * 1024
}
