import initRustV8ProfLog, {
  import_v8_prof_log_json as importV8ProfLogJson,
} from '../../rust/v8-prof-log/pkg/v8_prof_log.js'
import {isExperimentEnabled} from '../lib/runtime-config'
import {Profile} from '../lib/profile'
import {
  buildProfileFromImportedV8ProfLog,
  importFromV8ProfLogTs,
  ImportedV8ProfLogProfile,
  V8LogProfile,
} from './v8proflog'

let modulePromise: Promise<void> | null = null
let rustImporter: ((contents: Uint8Array) => Profile) | null = null

function isNodeLikeEnvironment(): boolean {
  return typeof process !== 'undefined' && !!process.versions?.node
}

async function initializeModule(): Promise<void> {
  if (isNodeLikeEnvironment()) {
    const fs = await import('fs')
    const path = await import('path')
    const wasmBinary = fs.readFileSync(
      path.join(process.cwd(), 'rust', 'v8-prof-log', 'pkg', 'v8_prof_log_bg.wasm'),
    )
    await initRustV8ProfLog(new Uint8Array(wasmBinary))
    return
  }

  await initRustV8ProfLog()
}

export async function loadRustV8ProfLogImporter(): Promise<(contents: Uint8Array) => Profile> {
  if (!modulePromise) {
    modulePromise = initializeModule()
  }
  await modulePromise

  const importer = (contents: Uint8Array) => {
    const result = importV8ProfLogJson(contents)
    return buildProfileFromImportedV8ProfLog(JSON.parse(result) as ImportedV8ProfLogProfile)
  }
  rustImporter = importer
  return importer
}

function preloadRustV8ProfLogImporter() {
  if (rustImporter != null || modulePromise != null) return
  loadRustV8ProfLogImporter()
    .then(importer => {
      rustImporter = importer
    })
    .catch(() => {
      rustImporter = null
    })
}

export function canUseRustV8ProfLogImporter(): boolean {
  if (!isExperimentEnabled('rustV8ProfLog')) {
    return false
  }
  preloadRustV8ProfLogImporter()
  return rustImporter != null
}

export async function importFromV8ProfLogBuffer(
  buffer: ArrayBuffer,
  fallbackProfile: V8LogProfile,
): Promise<Profile> {
  const contents = new Uint8Array(buffer)
  try {
    const importer = rustImporter || (await loadRustV8ProfLogImporter())
    return importer(contents)
  } catch (error) {
    console.warn('Rust V8 prof log importer failed, falling back to TypeScript.', error)
    return importFromV8ProfLogTs(fallbackProfile)
  }
}
