import {ImportEngine, normalizeImportEngine} from '../experimental/contracts'
import {ViewMode} from '../lib/view-mode'

export interface HashParams {
  profileURL?: string
  title?: string
  localProfilePath?: string
  viewMode?: ViewMode
  importEngine?: ImportEngine
  compareImport?: boolean
}

function parseHashComponent(component: string): {key: string; value: string} | null {
  const separatorIndex = component.indexOf('=')
  if (separatorIndex === -1) {
    return null
  }

  const key = component.slice(0, separatorIndex)
  const encodedValue = component.slice(separatorIndex + 1)

  try {
    return {key, value: decodeURIComponent(encodedValue)}
  } catch {
    return null
  }
}

function getViewMode(value: string): ViewMode | null {
  switch (value) {
    case 'time-ordered':
      return ViewMode.CHRONO_FLAME_CHART
    case 'left-heavy':
      return ViewMode.LEFT_HEAVY_FLAME_GRAPH
    case 'sandwich':
      return ViewMode.SANDWICH_VIEW
    default:
      return null
  }
}

function getBooleanHashValue(value: string): boolean | null {
  switch (value.trim().toLowerCase()) {
    case '1':
    case 'true':
    case 'yes':
    case 'on':
      return true
    case '0':
    case 'false':
    case 'no':
    case 'off':
      return false
    default:
      return null
  }
}

function getViewModeSpecifier(viewMode: ViewMode | undefined): string | null {
  switch (viewMode) {
    case ViewMode.CHRONO_FLAME_CHART:
      return 'time-ordered'
    case ViewMode.LEFT_HEAVY_FLAME_GRAPH:
      return 'left-heavy'
    case ViewMode.SANDWICH_VIEW:
      return 'sandwich'
    default:
      return null
  }
}

export function toHashString(hashParams: HashParams): string {
  const components: string[] = []

  if (hashParams.profileURL) {
    components.push(`profileURL=${encodeURIComponent(hashParams.profileURL)}`)
  }
  if (hashParams.title) {
    components.push(`title=${encodeURIComponent(hashParams.title)}`)
  }
  if (hashParams.localProfilePath) {
    components.push(`localProfilePath=${encodeURIComponent(hashParams.localProfilePath)}`)
  }

  const viewModeSpecifier = getViewModeSpecifier(hashParams.viewMode)
  if (viewModeSpecifier) {
    components.push(`view=${encodeURIComponent(viewModeSpecifier)}`)
  }

  if (hashParams.importEngine && hashParams.importEngine !== 'legacy') {
    components.push(`importEngine=${encodeURIComponent(hashParams.importEngine)}`)
  }
  if (hashParams.compareImport) {
    components.push('compareImport=1')
  }

  return components.length > 0 ? `#${components.join('&')}` : ''
}

export function replaceHashParams(hashParams: HashParams) {
  if (typeof window === 'undefined') {
    return
  }

  const previousUrl = window.location.href
  const nextHash = toHashString(hashParams)
  if (typeof history !== 'undefined' && typeof history.replaceState === 'function') {
    history.replaceState(null, '', `${window.location.pathname}${window.location.search}${nextHash}`)
    if (typeof HashChangeEvent === 'function') {
      window.dispatchEvent(
        new HashChangeEvent('hashchange', {oldURL: previousUrl, newURL: window.location.href}),
      )
    } else {
      window.dispatchEvent(new Event('hashchange'))
    }
    return
  }

  window.location.hash = nextHash
}

export function getHashParams(hashContents = window.location.hash): HashParams {
  try {
    if (!hashContents.startsWith('#')) {
      return {}
    }
    const components = hashContents.substr(1).split('&')
    const result: HashParams = {}
    for (const component of components) {
      const parsedComponent = parseHashComponent(component)
      if (parsedComponent == null) {
        continue
      }

      const {key, value} = parsedComponent
      if (key === 'profileURL') {
        result.profileURL = value
      } else if (key === 'title') {
        result.title = value
      } else if (key === 'localProfilePath') {
        result.localProfilePath = value
      } else if (key === 'view') {
        const mode = getViewMode(value)
        if (mode !== null) {
          result.viewMode = mode
        } else {
          console.error(`Ignoring invalid view specifier: ${value}`)
        }
      } else if (key === 'importEngine') {
        const engine = normalizeImportEngine(value)
        if (engine !== null) {
          result.importEngine = engine
        } else {
          console.error(`Ignoring invalid import engine: ${value}`)
        }
      } else if (key === 'compareImport') {
        const compareImport = getBooleanHashValue(value)
        if (compareImport !== null) {
          result.compareImport = compareImport
        } else {
          console.error(`Ignoring invalid compareImport value: ${value}`)
        }
      }
    }
    return result
  } catch (e) {
    console.error(`Error when loading hash fragment.`)
    console.error(e)
    return {}
  }
}
