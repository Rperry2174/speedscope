import {exportProfileGroup} from '../lib/file-format'
import {CallTreeNode, Frame, Profile, ProfileGroup} from '../lib/profile'
import {ExperimentFlags, runWithExperimentOverrides} from '../lib/runtime-config'
import {
  CanonicalFrameSummary,
  CanonicalImportedProfileGroup,
  CanonicalProfileDump,
  ImportComparisonResult,
  ImportEngine,
  ImportMismatchSummary,
  ImportProfileOptions,
  ImportRunResult,
  ResolvedImportProfileOptions,
  getVisibleImportEngine,
  resolveImportProfileOptions,
} from './contracts'

export type ImportEngineRunner = (engine: ImportEngine) => Promise<ProfileGroup | null>

const IMPORT_ENGINE_EXPERIMENT_KEYS: (keyof ExperimentFlags)[] = [
  'rustImportParsers',
  'rustFirefoxImport',
  'rustBase64Decode',
  'rustPprofImport',
  'rustHaskellImport',
  'rustInstrumentsDeepCopy',
  'rustCallgrindImport',
  'rustV8ProfLog',
  'rustV8CpuFormatter',
  'rustLinuxPerf',
  'rustTraceEventImport',
]

const MAX_MISMATCH_PATHS = 25
const COMPARISON_NUMBER_DECIMAL_PLACES = 11

function normalizeImportError(error: unknown): string {
  return error instanceof Error ? error.message : `${error}`
}

export function getImportEngineExperimentOverrides(engine: ImportEngine): Partial<ExperimentFlags> {
  const enabled = engine === 'experimental'
  return IMPORT_ENGINE_EXPERIMENT_KEYS.reduce((overrides, key) => {
    overrides[key] = enabled
    return overrides
  }, {} as Partial<ExperimentFlags>)
}

function normalizeComparisonNumber(value: number): number {
  if (!isFinite(value)) {
    return value
  }
  const rounded = Number(value.toFixed(COMPARISON_NUMBER_DECIMAL_PLACES))
  return Object.is(rounded, -0) ? 0 : rounded
}

function normalizeComparisonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeComparisonValue)
  }
  if (typeof value === 'number') {
    return normalizeComparisonNumber(value)
  }
  if (value && typeof value === 'object') {
    const normalized: {[key: string]: unknown} = {}
    for (const key of Object.keys(value as {[key: string]: unknown}).sort()) {
      normalized[key] = normalizeComparisonValue((value as {[key: string]: unknown})[key])
    }
    return normalized
  }
  return value
}

export async function runLegacyImport(
  importer: () => Promise<ProfileGroup | null>,
): Promise<ProfileGroup | null> {
  return runWithImportEngine('legacy', importer)
}

export async function runExperimentalImport(
  importer: () => Promise<ProfileGroup | null>,
): Promise<ProfileGroup | null> {
  return runWithImportEngine('experimental', importer)
}

export async function runWithImportEngine(
  engine: ImportEngine,
  importer: () => Promise<ProfileGroup | null>,
): Promise<ProfileGroup | null> {
  return runWithExperimentOverrides(getImportEngineExperimentOverrides(engine), importer)
}

function summarizeFrame(frame: Frame): CanonicalFrameSummary {
  return {
    key: frame.key,
    name: frame.name,
    file: frame.file,
    line: frame.line,
    col: frame.col,
  }
}

function normalizeNumericValue(value: number): number {
  return Number(value.toFixed(9))
}

function dumpProfile(profile: Profile): CanonicalProfileDump {
  const frames: CanonicalFrameSummary[] = []
  profile.forEachFrame(frame => {
    const summary = summarizeFrame(frame)
    frames.push({
      ...summary,
      line: summary.line == null ? undefined : normalizeNumericValue(summary.line),
      col: summary.col == null ? undefined : normalizeNumericValue(summary.col),
    })
  })

  const stacks: string[] = []
  const currentStack: string[] = []
  let lastValue = 0

  function maybeEmit(value: number) {
    if (lastValue === value) {
      return
    }
    const normalizedDelta = normalizeNumericValue(value - lastValue)
    stacks.push(`${currentStack.join(';')} ${profile.formatValue(normalizedDelta)}`)
    lastValue = normalizeNumericValue(value)
  }

  profile.forEachCall(
    (node: CallTreeNode, value: number) => {
      maybeEmit(value)
      currentStack.push(node.frame.name)
    },
    (_node: CallTreeNode, value: number) => {
      maybeEmit(value)
      currentStack.pop()
    },
  )

  return {
    name: profile.getName(),
    stacks,
    frames,
  }
}

export function canonicalizeImportedProfileGroup(
  profileGroup: ProfileGroup | null,
): CanonicalImportedProfileGroup | null {
  if (!profileGroup) {
    return null
  }
  return {
    group: normalizeComparisonValue(exportProfileGroup(profileGroup)),
    dumps: normalizeComparisonValue(profileGroup.profiles.map(profile => dumpProfile(profile))) as
      | CanonicalProfileDump[]
      | never,
  }
}

function collectMismatchPaths(
  left: unknown,
  right: unknown,
  currentPath: string,
  mismatchPaths: string[],
) {
  if (mismatchPaths.length >= MAX_MISMATCH_PATHS) {
    return
  }

  if (left === right) {
    return
  }

  if (left == null || right == null) {
    mismatchPaths.push(currentPath)
    return
  }

  if (typeof left !== typeof right) {
    mismatchPaths.push(currentPath)
    return
  }

  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) {
      mismatchPaths.push(currentPath)
      return
    }
    if (left.length !== right.length) {
      mismatchPaths.push(`${currentPath}.length`)
    }
    const length = Math.max(left.length, right.length)
    for (let i = 0; i < length; i++) {
      collectMismatchPaths(left[i], right[i], `${currentPath}[${i}]`, mismatchPaths)
      if (mismatchPaths.length >= MAX_MISMATCH_PATHS) {
        return
      }
    }
    return
  }

  if (typeof left === 'object') {
    const leftRecord = left as {[key: string]: unknown}
    const rightRecord = right as {[key: string]: unknown}
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])
    for (const key of keys) {
      collectMismatchPaths(leftRecord[key], rightRecord[key], `${currentPath}.${key}`, mismatchPaths)
      if (mismatchPaths.length >= MAX_MISMATCH_PATHS) {
        return
      }
    }
    return
  }

  mismatchPaths.push(currentPath)
}

function summarizeImportMismatch(args: {
  legacyProfileGroup: ProfileGroup | null
  experimentalProfileGroup: ProfileGroup | null
  legacySummary: CanonicalImportedProfileGroup | null
  experimentalSummary: CanonicalImportedProfileGroup | null
  legacyError: string | null
  experimentalError: string | null
}): ImportMismatchSummary {
  const {
    legacyProfileGroup,
    experimentalProfileGroup,
    legacySummary,
    experimentalSummary,
    legacyError,
    experimentalError,
  } = args

  const reasons: string[] = []
  const mismatchPaths: string[] = []

  if (legacyError) {
    reasons.push(`Legacy import failed: ${legacyError}`)
  }
  if (experimentalError) {
    reasons.push(`Experimental import failed: ${experimentalError}`)
  }

  if (!legacyError && !experimentalError) {
    if (legacyProfileGroup == null && experimentalProfileGroup == null) {
      return {
        equivalent: true,
        reasons,
        mismatchPaths,
        legacySummary,
        experimentalSummary,
        legacyError,
        experimentalError,
      }
    }

    if (legacyProfileGroup == null || experimentalProfileGroup == null) {
      reasons.push('One engine returned null while the other returned a profile group')
      mismatchPaths.push('$')
    } else {
      if (JSON.stringify(legacySummary?.group) !== JSON.stringify(experimentalSummary?.group)) {
        reasons.push('Exported profile groups differed')
      }
      if (JSON.stringify(legacySummary?.dumps) !== JSON.stringify(experimentalSummary?.dumps)) {
        reasons.push('Profile stack dumps differed')
      }
      if (reasons.length > 0) {
        collectMismatchPaths(legacySummary, experimentalSummary, '$', mismatchPaths)
      }
    }
  }

  return {
    equivalent: reasons.length === 0,
    reasons,
    mismatchPaths,
    legacySummary,
    experimentalSummary,
    legacyError,
    experimentalError,
  }
}

async function createImportComparisonResult(args: {
  requestedEngine: ImportEngine
  comparisonMode: ResolvedImportProfileOptions['comparisonMode']
  legacyProfileGroup: ProfileGroup | null
  legacySummary: CanonicalImportedProfileGroup | null
  legacyError: string | null
  runEngine: ImportEngineRunner
}): Promise<ImportComparisonResult> {
  const {requestedEngine, comparisonMode, legacyProfileGroup, legacySummary, legacyError, runEngine} = args

  let experimentalProfileGroup: ProfileGroup | null = null
  let experimentalSummary: CanonicalImportedProfileGroup | null = null
  let experimentalError: string | null = null

  if (!legacyError) {
    try {
      experimentalProfileGroup = await runEngine('experimental')
      experimentalSummary = canonicalizeImportedProfileGroup(experimentalProfileGroup)
    } catch (error) {
      experimentalError = normalizeImportError(error)
    }
  }

  const mismatchSummary = summarizeImportMismatch({
    legacyProfileGroup,
    experimentalProfileGroup,
    legacySummary,
    experimentalSummary,
    legacyError,
    experimentalError,
  })

  return {
    requestedEngine,
    visibleEngine: 'legacy',
    comparisonMode,
    legacyProfileGroup,
    experimentalProfileGroup,
    mismatchSummary,
  }
}

async function maybeNotifyComparisonResult(
  result: ImportComparisonResult,
  options: ResolvedImportProfileOptions,
): Promise<ImportComparisonResult> {
  if (options.onComparisonResult) {
    await options.onComparisonResult(result)
  }
  return result
}

export async function runImportEngine(
  runEngine: ImportEngineRunner,
  options?: ImportProfileOptions | null,
): Promise<ImportRunResult> {
  const resolvedOptions = resolveImportProfileOptions(options)
  const visibleEngine = getVisibleImportEngine(resolvedOptions.engine, resolvedOptions.compare)
  let profileGroup: ProfileGroup | null = null
  let visibleEngineError: string | null = null
  try {
    profileGroup = await runEngine(visibleEngine)
  } catch (error) {
    visibleEngineError = normalizeImportError(error)
  }

  if (visibleEngineError) {
    throw new Error(visibleEngineError)
  }

  if (!resolvedOptions.compare) {
    return {
      profileGroup,
      visibleEngine,
      comparisonResult: null,
      deferredComparison: null,
    }
  }

  const legacySummary = canonicalizeImportedProfileGroup(profileGroup)
  let comparisonPromise: Promise<ImportComparisonResult | null> | null = null
  const deferredComparison = async () => {
    if (!comparisonPromise) {
      comparisonPromise = maybeNotifyComparisonResult(
        await createImportComparisonResult({
          requestedEngine: resolvedOptions.engine,
          comparisonMode: resolvedOptions.comparisonMode,
          legacyProfileGroup: profileGroup,
          legacySummary,
          legacyError: visibleEngineError,
          runEngine,
        }),
        resolvedOptions,
      )
    }
    return comparisonPromise
  }

  if (resolvedOptions.comparisonMode === 'blocking') {
    return {
      profileGroup,
      visibleEngine,
      comparisonResult: await deferredComparison(),
      deferredComparison: null,
    }
  }

  return {
    profileGroup,
    visibleEngine,
    comparisonResult: null,
    deferredComparison,
  }
}
