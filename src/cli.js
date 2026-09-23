#!/usr/bin/env node
// Search your shell history by meaning. `npm run find -- "what you remember"`
import { loadModel, embed, unloadModel, close, GTE_LARGE_FP16 } from '@qvac/sdk'
import { parseArgs } from 'node:util'
import { existsSync } from 'node:fs'
import { defaultHistoryPath, readHistory } from './history.js'
import { embedAll, rank } from './search.js'

const USAGE = 'Usage: npm run find -- "what you remember" [--history <file>] [--top <n>]'

const tty = process.stdout.isTTY
const dim = (text) => (tty ? `\x1b[2m${text}\x1b[0m` : text)
const bold = (text) => (tty ? `\x1b[1m${text}\x1b[0m` : text)
const status = (text) => process.stderr.write(process.stderr.isTTY ? `\r  ${text}\x1b[K` : `  ${text}\n`)

function describeUse ({ count, lastUsed }) {
  const times = count === 1 ? 'used once' : `used ${count} times`
  if (lastUsed === null) return times
  const days = Math.floor((Date.now() / 1000 - lastUsed) / 86400)
  const when = days < 1 ? 'today' : days === 1 ? 'yesterday' : days < 60 ? `${days} days ago` : `${Math.floor(days / 30)} months ago`
  return `${times}, most recently ${when}`
}

let modelId

try {
  const { values, positionals } = parseArgs({
    options: {
      history: { type: 'string' },
      top: { type: 'string', default: '5' }
    },
    allowPositionals: true
  })

  const query = positionals.join(' ').trim()
  const top = Number.parseInt(values.top, 10)
  if (!query || !(top > 0)) throw new Error(USAGE)

  const historyPath = values.history ?? defaultHistoryPath()
  if (!historyPath || !existsSync(historyPath)) {
    throw new Error(`No history file found${values.history ? ` at ${values.history}` : ''}. Pass one with --history <file>.`)
  }

  const commands = readHistory(historyPath)
  if (commands.length === 0) throw new Error(`No commands in ${historyPath}`)

  // The model runs on this machine. The first run downloads it into ~/.qvac;
  // after that, nothing in your history ever leaves the computer.
  modelId = await loadModel({
    modelSrc: GTE_LARGE_FP16,
    onProgress: ({ percentage }) => status(`loading model ${Math.floor(percentage)}%`)
  })

  const vectors = await embedAll(modelId, commands.map((c) => c.command), (done, total) => {
    status(`reading ${done}/${total} commands`)
  })
  const { embedding: queryVector } = await embed({ modelId, text: query })
  if (process.stderr.isTTY) process.stderr.write('\r\x1b[K')

  console.log(`\n${bold('Closest to')} "${query}" ${dim(`in ${commands.length} commands`)}\n`)
  for (const hit of rank(queryVector, commands, vectors, top)) {
    const lines = hit.command.split('\n')
    console.log(`  ${lines[0]}${lines.slice(1).map((l) => `\n  ${l}`).join('')}`)
    console.log(`  ${dim(`${hit.score.toFixed(2)} · ${describeUse(hit)}`)}\n`)
  }
} catch (error) {
  console.error(`\n  ${error?.message ?? error}`)
  process.exitCode = 1
} finally {
  if (modelId) await unloadModel({ modelId }).catch(() => {})
  await close().catch(() => {})
}
