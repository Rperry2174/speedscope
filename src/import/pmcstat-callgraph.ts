import {Profile, FrameInfo, StackListProfileBuilder} from '../lib/profile'
import {parsePMCStatWithRust} from './import-parsers-rust'
import {TextFileContent} from './utils'

type PMCStatLine = {
  indent: number
  duration: number
  name: string
  file: string | null
}

function parsePMCStatLinesTs(contents: TextFileContent): PMCStatLine[] {
  const parsed: PMCStatLine[] = []
  for (const line of contents.splitLines()) {
    const match = /^( *)[\d.]+%  \[(\d+)\]\s*(\S+)(?: @ (.*))?$/.exec(line)
    if (!match) continue
    parsed.push({
      indent: match[1].length,
      duration: parseInt(match[2], 10),
      name: match[3],
      file: match[4] || null,
    })
  }
  return parsed
}

function buildPMCStatProfile(parsedLines: PMCStatLine[]): Profile | null {
  const profile = new StackListProfileBuilder()
  const stack: FrameInfo[] = []
  let file: string | undefined
  let prevDuration = 0
  let prevIndent = -1

  for (const line of parsedLines) {
    if (line.indent <= prevIndent) {
      const frames = stack.slice(0, prevIndent + 1).reverse()
      profile.appendSampleWithWeight(frames, prevDuration)
    }
    file = line.file || file
    stack[line.indent] = {key: line.name, name: line.name, file}
    prevDuration = line.duration
    prevIndent = line.indent
  }

  if (prevIndent === -1) return null
  const frames = stack.slice(0, prevIndent + 1).reverse()
  profile.appendSampleWithWeight(frames, prevDuration)
  return profile.build()
}

export function importFromPMCStatCallGraph(contents: TextFileContent): Profile | null {
  return importFromPMCStatCallGraphTs(contents)
}

export function importFromPMCStatCallGraphTs(contents: TextFileContent): Profile | null {
  return buildPMCStatProfile(parsePMCStatLinesTs(contents))
}

export async function importFromPMCStatCallGraphWithRust(
  contents: TextFileContent,
): Promise<Profile | null> {
  const rustParsed = await parsePMCStatWithRust(contents)
  if (rustParsed) {
    return buildPMCStatProfile(
      rustParsed.map(line => ({
        indent: line.indent,
        duration: line.duration,
        name: line.name,
        file: line.file ?? null,
      })),
    )
  }
  return importFromPMCStatCallGraphTs(contents)
}
