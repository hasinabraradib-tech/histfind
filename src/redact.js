// Masking secrets before a command is printed.
//
// Search results end up on screen, in screen shares and in screenshots, and
// history is full of things typed once and forgotten: bearer tokens, database
// URLs with passwords, `export API_KEY=...`. Only what is shown is masked; the
// history file itself is never touched.

const MASK = '••••'

const RULES = [
  // Authorization: Bearer abc / Basic abc
  [/\b(Bearer|Basic|Token)\s+[^\s'"]+/gi, (_, scheme) => `${scheme} ${MASK}`],
  // scheme://user:password@host
  [/(\w+:\/\/[^\s:/@]+:)[^\s@]+@/g, (_, head) => `${head}${MASK}@`],
  // API_KEY=... / GITHUB_TOKEN=... / db_password=...
  [/\b([\w.-]*(?:token|secret|passw(?:or)?d|api[_-]?key|access[_-]?key|private[_-]?key)[\w.-]*)=(['"]?)[^\s'"]+\2/gi,
    (_, name, quote) => `${name}=${quote}${MASK}${quote}`],
  // --password hunter2 / --token=abc
  [/(--(?:password|passwd|token|secret|api-key|access-key)[= ])(['"]?)[^\s'"]+\2/gi,
    (_, flag, quote) => `${flag}${quote}${MASK}${quote}`],
  // Tokens recognisable by their prefix, wherever they appear.
  [/\b(ghp|gho|ghu|ghs|github_pat|glpat|xox[abpr]|sk|sk_live|sk_test|rk_live)[-_][A-Za-z0-9_-]{8,}/g, (_, prefix) => `${prefix}_${MASK}`],
  [/\bAKIA[0-9A-Z]{16}\b/g, () => `AKIA${MASK}`]
]

/** The command with anything that looks like a secret replaced by dots. */
export function redact (command) {
  return RULES.reduce((text, [pattern, replace]) => text.replace(pattern, replace), command)
}
