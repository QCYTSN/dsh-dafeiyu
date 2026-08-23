process.stdout.write(`${JSON.stringify({ protocolVersion: 1, kind: 'ready' })}\n`)
setTimeout(() => process.exit(1), 10)
