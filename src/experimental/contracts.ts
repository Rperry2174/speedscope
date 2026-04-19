import {ProfileGroup} from '../lib/profile'

export const IMPORT_ENGINES = ['legacy', 'experimental'] as const
export type ImportEngine = (typeof IMPORT_ENGINES)[number]

export const IMPORT_COMPARISON_MODES = ['off', 'background', 'blocking'] as const
export type ImportComparisonMode = (typeof IMPORT_COMPARISON_MODES)[number]

export interface CanonicalFrameSummary {
  key: string | number
  name: string
  file?: string
  line?: number
  col?: number
}

export interface CanonicalProfileDump {
  name: string
  stacks: string[]
  frames: CanonicalFrameSummary[]
}

export interface CanonicalImportedProfileGroup {
  group: unknown
  dumps: CanonicalProfileDump[]
}

export interface ImportMismatchSummary {
  equivalent: boolean
  reasons: string[]
  mismatchPaths: string[]
  legacySummary: CanonicalImportedProfileGroup | null
  experimentalSummary: CanonicalImportedProfileGroup | null
  legacyError: string | null
  experimentalError: string | null
}

export interface ImportComparisonResult {
  requestedEngine: ImportEngine
  visibleEngine: ImportEngine
  comparisonMode: ImportComparisonMode
  legacyProfileGroup: ProfileGroup | null
  experimentalProfileGroup: ProfileGroup | null
  mismatchSummary: ImportMismatchSummary
}

export interface ImportRunResult {
  profileGroup: ProfileGroup | null
  visibleEngine: ImportEngine
  comparisonResult: ImportComparisonResult | null
  deferredComparison: (() => Promise<ImportComparisonResult | null>) | null
}

export interface ImportProfileOptions {
  engine?: ImportEngine | null
  compare?: boolean | null
  comparisonMode?: ImportComparisonMode | null
  onComparisonResult?: ((result: ImportComparisonResult) => void | Promise<void>) | null
}

export interface ResolvedImportProfileOptions {
  engine: ImportEngine
  compare: boolean
  comparisonMode: ImportComparisonMode
  onComparisonResult: ((result: ImportComparisonResult) => void | Promise<void>) | null
}

export function getDefaultImportEngine(): ImportEngine {
  return 'legacy'
}

export function getDefaultImportComparisonMode(): ImportComparisonMode {
  return 'background'
}

export function normalizeImportEngine(value: string | null | undefined): ImportEngine | null {
  if (value == null) return null
  switch (value.trim().toLowerCase()) {
    case 'legacy':
      return 'legacy'
    case 'experimental':
      return 'experimental'
    default:
      return null
  }
}

export function normalizeImportComparisonMode(
  value: string | null | undefined,
): ImportComparisonMode | null {
  if (value == null) return null
  switch (value.trim().toLowerCase()) {
    case 'off':
    case 'none':
      return 'off'
    case 'background':
      return 'background'
    case 'blocking':
    case 'sync':
    case 'synchronous':
      return 'blocking'
    default:
      return null
  }
}

export function normalizeCompareImport(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'number') {
    return value !== 0
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    return ['1', 'true', 'yes', 'on'].includes(normalized)
  }
  return false
}

export function getVisibleImportEngine(
  requestedEngine: ImportEngine,
  compareImport: boolean,
): ImportEngine {
  return compareImport ? 'legacy' : requestedEngine
}

export function resolveImportProfileOptions(
  options?: ImportProfileOptions | null,
): ResolvedImportProfileOptions {
  const compare = normalizeCompareImport(options?.compare)
  return {
    engine: options?.engine || getDefaultImportEngine(),
    compare,
    comparisonMode: compare
      ? options?.comparisonMode || getDefaultImportComparisonMode()
      : 'off',
    onComparisonResult: options?.onComparisonResult || null,
  }
}
