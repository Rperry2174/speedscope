import {Profile, FrameInfo, CallTreeProfileBuilder} from '../lib/profile'
import {isExperimentEnabled} from '../lib/runtime-config'
import {getOrInsert} from '../lib/utils'
import {TimeFormatter} from '../lib/value-formatters'
import {loadRustFirefoxImporter} from './firefox-rust'

interface Allocations {
  frames: any[]
  sites: any[]
  sizes: any[]
  timestamps: any[]
}

interface Configuration {
  allocationsMaxLogLength: number
  allocationsSampleProbability: number
  bufferSize: number
  sampleFrequency: number
  withAllocations: boolean
  withMarkers: boolean
  withMemory: boolean
  withTicks: boolean
}

interface Lib {
  arch: string
  breakpadId: string
  debugName: string
  debugPath: string
  end: any
  name: string
  offset: number
  path: string
  start: any
}

interface Meta {
  abi: string
  asyncstack: number
  debug: number
  gcpoison: number
  interval: number
  misc: string
  oscpu: string
  platform: string
  processType: number
  product: string
  shutdownTime?: any
  stackwalk: number
  startTime: number
  toolkit: string
  version: number
}

interface PausedRange {
  endTime: number
  reason: string
  startTime: number
}

type Frame = [number] | [number, number | null, number | null, number, number]

interface FrameTable {
  data: Frame[]
  /*
  schema: {
    location: 0
    implementation: 1
    optimizations: 2
    line: 3
    category: 4
  }
  */
}

interface MarkerMeta {
  category: string
  interval: string
  type: string
}
type Marker = [number, number] | [number, number, MarkerMeta]

interface Markers {
  data: Marker[]
  /*
  schema: {
    name: 0
    time: 1
    data: 2
  }
  */
}

type Sample = [number, number, number] | [number, number, number, number, number]

interface Samples {
  data: Sample[]
  /*
  schema: {
    stack: 0
    time: 1
    responsiveness: 2
    rss: 3
    uss: 4
  }
  */
}

export interface StackTable {
  data: [number | null, number][]
  /*
  schema: {
    prefix: 0
    frame: 1
  }
  */
}

export interface Thread {
  frameTable: FrameTable
  markers: Markers
  name: string
  pid: number
  processType: string
  registerTime: number
  samples: Samples
  stackTable: StackTable
  stringTable: string[]
  tid: number
  unregisterTime?: any
}

export interface FirefoxCPUProfile {
  libs: Lib[]
  meta: Meta
  pausedRanges: PausedRange[]
  processes: any[]
  threads: Thread[]
}

export interface FirefoxProfile {
  allocations: Allocations
  configuration: Configuration
  duration: number
  fileType: string
  frames: any[]
  label: string
  markers: any[]
  memory: any[]
  profile: FirefoxCPUProfile
  ticks: any[]
  version: number
}

export interface FirefoxImportFrame {
  key: string
  name: string
  file?: string
  line?: number
  col?: number
}

export interface FirefoxImportSample {
  stack: number[]
  value: number
}

export interface FirefoxImportPayload {
  duration: number
  frames: FirefoxImportFrame[]
  samples: FirefoxImportSample[]
}

function parseFirefoxFrameLocation(
  location: string,
  frameKeyToFrameInfo: Map<string, FrameInfo>,
): FrameInfo | null {
  const match = /(.*)\s+\((.*?)(?::(\d+))?(?::(\d+))?\)$/.exec(location)

  if (!match) return null

  if (
    match[2].startsWith('resource:') ||
    match[2] === 'self-hosted' ||
    match[2].startsWith('self-hosted:')
  ) {
    // Ignore Firefox-internals stuff
    return null
  }

  return getOrInsert(frameKeyToFrameInfo, location, () => ({
    key: location,
    name: match[1]!,
    file: match[2]!,

    // In Firefox profiles, line numbers are 1-based, but columns are
    // 0-based. Let's normalize both to be 1-based.
    line: match[3] ? parseInt(match[3]) : undefined,
    col: match[4] ? parseInt(match[4]) + 1 : undefined,
  }))
}

export function extractFirefoxImportPayload(firefoxProfile: FirefoxProfile): FirefoxImportPayload {
  const cpuProfile = firefoxProfile.profile

  const thread =
    cpuProfile.threads.length === 1
      ? cpuProfile.threads[0]
      : cpuProfile.threads.filter(t => t.name === 'GeckoMain')[0]

  const frameKeyToFrameInfo = new Map<string, FrameInfo>()
  const frameKeyToPayloadIndex = new Map<string, number>()
  const payloadFrames: FirefoxImportFrame[] = []

  function extractStack(sample: Sample): number[] {
    let stackFrameId: number | null = sample[0]
    const ret: number[] = []

    while (stackFrameId != null) {
      const nextStackFrame: [number | null, number] = thread.stackTable.data[stackFrameId]
      const [nextStackId, frameId] = nextStackFrame
      ret.push(frameId)
      stackFrameId = nextStackId
    }
    ret.reverse()
    return ret
      .map(frameId => {
        const frameData = thread.frameTable.data[frameId]
        const location = thread.stringTable[frameData[0] as number]
        const frameInfo = parseFirefoxFrameLocation(location, frameKeyToFrameInfo)
        if (!frameInfo) return null
        return getOrInsert(frameKeyToPayloadIndex, frameInfo.key, () => {
          payloadFrames.push({
            key: `${frameInfo.key}`,
            name: frameInfo.name,
            file: frameInfo.file,
            line: frameInfo.line,
            col: frameInfo.col,
          })
          return payloadFrames.length - 1
        })
      })
      .filter(frameIndex => frameIndex != null) as number[]
  }

  const samples = thread.samples.data.map(sample => ({
    stack: extractStack(sample),
    value: sample[1],
  }))

  return {
    duration: firefoxProfile.duration,
    frames: payloadFrames,
    samples,
  }
}

export function buildFirefoxProfileFromPayload(payload: FirefoxImportPayload): Profile {
  const profile = new CallTreeProfileBuilder(payload.duration)
  const frames: FrameInfo[] = payload.frames.map(frame => ({...frame}))

  let prevStack: number[] = []
  for (let sample of payload.samples) {
    const stack = sample.stack
    const value = sample.value

    // Find lowest common ancestor of the current stack and the previous one
    let lcaIndex = -1

    for (let i = 0; i < Math.min(stack.length, prevStack.length); i++) {
      if (prevStack[i] !== stack[i]) {
        break
      }
      lcaIndex = i
    }

    // Close frames that are no longer open
    for (let i = prevStack.length - 1; i > lcaIndex; i--) {
      profile.leaveFrame(frames[prevStack[i]], value)
    }

    for (let i = lcaIndex + 1; i < stack.length; i++) {
      profile.enterFrame(frames[stack[i]], value)
    }

    prevStack = stack
  }

  profile.setValueFormatter(new TimeFormatter('milliseconds'))
  return profile.build()
}

export function importFromFirefox(firefoxProfile: FirefoxProfile): Profile {
  return buildFirefoxProfileFromPayload(extractFirefoxImportPayload(firefoxProfile))
}

export async function importFromFirefoxBuffer(
  firefoxProfile: FirefoxProfile,
  buffer: ArrayBuffer,
): Promise<Profile> {
  if (!isExperimentEnabled('rustFirefoxImport')) {
    return importFromFirefox(firefoxProfile)
  }

  try {
    const importFromRust = await loadRustFirefoxImporter()
    const payload = importFromRust(buffer)
    if (payload) {
      return buildFirefoxProfileFromPayload(payload)
    }
  } catch (_error) {
    // Fall back to the TypeScript importer if the optional WASM path fails to
    // initialize or can't parse this particular fixture shape.
  }

  return importFromFirefox(firefoxProfile)
}
