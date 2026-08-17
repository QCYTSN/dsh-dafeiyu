import { createInterface } from 'node:readline'

process.stdout.write(`${JSON.stringify({ protocolVersion: 1, kind: 'ready' })}\n`)

createInterface({ input: process.stdin }).once('line', () => {
  // Simulate a context-menu change in the helper window: report the new
  // setting value up to the DSH side.
  process.stdout.write(`${JSON.stringify({ protocolVersion: 1, kind: 'settings', showBubble: false })}\n`)
  setTimeout(() => process.exit(0), 20)
})