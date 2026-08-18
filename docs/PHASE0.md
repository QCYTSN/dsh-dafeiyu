# Phase 0 compatibility spike

## Pinned DSH baseline

- Repository: `deepseek-ai/deepseek-harness`
- Source version observed: `0.1.0-rc.7`
- npm runtime verified: `0.1.0-rc.7`
- Commit: `47f943859bef60e4160492346772ded9b24f765a`
- Required service: `sessions`
- Observed event bus: `ctx.on('session/event', (session, event) => ...)`

DSH is a developer preview. Only `src/index.js` imports the DSH runtime contract by
behavior. The reducer, protocol, and helper deliberately contain no DSH imports.

## Phase 0 contract

1. The DSH Host plugin starts the helper.
2. Session events are reduced to versioned companion messages.
3. Messages travel as newline-delimited JSON over child stdin.
4. The helper exits when it receives `shutdown` or when stdin closes.
5. Subagent sessions are ignored by default.
6. No model key, desktop metadata, telemetry, network listener, or fixed port is used.

For lifecycle automation, set `DSH_DAFEIYU_HEADLESS=1` and optionally
`DSH_DAFEIYU_EVENT_LOG=<absolute-jsonl-path>`. These flags are diagnostic only;
normal DSH startup opens the visual helper.

## Acceptance result (2026-08-14)

Verified on Windows against the published `@deepseek-ai/dsh@0.1.0-rc.7` runtime
in an isolated `DSH_HOME`:

1. `dsh plugin --profile bigfish-phase0 add D:\Github_Ku\dsh-dafeiyu` completed.
2. `dsh --profile bigfish-phase0 --dump-config` contained the enabled
   `dsh-dafeiyu` loader entry.
3. A real DSH host plus the test-only session driver produced the exact state
   sequence `IDLE -> THINKING -> WORKING -> SUCCESS` in the native helper.
4. Terminating the DSH host closed the helper stdin and left no helper process.
5. All eight Node tests and Python bytecode compilation passed.

The acceptance driver is exported only for verification and is never inserted
by the production bundle.

During the spike, a Windows-only integration failure exposed that Python had
decoded the JSONL pipe using the active console code page. The helper now pins
stdin/stdout/stderr to UTF-8, and the integration test includes Chinese status
text so this cannot silently regress.

## Phase 0 limitations that were closed in the MVP alpha

- The diagnostic shell was replaced by the allowlisted 49-frame BigFish runtime.
- The DSH WebUI now contributes its own settings card and persists through DSH settings.
- A PyInstaller Windows helper is included in the npm package, with an explicit readiness handshake.

## Remaining limitations

- Waiting-for-approval uses the portable `turn/end: blocked` signal only.
- The first release targets Windows; code signing and cross-platform package splitting are deferred.
