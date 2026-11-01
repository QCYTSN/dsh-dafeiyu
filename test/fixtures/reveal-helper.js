import { createInterface } from 'node:readline'
import { appendFileSync } from 'node:fs'

process.stdout.write(`${JSON.stringify({ protocolVersion: 1, kind: 'ready' })}\n`)
let requested = false
createInterface({ input: process.stdin }).on('line', (line) => {
  const message = JSON.parse(line)
  if (message.kind === 'tasks' && message.tasks.length >= 2 && !requested) {
    requested = true
    process.stdout.write(`${JSON.stringify({ protocolVersion: 1, kind: 'reveal', sessionId: 'task-B' })}\n`)
  }
  if (message.kind === 'reveal-result') appendFileSync(process.argv[2], `${JSON.stringify(message)}\n`)
  if (message.kind === 'shutdown') process.exit(0)
})
