// How often the right command comes first. `npm run eval`
//
// Each query in queries.json names a fragment of the command a person asking
// it would want. Run against the sample history, so the numbers in the README
// can be reproduced by anyone.
import { loadModel, embed, unloadModel, close, GTE_LARGE_FP16 } from '@qvac/sdk'
import { readFileSync } from 'node:fs'
import { readHistory } from '../src/history.js'
import { embedAll, rank } from '../src/search.js'

const cases = JSON.parse(readFileSync(new URL('./queries.json', import.meta.url), 'utf8'))
const commands = readHistory(new URL('../samples/zsh_history', import.meta.url).pathname)

const modelId = await loadModel({ modelSrc: GTE_LARGE_FP16 })
try {
  const vectors = await embedAll(modelId, commands.map((c) => c.command))
  let first = 0
  let top3 = 0
  for (const { query, expect } of cases) {
    const { embedding } = await embed({ modelId, text: query })
    const hits = rank(embedding, commands, vectors, 3)
    const at = hits.findIndex((h) => h.command.includes(expect))
    if (at === 0) first++
    if (at >= 0) top3++
    console.log(`${at === 0 ? '✓' : at > 0 ? `${at + 1}` : '✗'}  ${query}  →  ${hits[0].command.split('\n')[0]}`)
  }
  console.log(`\nfirst: ${first}/${cases.length}   in top 3: ${top3}/${cases.length}`)
} finally {
  await unloadModel({ modelId }).catch(() => {})
  await close().catch(() => {})
}
