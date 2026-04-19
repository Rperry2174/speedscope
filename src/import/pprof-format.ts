import {perftools} from './profile.proto.js'
import {FrameInfo, Profile, StackListProfileBuilder} from '../lib/profile'
import {lastOf} from '../lib/utils'
import {ByteFormatter, TimeFormatter} from '../lib/value-formatters'
import Long from 'long'

export interface PprofImportFrame {
  key: string
  name: string
  file?: string | null
  line?: number | null
}

export interface PprofImportSample {
  frames: PprofImportFrame[]
  value: number
}

export interface PprofImportPayload {
  sample_type: {
    type: string
    unit: string
  }
  samples: PprofImportSample[]
}

interface SampleType {
  type: string
  unit: string
}

// Find the index of the SampleType which should be used as our default
function getSampleTypeIndex(profile: perftools.profiles.Profile): number {
  const dflt = profile.defaultSampleType
  const sampleTypes = profile.sampleType
  const fallback = sampleTypes.length - 1

  // string_table[0] will always be empty-string, so we can assume dflt === 0 is just the proto
  // empty-value, and means no defaultSampleType was specified.
  if (!dflt || !+dflt) {
    return fallback
  }

  const idx = sampleTypes.findIndex(e => e.type === dflt)
  if (idx === -1) {
    return fallback
  }
  return idx
}

export function importAsPprofProfileTs(rawProfile: ArrayBuffer): Profile | null {
  if (rawProfile.byteLength === 0) return null

  let protoProfile: perftools.profiles.Profile
  try {
    protoProfile = perftools.profiles.Profile.decode(new Uint8Array(rawProfile))
  } catch (e) {
    return null
  }

  function i32(n: number | Long): number {
    return typeof n === 'number' ? n : (n as Long).low
  }

  function stringVal(key: number | Long): string | null {
    return protoProfile.stringTable[i32(key)] || null
  }

  const frameInfoByFunctionID = new Map<number, FrameInfo>()

  function frameInfoForFunction(f: perftools.profiles.IFunction): FrameInfo | null {
    const {name, filename, startLine} = f

    const nameString = (name != null && stringVal(name)) || '(unknown)'
    const fileNameString = filename != null ? stringVal(filename) : null
    const line = startLine != null ? +startLine : null

    const key = `${nameString}:${fileNameString}:${line}`

    const frameInfo: FrameInfo = {
      key,
      name: nameString,
    }

    if (fileNameString != null) {
      frameInfo.file = fileNameString
    }

    if (line != null) {
      frameInfo.line = line
    }

    return frameInfo
  }

  for (let f of protoProfile.function) {
    if (f.id) {
      const frameInfo = frameInfoForFunction(f)
      if (frameInfo != null) {
        frameInfoByFunctionID.set(i32(f.id), frameInfo)
      }
    }
  }

  function frameInfoForLocation(location: perftools.profiles.ILocation): FrameInfo | null {
    const {line} = location
    if (line == null) return null

    const lastLine = lastOf(line)
    if (lastLine == null) return null

    if (lastLine.functionId) {
      let funcFrame = frameInfoByFunctionID.get(i32(lastLine.functionId))
      const line = lastLine.line instanceof Long ? lastLine.line.toNumber() : lastLine.line
      if (line && line > 0 && funcFrame != null) {
        funcFrame.line = line
      }
      return funcFrame || null
    } else {
      return null
    }
  }

  const frameByLocationID = new Map<number, FrameInfo>()

  for (let l of protoProfile.location) {
    if (l.id != null) {
      const frameInfo = frameInfoForLocation(l)
      if (frameInfo) {
        frameByLocationID.set(i32(l.id), frameInfo)
      }
    }
  }

  const sampleTypes: SampleType[] = protoProfile.sampleType.map(type => ({
    type: (type.type && stringVal(type.type)) || 'samples',
    unit: (type.unit && stringVal(type.unit)) || 'count',
  }))

  const sampleTypeIndex = getSampleTypeIndex(protoProfile)

  if (sampleTypeIndex < 0 || sampleTypeIndex >= sampleTypes.length) {
    return null
  }

  const profileBuilder = new StackListProfileBuilder()
  const sampleType = sampleTypes[sampleTypeIndex]

  switch (sampleType.unit) {
    case 'nanoseconds':
    case 'microseconds':
    case 'milliseconds':
    case 'seconds':
      profileBuilder.setValueFormatter(new TimeFormatter(sampleType.unit))
      break

    case 'bytes':
      profileBuilder.setValueFormatter(new ByteFormatter())
      break
  }

  for (let s of protoProfile.sample) {
    const stack = s.locationId ? s.locationId.map(l => frameByLocationID.get(i32(l))) : []
    stack.reverse()

    if (s.value == null || s.value.length <= sampleTypeIndex) {
      return null
    }

    const value = s.value[sampleTypeIndex]
    profileBuilder.appendSampleWithWeight(stack.filter(f => f != null) as FrameInfo[], +value)
  }

  return profileBuilder.build()
}

export function buildProfileFromPprofPayload(payload: PprofImportPayload): Profile | null {
  const profileBuilder = new StackListProfileBuilder()

  switch (payload.sample_type.unit) {
    case 'nanoseconds':
    case 'microseconds':
    case 'milliseconds':
    case 'seconds':
      profileBuilder.setValueFormatter(new TimeFormatter(payload.sample_type.unit))
      break

    case 'bytes':
      profileBuilder.setValueFormatter(new ByteFormatter())
      break
  }

  for (const sample of payload.samples) {
    const frames: FrameInfo[] = sample.frames.map(frame => {
      const frameInfo: FrameInfo = {
        key: frame.key,
        name: frame.name,
      }
      if (frame.file != null) frameInfo.file = frame.file
      if (frame.line != null) frameInfo.line = frame.line
      return frameInfo
    })
    profileBuilder.appendSampleWithWeight(frames, sample.value)
  }

  return profileBuilder.build()
}

export type DecodedPprofProfile = PprofImportPayload
