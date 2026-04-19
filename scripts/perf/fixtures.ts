import * as path from 'path'

export interface PerfFixture {
  id: string
  label: string
  relativePath: string
  format: string
}

export const FIXTURES: PerfFixture[] = [
  {
    id: 'chrome-timeline-large',
    label: 'Chrome timeline (65 large)',
    relativePath: 'sample/profiles/Chrome/65/timeline.json',
    format: 'chrome-timeline',
  },
  {
    id: 'firefox-large',
    label: 'Firefox profile (59 large)',
    relativePath: 'sample/profiles/Firefox/59/firefox.json',
    format: 'firefox',
  },
  {
    id: 'instruments-random-allocations',
    label: 'Instruments deep copy (16.0)',
    relativePath: 'sample/profiles/Instruments/16.0/simple-time-profile-deep-copy.txt',
    format: 'instruments-deep-copy',
  },
  {
    id: 'stackprof-ruby-large',
    label: 'Ruby stackprof (large)',
    relativePath: 'sample/profiles/stackprof/ruby-stackprof.json',
    format: 'stackprof',
  },
  {
    id: 'chrome-cpuprofile-sucrase',
    label: 'Chrome CPU profile (sucrase)',
    relativePath: 'sample/profiles/Chrome/65/sucrase.cpuprofile',
    format: 'chrome-cpu-profile',
  },
  {
    id: 'chrome-trace-116',
    label: 'Chrome trace object (116)',
    relativePath: 'sample/profiles/Chrome/116/Trace-20230603T221323.json',
    format: 'chrome-trace-object',
  },
]

export function getFixtureById(id: string): PerfFixture {
  const fixture = FIXTURES.find(entry => entry.id === id)
  if (!fixture) {
    throw new Error(`Unknown fixture id "${id}"`)
  }
  return fixture
}

export function resolveFixturePath(repoRoot: string, fixture: PerfFixture): string {
  return path.join(repoRoot, fixture.relativePath)
}

export function getFixturePath(fixture: PerfFixture): string {
  return resolveFixturePath(process.cwd(), fixture)
}

export function loadRepresentativeFixtures(): PerfFixture[] {
  return FIXTURES.slice()
}
