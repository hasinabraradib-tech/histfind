// Reading a shell history file into a list of distinct commands.
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

// Commands that say nothing on their own. "cd" alone is noise, but
// "cd ~/work/api" is kept: the argument is what someone searches for later.
const NOISE = new Set(['ls', 'll', 'la', 'cd', 'clear', 'pwd', 'exit', 'history', 'fg', 'bg', 'jobs', 'git status', 'git diff'])

/** The history file of the user's shell, or null when none is found. */
export function defaultHistoryPath () {
  const candidates = [
    process.env.HISTFILE,
    join(homedir(), '.zsh_history'),
    join(homedir(), '.bash_history')
  ]
  return candidates.find((path) => path && existsSync(path)) ?? null
}

/**
 * Undo zsh's "metafied" encoding.
 *
 * zsh writes some bytes of non-ASCII text as 0x83 followed by the byte XOR 32,
 * so reading the file as plain UTF-8 turns every accented letter or non-Latin
 * script into garbage. This restores the original bytes first.
 */
function unmetafy (buffer) {
  const out = Buffer.alloc(buffer.length)
  let length = 0
  for (let i = 0; i < buffer.length; i++) {
    if (buffer[i] === 0x83 && i + 1 < buffer.length) out[length++] = buffer[++i] ^ 32
    else out[length++] = buffer[i]
  }
  return out.subarray(0, length).toString('utf8')
}

/**
 * Split history text into commands with the time they ran, when known.
 *
 * Handles both zsh's extended format (": 1700000000:0;git push") and bash,
 * which is one command per line with optional "#1700000000" lines before
 * each when HISTTIMEFORMAT is set. A zsh command spanning several lines ends
 * each line but the last with a backslash.
 *
 * @returns {Array<{command: string, time: number | null}>}
 */
export function parseHistory (text) {
  const entries = []
  let pendingTime = null
  let current = null

  for (const line of text.split('\n')) {
    if (current) {
      current.command += `\n${line}`
      if (!line.endsWith('\\')) current = null
      continue
    }

    const zsh = line.match(/^: (\d+):\d+;(.*)$/)
    const bashTime = line.match(/^#(\d{9,})$/)

    if (bashTime) {
      pendingTime = Number(bashTime[1])
      continue
    }

    const entry = zsh
      ? { command: zsh[2], time: Number(zsh[1]) }
      : { command: line, time: pendingTime }
    pendingTime = null

    if (!entry.command.trim()) continue
    entries.push(entry)
    if (entry.command.endsWith('\\')) current = entry
  }

  return entries.map((e) => ({ ...e, command: e.command.trim() }))
}

/**
 * Every distinct command in a history file, most recently used first.
 *
 * Repeats are merged, keeping how often and how recently each was run, so a
 * search is not flooded with forty copies of the same `git push`.
 *
 * @returns {Array<{command: string, count: number, lastUsed: number | null}>}
 */
export function readHistory (path) {
  const byCommand = new Map()

  for (const { command, time } of parseHistory(unmetafy(readFileSync(path)))) {
    if (command.length < 3 || NOISE.has(command)) continue
    const seen = byCommand.get(command)
    if (seen) {
      seen.count++
      if (time !== null && (seen.lastUsed === null || time > seen.lastUsed)) seen.lastUsed = time
    } else {
      byCommand.set(command, { command, count: 1, lastUsed: time })
    }
  }

  return [...byCommand.values()].sort((a, b) => (b.lastUsed ?? 0) - (a.lastUsed ?? 0))
}
