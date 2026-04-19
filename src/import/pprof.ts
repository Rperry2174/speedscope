import {Profile} from '../lib/profile'
import {buildProfileFromPprofPayload, importAsPprofProfileTs} from './pprof-format'
import {loadRustPprofDecoder, shouldUseRustPprofDecoder} from './pprof-rust'

export async function importAsPprofProfile(rawProfile: ArrayBuffer): Promise<Profile | null> {
  if (!shouldUseRustPprofDecoder()) {
    return importAsPprofProfileTs(rawProfile)
  }

  try {
    const rustDecoder = await loadRustPprofDecoder()
    const payload = rustDecoder(rawProfile)
    if (payload) {
      return buildProfileFromPprofPayload(payload)
    }
  } catch (error) {}

  return importAsPprofProfileTs(rawProfile)
}
