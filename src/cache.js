// Remembering the vector of every command already embedded.
//
// A long history is thousands of lines, and embedding all of them on every
// search is most of the wait. Only commands not seen before are embedded; the
// rest are read back from here.
//
// Keys are SHA-256 hashes, not the commands themselves. History holds
// passwords typed into the wrong place, server names and tokens, and a cache
// that quietly kept a second plain-text copy of it would be a new leak.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const CACHE_PATH = join(process.env.XDG_CACHE_HOME ?? join(homedir(), '.cache'), 'histfind', 'vectors.json')

const keyOf = (model, command) => createHash('sha256').update(`${model}\0${command}`).digest('hex')

// Stored as base64 float32 rather than JSON number arrays: a 1024-number
// vector is ~20 KB as JSON text and 5.5 KB this way, and 2,600 commands took
// the cache from 57 MB to about 14 MB.
const pack = (vector) => Buffer.from(new Float32Array(vector).buffer).toString('base64')
const unpack = (text) => {
  const bytes = Buffer.from(text, 'base64')
  return Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4))
}

export function loadCache () {
  try {
    return existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {}
  } catch {
    // A corrupt cache only costs one slow search, so it is rebuilt, not fatal.
    return {}
  }
}

/**
 * Vectors for every command, embedding only those missing from the cache.
 *
 * Entries for commands no longer in the history are dropped when the cache is
 * written back, so it never outgrows the history it mirrors.
 *
 * @param {string} model  Model name, part of the key: vectors from different
 *                        models are not comparable.
 * @param {(texts: string[]) => Promise<number[][]>} embedMissing
 * @returns {Promise<{vectors: number[][], embedded: number}>}
 */
export async function cachedVectors (model, commands, embedMissing) {
  const cache = loadCache()
  const keys = commands.map((command) => keyOf(model, command))
  const missing = [...new Set(keys.filter((key) => !cache[key]))]
  const missingCommands = missing.map((key) => commands[keys.indexOf(key)])

  const fresh = missing.length ? await embedMissing(missingCommands) : []
  missing.forEach((key, i) => { cache[key] = pack(fresh[i]) })

  const kept = Object.fromEntries(keys.map((key) => [key, cache[key]]))
  mkdirSync(dirname(CACHE_PATH), { recursive: true })
  writeFileSync(CACHE_PATH, JSON.stringify(kept), { mode: 0o600 })

  return { vectors: keys.map((key) => unpack(kept[key])), embedded: missing.length }
}
