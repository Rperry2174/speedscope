function isNodeRuntime() {
  return typeof process !== 'undefined' && process.versions != null && process.versions.node != null
}

type NodeRequire = (specifier: string) => any

export function getNodeRequire(): NodeRequire {
  if (!isNodeRuntime()) {
    throw new Error('Node require is unavailable outside of a Node runtime')
  }

  const builtinModuleLoader = (process as any).getBuiltinModule as
    | ((specifier: string) => any)
    | undefined
  if (builtinModuleLoader) {
    return (specifier: string) => {
      const loaded = builtinModuleLoader(specifier)
      if (!loaded) {
        throw new Error(`Node builtin module "${specifier}" is unavailable in this runtime`)
      }
      return loaded
    }
  }

  const runtimeRequire = (0, eval)('require') as NodeRequire | undefined
  if (!runtimeRequire) {
    throw new Error('Node require is unavailable in this runtime')
  }
  return runtimeRequire
}

export function getNodeBuiltin<T = any>(specifier: string): T {
  return getNodeRequire()(specifier) as T
}

export function readNodeFileSync(path: string): Uint8Array {
  const fs = getNodeBuiltin<{readFileSync(path: string): Uint8Array}>('fs')
  return fs.readFileSync(path)
}

export function readFileSync(path: string): Uint8Array {
  return readNodeFileSync(path)
}

export function joinNodePath(...parts: string[]): string {
  const path = getNodeBuiltin<{join(...parts: string[]): string}>('path')
  return path.join(...parts)
}

export function resolveFromCwd(...parts: string[]): string {
  if (!isNodeRuntime()) {
    throw new Error('process.cwd() is unavailable outside of a Node runtime')
  }
  return joinNodePath(process.cwd(), ...parts)
}

export function resolveNodePath(...parts: string[]): string {
  return resolveFromCwd(...parts)
}

export function getNodeFsAndPath(): {
  fs: typeof import('fs')
  path: typeof import('path')
} {
  return {
    fs: getNodeBuiltin<typeof import('fs')>('fs'),
    path: getNodeBuiltin<typeof import('path')>('path'),
  }
}
