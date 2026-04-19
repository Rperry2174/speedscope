export interface ExperimentFlags {
  deferDemangle: boolean
  optimizedForEachCall: boolean
  rustFuzzyFind: boolean
  rustImportParsers: boolean
  rustFirefoxImport: boolean
  rustBase64Decode: boolean
  rustProfileSearch: boolean
  rustTextUtils: boolean
  rustPprofImport: boolean
  rustHaskellImport: boolean
  rustInstrumentsDeepCopy: boolean
  rustCallgrindImport: boolean
  rustV8ProfLog: boolean
  rustV8CpuFormatter: boolean
  rustLinuxPerf: boolean
  rustTraceEventImport: boolean
}

const DEFAULT_EXPERIMENT_FLAGS: ExperimentFlags = {
  deferDemangle: false,
  optimizedForEachCall: false,
  rustFuzzyFind: false,
  rustImportParsers: false,
  rustFirefoxImport: false,
  rustBase64Decode: false,
  rustProfileSearch: false,
  rustTextUtils: false,
  rustPprofImport: false,
  rustHaskellImport: false,
  rustInstrumentsDeepCopy: false,
  rustCallgrindImport: false,
  rustV8ProfLog: false,
  rustV8CpuFormatter: false,
  rustLinuxPerf: false,
  rustTraceEventImport: false,
}

let experimentOverrides: Partial<ExperimentFlags> | null = null

function isBrowser() {
  return typeof window !== 'undefined'
}

function parseBooleanFlag(value: string | null): boolean | null {
  if (value == null) return null
  const normalized = value.trim().toLowerCase()
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false
  }
  return null
}

function getSearchParams(): URLSearchParams | null {
  if (!isBrowser()) return null
  return new URLSearchParams(window.location.search)
}

function getEnvironmentValue(key: string): string | null {
  if (typeof process !== 'undefined' && process.env && process.env[key] != null) {
    return process.env[key]!
  }
  return null
}

function getQueryValue(key: string): string | null {
  return getSearchParams()?.get(key) || null
}

function collectEnabledExperimentsFromString(value: string | null): Set<string> {
  const enabled = new Set<string>()
  if (!value) return enabled
  for (const token of value.split(',')) {
    const trimmed = token.trim()
    if (trimmed) enabled.add(trimmed)
  }
  return enabled
}

function resolveExperimentFlagsFromEnvironment(): ExperimentFlags {
  const queryParams = getSearchParams()
  const enabledExperiments = collectEnabledExperimentsFromString(
    queryParams?.get('experiments') || getEnvironmentValue('SPEEDSCOPE_EXPERIMENTS'),
  )

  const resolved: ExperimentFlags = {...DEFAULT_EXPERIMENT_FLAGS}
  ;(Object.keys(DEFAULT_EXPERIMENT_FLAGS) as (keyof ExperimentFlags)[]).forEach(key => {
    if (enabledExperiments.has(key)) {
      resolved[key] = true
    }
    const explicitQueryValue = parseBooleanFlag(getQueryValue(key))
    if (explicitQueryValue != null) {
      resolved[key] = explicitQueryValue
      return
    }
    const explicitEnvValue = parseBooleanFlag(getEnvironmentValue(`SPEEDSCOPE_${key.toUpperCase()}`))
    if (explicitEnvValue != null) {
      resolved[key] = explicitEnvValue
    }
  })
  return resolved
}

export function setExperimentOverridesForTesting(overrides: Partial<ExperimentFlags> | null) {
  experimentOverrides = overrides
}

export function getExperimentFlags(): ExperimentFlags {
  return {
    ...resolveExperimentFlagsFromEnvironment(),
    ...(experimentOverrides || {}),
  }
}

export function isExperimentEnabled(key: keyof ExperimentFlags): boolean {
  return getExperimentFlags()[key]
}

export function isPerfInstrumentationEnabled(): boolean {
  const queryValue = parseBooleanFlag(getQueryValue('perf'))
  if (queryValue != null) return queryValue
  const envValue = parseBooleanFlag(getEnvironmentValue('SPEEDSCOPE_PERF'))
  if (envValue != null) return envValue
  return false
}
