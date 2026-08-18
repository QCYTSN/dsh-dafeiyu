// Simulates a helper that can be spawned but is broken: it never sends READY
// and exits on its own. Used to prove the bounded-restart guard covers the
// "spawns then dies before readiness" case, not just missing binaries.
process.stdin.resume()
setTimeout(() => process.exit(17), 10)
