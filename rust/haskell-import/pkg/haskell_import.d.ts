/* tslint:disable */
/* eslint-disable */

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export function import_haskell_profile_json(profileJson: string): string;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly alloc: (size: number) => number;
  readonly free: (ptr: number, size: number) => void;
  readonly import_haskell_profile_json: (ptr: number, len: number) => number;
  readonly free_result: (ptr: number) => void;
}

export default function init(
  module_or_path?: {module_or_path: InitInput | Promise<InitInput>} | InitInput | Promise<InitInput>,
): Promise<InitOutput>;
