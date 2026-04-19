import * as esbuild from 'esbuild'
import {existsSync, mkdirSync} from 'fs'
import {buildOptions, generateIndexHtml} from './esbuild-shared'

function parseArgs() {
  const args = process.argv.slice(2)
  let outdir = 'dist'
  let importEngine: 'legacy' | 'experimental' | null = null
  let compareImport = false

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--outdir') {
      outdir = args[++i]
    } else if (arg === '--import-engine') {
      const value = args[++i]
      if (value === 'legacy' || value === 'experimental') {
        importEngine = value
      } else {
        throw new Error(`Unsupported import engine "${value}"`)
      }
    } else if (arg === '--compare-import') {
      compareImport = true
    }
  }

  return {outdir, importEngine, compareImport}
}

function buildDefaultHash(args: ReturnType<typeof parseArgs>) {
  const parts: string[] = []
  if (args.importEngine === 'experimental') {
    parts.push('importEngine=experimental')
  }
  if (args.compareImport) {
    parts.push('compareImport=1')
  }
  return parts.length > 0 ? `#${parts.join('&')}` : ''
}

async function main() {
  const args = parseArgs()
  const outdir = args.outdir
  if (!existsSync(outdir)) {
    mkdirSync(outdir)
  }
  let ctx = await esbuild.context({
    ...buildOptions,
    outdir,
    write: false,
    metafile: true,
    plugins: [
      {
        name: 'speedscope-dev-server',
        setup(build) {
          build.onEnd(buildResult => {
            generateIndexHtml({
              buildResult,
              outdir,
              servingProtocol: 'http',
              defaultHash: buildDefaultHash(args),
            })
          })
        },
      },
    ],
  })

  await ctx.rebuild()

  let {hosts, port} = await ctx.serve({
    servedir: outdir,
  })

  console.log(`Server is running at http://${hosts[0]}:${port}`)
}

main()
