// Embedding commands and ranking them against a question.
import { embed } from '@qvac/sdk'

// Commands are sent to the model in groups rather than one call each: a few
// thousand history lines one at a time spend most of their time on the
// round trip to the SDK's worker, not on the embedding itself.
const BATCH_SIZE = 64

/**
 * One vector per text, in the same order.
 *
 * @param {(done: number, total: number) => void} [onProgress]
 * @returns {Promise<number[][]>}
 */
export async function embedAll (modelId, texts, onProgress = () => {}) {
  const vectors = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const { embedding } = await embed({ modelId, text: texts.slice(i, i + BATCH_SIZE) })
    vectors.push(...embedding)
    onProgress(Math.min(i + BATCH_SIZE, texts.length), texts.length)
  }
  return vectors
}

function cosine (a, b) {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * The `top` commands closest in meaning to the query vector.
 *
 * @returns {Array<{command: string, count: number, lastUsed: number|null, score: number}>}
 */
export function rank (queryVector, commands, vectors, top) {
  return commands
    .map((entry, i) => ({ ...entry, score: cosine(queryVector, vectors[i]) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, top)
}
