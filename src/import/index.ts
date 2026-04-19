import {Profile, ProfileGroup} from '../lib/profile'

import {
  importFromChromeCPUProfile,
  importFromChromeTimeline,
  isChromeTimeline,
  importFromOldV8CPUProfile,
  isChromeTimelineObject,
} from './chrome'
import {importFromStackprof} from './stackprof'
import {importFromInstrumentsDeepCopy, importFromInstrumentsTrace} from './instruments'
import {importFromBGFlameGraph} from './bg-flamegraph'
import {importFromFirefox} from './firefox'
import {importSpeedscopeProfiles} from '../lib/file-format'
import {importFromV8ProfLog} from './v8proflog'
import {importFromLinuxPerf} from './linux-tools-perf'
import {importFromHaskell} from './haskell'
import {importFromSafari} from './safari'
import {ProfileDataSource, TextProfileDataSource, MaybeCompressedDataReader} from './utils'
import {importAsPprofProfile} from './pprof'
import {decodeBase64WithBestAvailableImplementation} from '../lib/base64-decoder-rust'
import {importFromChromeHeapProfile} from './v8heapalloc'
import {isTraceEventFormatted, importTraceEvents} from './trace-event'
import {importFromCallgrind} from './callgrind'
import {importFromPapyrus} from './papyrus'
import {importFromPMCStatCallGraph} from './pmcstat-callgraph'
type JfrModule = typeof import('./java-flight-recorder')

let jfrModulePromise: Promise<JfrModule> | null = null

async function loadJfrModule(): Promise<JfrModule> {
  if (!jfrModulePromise) {
    jfrModulePromise = import('./java-flight-recorder')
  }
  return jfrModulePromise
}
import {annotatePerfRun, notePerfMilestone, timePerfAsync, timePerfSync} from '../lib/perf'

export async function importProfileGroupFromText(
  fileName: string,
  contents: string,
): Promise<ProfileGroup | null> {
  return await importProfileGroup(new TextProfileDataSource(fileName, contents))
}

export async function importProfileGroupFromBase64(
  fileName: string,
  b64contents: string,
): Promise<ProfileGroup | null> {
  const decodedBytes = await decodeBase64WithBestAvailableImplementation(b64contents)
  return await importProfileGroup(
    MaybeCompressedDataReader.fromArrayBuffer(
      fileName,
      decodedBytes.buffer as ArrayBuffer,
    ),
  )
}

export async function importProfilesFromFile(file: File): Promise<ProfileGroup | null> {
  return importProfileGroup(MaybeCompressedDataReader.fromFile(file))
}

export async function importProfilesFromArrayBuffer(
  fileName: string,
  buffer: ArrayBuffer,
): Promise<ProfileGroup | null> {
  return importProfileGroup(MaybeCompressedDataReader.fromArrayBuffer(fileName, buffer))
}

async function importProfileGroup(dataSource: ProfileDataSource): Promise<ProfileGroup | null> {
  const fileName = await dataSource.name()
  annotatePerfRun('file_name', fileName)
  updateFormatGuess(fileName)

  const profileGroup = await timePerfAsync('import_profile_group_total', () =>
    _importProfileGroup(dataSource),
  )
  if (profileGroup) {
    if (!profileGroup.name) {
      profileGroup.name = fileName
    }
    for (let profile of profileGroup.profiles) {
      if (profile && !profile.getName()) {
        profile.setName(fileName)
      }
    }
    return profileGroup
  }
  return null
}

function toGroup(profile: Profile | null): ProfileGroup | null {
  if (!profile) return null
  return {name: profile.getName(), indexToView: 0, profiles: [profile]}
}

function updateFormatGuess(fileName: string) {
  const format =
    fileName.endsWith('.speedscope.json')
      ? 'speedscope'
      : fileName.endsWith('.stackprof.json')
        ? 'stackprof'
        : fileName.endsWith('.jfr')
          ? 'jfr'
          : fileName.endsWith('.heapprofile')
            ? 'heapprofile'
            : fileName.endsWith('.linux-perf.txt')
              ? 'linux-perf'
              : fileName.endsWith('.collapsedstack.txt')
                ? 'collapsedstack'
                : fileName.startsWith('callgrind.')
                  ? 'callgrind'
                  : /Trace-\d{8}T\d{6}/.exec(fileName) || fileName.endsWith('.chrome.json')
                    ? 'chrome-timeline'
                    : /Profile-\d{8}T\d{6}/.exec(fileName)
                      ? 'chrome-timeline'
                      : fileName.endsWith('.instruments.txt')
                        ? 'instruments-deep-copy'
                        : fileName.endsWith('.pmcstat.graph')
                          ? 'pmcstat'
                          : fileName.endsWith('-recording.json')
                            ? 'safari'
                            : 'unknown'
  annotatePerfRun('format_guess', format)
}

function parseJSON(contents: ReturnType<ProfileDataSource['readAsText']> extends Promise<infer T>
  ? T
  : never) {
  return timePerfSync('parse_json_dispatch', () => contents.parseAsJSON())
}

async function _importProfileGroup(dataSource: ProfileDataSource): Promise<ProfileGroup | null> {
  const fileName = await dataSource.name()

  const buffer = await timePerfAsync('read_array_buffer', () => dataSource.readAsArrayBuffer())

  {
    const profile = timePerfSync('import_pprof_probe', () => importAsPprofProfile(buffer))
    if (profile) {
      console.log('Importing as protobuf encoded pprof file')
      annotatePerfRun('detected_format', 'pprof')
      notePerfMilestone('import_parse_finished')
      return toGroup(profile)
    }
  }

  const contents = await timePerfAsync('read_text', () => dataSource.readAsText())

  // First pass: Check known file format names to infer the file type
  if (fileName.endsWith('.speedscope.json')) {
    console.log('Importing as speedscope json file')
    annotatePerfRun('detected_format', 'speedscope')
    const result = timePerfSync('import_speedscope_json', () => importSpeedscopeProfiles(parseJSON(contents)))
    notePerfMilestone('import_parse_finished')
    return result
  } else if (/Trace-\d{8}T\d{6}/.exec(fileName)) {
    console.log('Importing as Chrome Timeline Object')
    annotatePerfRun('detected_format', 'chrome-timeline-object')
    const parsed = parseJSON(contents)
    const result = timePerfSync('import_chrome_timeline_object', () =>
      importFromChromeTimeline(parsed.traceEvents, fileName),
    )
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.chrome.json') || /Profile-\d{8}T\d{6}/.exec(fileName)) {
    console.log('Importing as Chrome Timeline')
    annotatePerfRun('detected_format', 'chrome-timeline')
    const result = timePerfSync('import_chrome_timeline', () =>
      importFromChromeTimeline(parseJSON(contents), fileName),
    )
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.stackprof.json')) {
    console.log('Importing as stackprof profile')
    annotatePerfRun('detected_format', 'stackprof')
    const result = timePerfSync('import_stackprof', () => toGroup(importFromStackprof(parseJSON(contents))))
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.instruments.txt')) {
    console.log('Importing as Instruments.app deep copy')
    annotatePerfRun('detected_format', 'instruments-deep-copy')
    const result = timePerfSync('import_instruments_deep_copy', () =>
      toGroup(importFromInstrumentsDeepCopy(contents)),
    )
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.linux-perf.txt')) {
    console.log('Importing as output of linux perf script')
    annotatePerfRun('detected_format', 'linux-perf')
    const result = timePerfSync('import_linux_perf', () => importFromLinuxPerf(contents))
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.collapsedstack.txt')) {
    console.log('Importing as collapsed stack format')
    annotatePerfRun('detected_format', 'collapsedstack')
    const result = timePerfSync('import_collapsed_stack', () =>
      toGroup(importFromBGFlameGraph(contents)),
    )
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.v8log.json')) {
    console.log('Importing as --prof-process v8 log')
    annotatePerfRun('detected_format', 'v8log')
    const result = timePerfSync('import_v8log', () => toGroup(importFromV8ProfLog(parseJSON(contents))))
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.heapprofile')) {
    console.log('Importing as Chrome Heap Profile')
    annotatePerfRun('detected_format', 'heapprofile')
    const result = timePerfSync('import_heapprofile', () =>
      toGroup(importFromChromeHeapProfile(parseJSON(contents))),
    )
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('-recording.json')) {
    console.log('Importing as Safari profile')
    annotatePerfRun('detected_format', 'safari')
    const result = timePerfSync('import_safari', () => toGroup(importFromSafari(parseJSON(contents))))
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.startsWith('callgrind.')) {
    console.log('Importing as Callgrind profile')
    annotatePerfRun('detected_format', 'callgrind')
    const result = timePerfSync('import_callgrind', () => importFromCallgrind(contents, fileName))
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.pmcstat.graph')) {
    console.log('Importing as pmcstat callgraph format')
    annotatePerfRun('detected_format', 'pmcstat')
    const result = timePerfSync('import_pmcstat', () => toGroup(importFromPMCStatCallGraph(contents)))
    notePerfMilestone('import_parse_finished')
    return result
  } else if (fileName.endsWith('.jfr')) {
    console.log('Importing as Java Flight Recorder profile')
    annotatePerfRun('detected_format', 'jfr')
    const result = await timePerfAsync('import_jfr', async () => {
      const jfr = await loadJfrModule()
      return jfr.importFromJfr(fileName, buffer)
    })
    notePerfMilestone('import_parse_finished')
    return result
  }

  // Second pass: Try to guess what file format it is based on structure
  let parsed: any
  try {
    parsed = parseJSON(contents)
  } catch (e) {}
  if (parsed) {
    if (parsed['$schema'] === 'https://www.speedscope.app/file-format-schema.json') {
      console.log('Importing as speedscope json file')
      annotatePerfRun('detected_format', 'speedscope')
      const result = timePerfSync('import_speedscope_json', () => importSpeedscopeProfiles(parsed))
      notePerfMilestone('import_parse_finished')
      return result
    } else if (parsed['systemHost'] && parsed['systemHost']['name'] == 'Firefox') {
      console.log('Importing as Firefox profile')
      annotatePerfRun('detected_format', 'firefox')
      const result = timePerfSync('import_firefox', () => toGroup(importFromFirefox(parsed)))
      notePerfMilestone('import_parse_finished')
      return result
    } else if (isChromeTimeline(parsed)) {
      console.log('Importing as Chrome Timeline')
      annotatePerfRun('detected_format', 'chrome-timeline')
      const result = timePerfSync('import_chrome_timeline', () =>
        importFromChromeTimeline(parsed, fileName),
      )
      notePerfMilestone('import_parse_finished')
      return result
    } else if (isChromeTimelineObject(parsed)) {
      console.log('Importing as Chrome Timeline Object')
      annotatePerfRun('detected_format', 'chrome-timeline-object')
      const result = timePerfSync('import_chrome_timeline_object', () =>
        importFromChromeTimeline(parsed.traceEvents, fileName),
      )
      notePerfMilestone('import_parse_finished')
      return result
    } else if ('nodes' in parsed && 'samples' in parsed && 'timeDeltas' in parsed) {
      console.log('Importing as Chrome CPU Profile')
      annotatePerfRun('detected_format', 'chrome-cpu-profile')
      const result = timePerfSync('import_chrome_cpu_profile', () =>
        toGroup(importFromChromeCPUProfile(parsed)),
      )
      notePerfMilestone('import_parse_finished')
      return result
    } else if (isTraceEventFormatted(parsed)) {
      console.log('Importing as Trace Event Format profile')
      annotatePerfRun('detected_format', 'trace-event')
      const result = timePerfSync('import_trace_event', () => importTraceEvents(parsed))
      notePerfMilestone('import_parse_finished')
      return result
    } else if ('head' in parsed && 'samples' in parsed && 'timestamps' in parsed) {
      console.log('Importing as Chrome CPU Profile (old format)')
      annotatePerfRun('detected_format', 'chrome-cpu-profile-old')
      const result = timePerfSync('import_old_v8_cpu_profile', () =>
        toGroup(importFromOldV8CPUProfile(parsed)),
      )
      notePerfMilestone('import_parse_finished')
      return result
    } else if ('mode' in parsed && 'frames' in parsed && 'raw_timestamp_deltas' in parsed) {
      console.log('Importing as stackprof profile')
      annotatePerfRun('detected_format', 'stackprof')
      const result = timePerfSync('import_stackprof', () => toGroup(importFromStackprof(parsed)))
      notePerfMilestone('import_parse_finished')
      return result
    } else if ('code' in parsed && 'functions' in parsed && 'ticks' in parsed) {
      console.log('Importing as --prof-process v8 log')
      annotatePerfRun('detected_format', 'v8log')
      const result = timePerfSync('import_v8log', () => toGroup(importFromV8ProfLog(parsed)))
      notePerfMilestone('import_parse_finished')
      return result
    } else if ('head' in parsed && 'selfSize' in parsed['head']) {
      console.log('Importing as Chrome Heap Profile')
      annotatePerfRun('detected_format', 'heapprofile')
      const result = timePerfSync('import_heapprofile', () =>
        toGroup(importFromChromeHeapProfile(parsed)),
      )
      notePerfMilestone('import_parse_finished')
      return result
    } else if ('rts_arguments' in parsed && 'initial_capabilities' in parsed) {
      console.log('Importing as Haskell GHC JSON Profile')
      annotatePerfRun('detected_format', 'haskell')
      const result = await timePerfAsync('import_haskell', () => importFromHaskell(parsed))
      notePerfMilestone('import_parse_finished')
      return result
    } else if ('recording' in parsed && 'sampleStackTraces' in parsed.recording) {
      console.log('Importing as Safari profile')
      annotatePerfRun('detected_format', 'safari')
      const result = timePerfSync('import_safari', () => toGroup(importFromSafari(parsed)))
      notePerfMilestone('import_parse_finished')
      return result
    }
  } else {
    // Format is not JSON

    // If the first line is "# callgrind format", it's probably in Callgrind
    // Profile Format.
    if (
      /^# callgrind format/.exec(contents.firstChunk()) ||
      (/^events:/m.exec(contents.firstChunk()) && /^fn=/m.exec(contents.firstChunk()))
    ) {
      console.log('Importing as Callgrind profile')
      annotatePerfRun('detected_format', 'callgrind')
      const result = timePerfSync('import_callgrind', () => importFromCallgrind(contents, fileName))
      notePerfMilestone('import_parse_finished')
      return result
    }

    // If the first line contains "Symbol Name", preceded by a tab, it's probably
    // a deep copy from OS X Instruments.app
    if (/^[\w \t\(\)]*\tSymbol Name/.exec(contents.firstChunk())) {
      console.log('Importing as Instruments.app deep copy')
      annotatePerfRun('detected_format', 'instruments-deep-copy')
      const result = timePerfSync('import_instruments_deep_copy', () =>
        toGroup(importFromInstrumentsDeepCopy(contents)),
      )
      notePerfMilestone('import_parse_finished')
      return result
    }

    if (/^(Stack_|Script_|Obj_)\S+ log opened \(PC\)\n/.exec(contents.firstChunk())) {
      console.log('Importing as Papyrus profile')
      annotatePerfRun('detected_format', 'papyrus')
      const result = timePerfSync('import_papyrus', () => toGroup(importFromPapyrus(contents)))
      notePerfMilestone('import_parse_finished')
      return result
    }

    const jfr = await loadJfrModule()
    if (jfr.isJfrRecording(buffer)) {
      console.log('Importing as Java Flight Recorder profile')
      annotatePerfRun('detected_format', 'jfr')
      const result = await timePerfAsync('import_jfr', () => jfr.importFromJfr(fileName, buffer))
      notePerfMilestone('import_parse_finished')
      return result
    }

    const fromLinuxPerf = timePerfSync('import_linux_perf_probe', () => importFromLinuxPerf(contents))
    if (fromLinuxPerf) {
      console.log('Importing from linux perf script output')
      annotatePerfRun('detected_format', 'linux-perf')
      notePerfMilestone('import_parse_finished')
      return fromLinuxPerf
    }

    const fromBGFlameGraph = timePerfSync('import_collapsed_stack_probe', () =>
      importFromBGFlameGraph(contents),
    )
    if (fromBGFlameGraph) {
      console.log('Importing as collapsed stack format')
      annotatePerfRun('detected_format', 'collapsedstack')
      notePerfMilestone('import_parse_finished')
      return toGroup(fromBGFlameGraph)
    }

    const fromPMCStatCallGraph = timePerfSync('import_pmcstat_probe', () =>
      importFromPMCStatCallGraph(contents),
    )
    if (fromPMCStatCallGraph) {
      console.log('Importing as pmcstat callgraph format')
      annotatePerfRun('detected_format', 'pmcstat')
      notePerfMilestone('import_parse_finished')
      return toGroup(fromPMCStatCallGraph)
    }
  }

  // Unrecognized format
  return null
}

export async function importFromFileSystemDirectoryEntry(entry: FileSystemDirectoryEntry) {
  return importFromInstrumentsTrace(entry)
}
