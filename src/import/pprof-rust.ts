import initPprofWasm, {
  import_pprof_json as importPprofJson,
} from '../../rust/pprof-import/pkg/pprof_import.js'
import wasmBinaryPath from '../../rust/pprof-import/pkg/pprof_import_bg.wasm'
import {FrameInfo, StackListProfileBuilder, Profile} from '../lib/profile'
import {TimeFormatter, ByteFormatter} from '../lib/value-formatters'
import {isExperimentEnabled} from '../lib/runtime-config'
import {importAsPprofProfile as importAsPprofProfileTs} from './pprof'

interface PprofFrameInfo {
  key: string
  name: string
  file?: string
  line?: number
}

interface PprofSample {
  stack: number[]
  weight: number
}

interface PprofResult {
  frames: PprofFrameInfo[]
  samples: PprofSample[]
  sample_unit: string | null
  sample_type: string | null
}

let modulePromise: Promise<void> | null = null

async function initializeModule(): Promise<void> {
  await initPprofWasm({module_or_path: wasmBinaryPath as unknown as string})
}

async function ensureModule(): Promise<void> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise
}

function buildProfileFromResult(result: PprofResult): Profile {
  const profileBuilder = new StackListProfileBuilder()

  if (result.sample_unit) {
    switch (result.sample_unit) {
      case 'nanoseconds':
      case 'microseconds':
      case 'milliseconds':
      case 'seconds':
        profileBuilder.setValueFormatter(new TimeFormatter(result.sample_unit))
        break
      case 'bytes':
        profileBuilder.setValueFormatter(new ByteFormatter())
        break
    }
  }

  const frames = result.frames

  for (const sample of result.samples) {
    const stack: FrameInfo[] = []
    for (const frameIdx of sample.stack) {
      if (frameIdx < frames.length) {
        const f = frames[frameIdx]
        const fi: FrameInfo = {key: f.key, name: f.name}
        if (f.file != null) fi.file = f.file
        if (f.line != null) fi.line = f.line
        stack.push(fi)
      }
    }
    profileBuilder.appendSampleWithWeight(stack, sample.weight)
  }

  return profileBuilder.build()
}

export async function importAsPprofProfileRust(rawProfile: ArrayBuffer): Promise<Profile | null> {
  await ensureModule()

  const jsonStr = importPprofJson(new Uint8Array(rawProfile))
  if (!jsonStr || jsonStr === 'null') return null

  const result: PprofResult = JSON.parse(jsonStr)
  return buildProfileFromResult(result)
}

export async function importAsPprofProfileWithFallback(
  rawProfile: ArrayBuffer,
): Promise<Profile | null> {
  if (isExperimentEnabled('rustPprofImport')) {
    try {
      return await importAsPprofProfileRust(rawProfile)
    } catch {
      return importAsPprofProfileTs(rawProfile)
    }
  }
  return importAsPprofProfileTs(rawProfile)
}
