process.stdout.write(`${JSON.stringify({ protocolVersion: 1, kind: 'ready' })}\n`)
process.stdin.pause()
setInterval(() => {}, 1000)
