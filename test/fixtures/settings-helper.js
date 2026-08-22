import { createInterface } from 'node:readline'

process.stdout.write(`${JSON.stringify({ protocolVersion: 1, kind: 'ready' })}\n`)

let reported = false
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (!reported && message.kind !== 'shutdown') {
    reported = true
    process.stdout.write(`${JSON.stringify({
      protocolVersion: 1,
      kind: 'settings',
      scale: 0.6,
      bubbleScale: 0.9,
      reducedMotion: true,
    })}\n`)
  }
  if (message.kind === 'shutdown') process.exit(0)
})
