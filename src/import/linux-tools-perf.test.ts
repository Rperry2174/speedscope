import * as fs from 'fs'

import {checkProfileSnapshot} from '../lib/test-utils'
import {compareProfileGroups} from '../lib/profile-parity'
import {setExperimentOverridesForTesting} from '../lib/runtime-config'
import {importProfilesFromArrayBuffer} from '.'
import {withMockedFileChunkSizeForTests} from './utils'

describe('importFromLinuxPerf', () => {
  test('simple.linux-perf.txt', async () => {
    await checkProfileSnapshot('./sample/profiles/linux-perf/simple.linux-perf.txt')
  })
  test('one-sample.linux-perf.txt', async () => {
    await checkProfileSnapshot('./sample/profiles/linux-perf/one-sample.linux-perf.txt')
  })
  test('forks.linux-perf.txt', async () => {
    await checkProfileSnapshot('./sample/profiles/linux-perf/forks.linux-perf.txt')
  })
  test('simple-with-header.linux-perf.txt', async () => {
    await checkProfileSnapshot('./sample/profiles/linux-perf/simple-with-header.linux-perf.txt')
  })
  test('simple-with-pids.linux-perf.txt', async () => {
    await checkProfileSnapshot('./sample/profiles/linux-perf/simple-with-pid.linux-perf.txt')
  })
  test('system-wide.linux-perf.txt', async () => {
    await checkProfileSnapshot('./sample/profiles/linux-perf/system-wide.linux-perf.txt')
  })
  test('system-wide.linux-perf.txt chunked', async () => {
    await withMockedFileChunkSizeForTests(100, async () => {
      await checkProfileSnapshot('./sample/profiles/linux-perf/system-wide.linux-perf.txt')
    })
  })

  for (const fixturePath of [
    './sample/profiles/linux-perf/simple.linux-perf.txt',
    './sample/profiles/linux-perf/simple-with-pid.linux-perf.txt',
    './sample/profiles/linux-perf/system-wide.linux-perf.txt',
  ]) {
    test(`Rust importer preserves parity for ${fixturePath}`, async () => {
      const buffer = fs.readFileSync(fixturePath)
      const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

      setExperimentOverridesForTesting({rustLinuxPerf: false})
      const legacy = await importProfilesFromArrayBuffer('fixture.linux-perf.txt', arrayBuffer)

      setExperimentOverridesForTesting({rustLinuxPerf: true})
      const experimental = await importProfilesFromArrayBuffer('fixture.linux-perf.txt', arrayBuffer)

      setExperimentOverridesForTesting(null)

      expect(legacy).not.toBeNull()
      expect(experimental).not.toBeNull()
      expect(compareProfileGroups(legacy!, experimental!)).toEqual([])
    })
  }
})
