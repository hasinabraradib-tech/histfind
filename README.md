# histfind

Search your shell history by what a command *did*, not by what it said. You remember "that ffmpeg thing that made the lecture video smaller", not `-vcodec libx264 -crf 28`. `histfind` finds it.

```
$ npm run find -- "shrink a video file"

Closest to "shrink a video file" in 45 commands

  ffmpeg -i lecture.mov -vcodec libx264 -crf 28 lecture-small.mp4
  0.84 · used once, most recently 3 months ago
```

It runs entirely on your machine with Tether's [QVAC SDK](https://qvac.tether.io). Your shell history is full of server names, file paths and the odd password pasted into the wrong window, so it is exactly the kind of file that should not be sent to a cloud API. Nothing here makes a network call except the one-time model download.

## Requirements

- **Node.js** >= 22.17
- **A platform QVAC supports.** Built on macOS on Apple silicon. See the [QVAC system requirements](https://docs.qvac.tether.io/system-requirements/) for Linux and Windows.
- **Disk:** ~4.8 GB for `node_modules` (the SDK ships native engines for every modality) and 670 MB for the embedding model, downloaded once into `~/.qvac`.

## Install

```bash
git clone https://github.com/hasinabraradib-tech/histfind.git
cd histfind
npm install
```

## Run

Try it on the made-up history in `samples/` first:

```bash
npm run find -- "undo my last git commit" --history samples/zsh_history
```

Then on your own. With no `--history`, it reads `$HISTFILE`, then `~/.zsh_history`, then `~/.bash_history`:

```bash
npm run find -- "which program is using port 3000"
```

| Option | Default | |
|---|---|---|
| `--history <file>` | your shell's history | A zsh or bash history file. |
| `--top <n>` | `5` | How many commands to show. |
| `--show-secrets` | off | Print commands unmasked (see below). |

The first run downloads the model and embeds every command in your history; on 2,600 commands that took 11 seconds. After that only new commands are embedded, and the same search took 2 seconds.

## QVAC SDK version

**`@qvac/sdk` 0.19.1**, declared in `package.json`:

```json
"dependencies": {
  "@qvac/sdk": "^0.19.1"
}
```

## QVAC functions used

| Function | Used in | What it does here |
|---|---|---|
| `loadModel` | `src/cli.js` | Loads the GTE-large embedding model (`GTE_LARGE_FP16`). |
| `embed` | `src/search.js`, `src/cli.js` | Turns commands (64 per call) and your question into vectors. |
| `unloadModel`, `close` | `src/cli.js` | Frees the model and stops the SDK worker so the command exits. |

## How it works

1. **Read.** `src/history.js` parses zsh's extended format (`: 1700000000:0;git push`) and bash, joins commands that span several lines, and merges repeats while keeping how often and how recently each ran. It also undoes zsh's "metafied" encoding, without which any non-English text in your history comes out as garbage.
2. **Embed.** Each distinct command becomes a vector with `embed`.
3. **Cache.** `src/cache.js` stores the vectors in `~/.cache/histfind/vectors.json` so the next search only embeds what is new.
4. **Rank.** Your question is embedded the same way, and commands are ranked by cosine similarity.
5. **Mask.** `src/redact.js` hides secrets in what is printed.

## Privacy

- **Secrets are masked on screen.** Bearer tokens, passwords in URLs, `API_KEY=...`-style variables, `--password` flags and tokens with known prefixes (GitHub, GitLab, Slack, Stripe, AWS) are shown as `••••`. Results end up in screen shares and screenshots, and a command you typed once two years ago is easy to forget about. `--show-secrets` turns this off. Your history file is never modified.
- **The cache holds no commands.** Its keys are SHA-256 hashes of the commands, and it is written readable by your user only (`0600`). It never outgrows your history: entries for commands no longer in it are dropped.

## Accuracy

`npm run eval` runs 12 questions against the sample history, each with a known right answer (`test/queries.json`):

| | |
|---|---|
| Right command ranked first | 8 of 12 |
| Right command in the top 3 | 11 of 12 |

Where it misses, the reason is visible. "Undo my last git commit" ranks `git push` above `git reset --soft HEAD~1`: the embedding matches on how a command looks, and `git push` is short and all git. I tried having Llama 3.2 1B re-rank the top 8, and it scored the same 8 of 12 while adding seconds to every search, so it was left out.

## Limitations

- **Close is not always first.** Read the top three, not only the first line.
- **zsh and bash only.** fish keeps its history in a different format and is not read yet.
- **Commands are matched as written.** A question in plain words finds `lsof -i :3000`, but a command with no recognisable words, like a long custom alias, has little to match against.

## Project structure

```
histfind/
├── src/
│   ├── cli.js       npm run find
│   ├── history.js   Parsing zsh and bash history
│   ├── search.js    Embedding in batches and ranking
│   ├── cache.js     Vector cache under hashed keys
│   └── redact.js    Masking secrets in output
├── test/
│   ├── queries.json Questions with known answers
│   └── eval.js      npm run eval
└── samples/
    └── zsh_history  A made-up history to try it on
```

## License

[MIT](LICENSE)
