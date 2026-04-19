// https://github.com/tmm1/stackprof

import {Profile, StackListProfileBuilder} from '../lib/profile'
import {isExperimentEnabled} from '../lib/runtime-config'
import {RawValueFormatter, TimeFormatter} from '../lib/value-formatters'
import type {RustNormalizedFrame, RustWeightedStack} from './import-parsers-rust'

interface StackprofFrame {
  name?: string
  file?: string
  line?: number
}

export interface StackprofProfile {
  frames: {[number: string]: StackprofFrame}
  mode: string
  raw: number[]
  raw_timestamp_deltas?: number[]
  samples: number
  interval: number
}

function buildProfileFromWeightedStacks(mode: string, samples: RustWeightedStack[]): Profile {
  const profile = new StackListProfileBuilder()
  profile.setValueFormatter(new TimeFormatter('microseconds')) // default to time format unless we're in object mode

  for (const sample of samples) {
    profile.appendSampleWithWeight(sample.frames, sample.weight)
  }

  if (mode === 'object') {
    profile.setValueFormatter(new RawValueFormatter())
  }

  return profile.build()
}

function importFromStackprofWithTsFallback(stackprofProfile: StackprofProfile): Profile {
  const {frames, mode, raw, raw_timestamp_deltas, interval} = stackprofProfile
  const weightedSamples: RustWeightedStack[] = []

  let sampleIndex = 0

  let prevStack: RustNormalizedFrame[] = []

  for (let i = 0; i < raw.length; ) {
    const stackHeight = raw[i++]

    let stack: RustNormalizedFrame[] = []
    for (let j = 0; j < stackHeight; j++) {
      const id = raw[i++]
      let frameName = frames[id].name
      if (frameName == null) {
        frameName = '(unknown)'
      }
      const frame = {
        key: id,
        ...frames[id],
        name: frameName,
      }
      stack.push(frame)
    }
    if (stack.length === 1 && stack[0].name === '(garbage collection)') {
      stack = prevStack.concat(stack)
    }
    const nSamples = raw[i++]

    switch (mode) {
      case 'object':
        weightedSamples.push({frames: stack, weight: nSamples})
        break
      case 'cpu':
        weightedSamples.push({frames: stack, weight: nSamples * interval})
        break
      default:
        if (!raw_timestamp_deltas) {
          throw new Error(
            'Malformed stackprof profile: raw_timestamp_deltas is required for non-cpu/object modes',
          )
        }
        let sampleDuration = 0
        for (let j = 0; j < nSamples; j++) {
          sampleDuration += raw_timestamp_deltas[sampleIndex++]
        }
        weightedSamples.push({frames: stack, weight: sampleDuration})
    }

    prevStack = stack
  }

  return buildProfileFromWeightedStacks(mode, weightedSamples)
}

export async function importFromStackprof(stackprofProfile: StackprofProfile): Promise<Profile> {
  if (isExperimentEnabled('rustImportParsers')) {
    const {normalizeStackprofProfileWithRust} = await import('./import-parsers-rust')
    const rustProfile = await normalizeStackprofProfileWithRust(stackprofProfile)
    if (rustProfile) {
      return buildProfileFromWeightedStacks(rustProfile.mode, rustProfile.samples)
    }
  }

  return importFromStackprofWithTsFallback(stackprofProfile)
}
