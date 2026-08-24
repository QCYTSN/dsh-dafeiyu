import assert from 'node:assert/strict'
import test from 'node:test'
import { CompanionReducer, isUserQuestionTool, toolActivity } from '../src/companion-reducer.js'
import { CompanionMessageKind, CompanionState } from '../src/protocol.js'

const session = { header: { id: 'session-main' } }

function event(type, data = {}, seq = 0) {
  return { type, data, seq, time: Date.now() }
}

test('turn and tool events produce stable companion states', () => {
  const reducer = new CompanionReducer()
  assert.equal(reducer.handle(session, event('turn/start', { turn: 1 }, 1))[0].state, CompanionState.THINKING)

  const working = reducer.handle(session, event('tool/call', {
    turn: 1,
    step: 1,
    callId: 'call-1',
    name: 'shell_command',
  }, 2))[0]
  assert.equal(working.state, CompanionState.WORKING)
  assert.equal(working.activity, 'commanding')

  const thinking = reducer.handle(session, event('tool/result', {
    turn: 1,
    step: 1,
    message: { toolCallId: 'call-1' },
  }, 3))[0]
  assert.equal(thinking.state, CompanionState.THINKING)

  const complete = reducer.handle(session, event('turn/end', {
    turn: 1,
    reason: { kind: 'completed' },
  }, 4))[0]
  assert.equal(complete.kind, CompanionMessageKind.PULSE)
  assert.equal(complete.state, CompanionState.SUCCESS)
  assert.equal(complete.resumeState, CompanionState.IDLE)
})

test('assistant chunks keep one stable thinking message within the same phase', () => {
  const reducer = new CompanionReducer()
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))

  const [thinking] = reducer.handle(session, event('assistant/chunk', {
    message: { content: '第一段' },
  }, 2))
  assert.equal(thinking.state, CompanionState.THINKING)
  assert.equal(thinking.phase, 'thinking')

  assert.deepEqual(reducer.handle(session, event('assistant/chunk', {
    message: { content: '第二段' },
  }, 3)), [])
  assert.deepEqual(reducer.handle(session, event('assistant/message', {
    message: { content: '完整消息' },
  }, 4)), [])
})

test('request headers show the effective reasoning effort across later states', () => {
  const reducer = new CompanionReducer()
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))

  const [withEffort] = reducer.handle(session, event('request/header', {
    header: {
      config: {
        provider: 'deepseek',
        model: 'deepseek-chat',
        reasoningEffort: 'high',
      },
      adapterDefaults: { reasoningEffort: true },
    },
    reason: 'initial',
  }, 2))
  assert.equal(withEffort.reasoningEffort, 'high')
  assert.match(withEffort.detail, /推理 high/u)

  const [working] = reducer.handle(session, event('tool/call', {
    callId: 'reasoning-work',
    name: 'apply_patch',
  }, 3))
  assert.equal(working.reasoningEffort, 'high')
  assert.match(working.detail, /推理 high/u)

  assert.deepEqual(reducer.handle(session, event('request/header', {
    header: { config: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' } },
    reason: 'change',
  }, 4)), [])
})

test('request headers clear the reasoning label for models without an effort', () => {
  const reducer = new CompanionReducer()
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))
  reducer.handle(session, event('request/header', {
    header: { config: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'max' } },
    reason: 'initial',
  }, 2))

  const [withoutEffort] = reducer.handle(session, event('request/header', {
    header: { config: { provider: 'mock', model: 'no-reasoning' } },
    reason: 'change',
  }, 3))
  assert.equal(withoutEffort.reasoningEffort, undefined)
  assert.doesNotMatch(withoutEffort.detail, /推理/u)
})

test('real DSH tool result callId paths clear completed tools', () => {
  const reducer = new CompanionReducer()
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))
  reducer.handle(session, event('tool/call', { callId: 'source-call', name: 'read_file' }, 2))

  const [afterSourceResult] = reducer.handle(session, event('tool/result', {
    message: { source: { callId: 'source-call' } },
  }, 3))
  assert.equal(afterSourceResult.state, CompanionState.THINKING)

  reducer.handle(session, event('tool/call', { callId: 'content-call', name: 'shell_command' }, 4))
  const [afterContentResult] = reducer.handle(session, event('tool/result', {
    message: { content: [{ type: 'tool-result', toolCallId: 'content-call' }] },
  }, 5))
  assert.equal(afterContentResult.state, CompanionState.THINKING)
})

test('question tools show waiting and resume on result or user response', () => {
  const reducer = new CompanionReducer()
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))

  const [waitingForResult] = reducer.handle(session, event('tool/call', {
    callId: 'question-one',
    name: 'ask_user_question',
  }, 2))
  assert.equal(waitingForResult.state, CompanionState.WAITING)
  assert.equal(waitingForResult.stage, '等待确认')

  assert.deepEqual(reducer.handle(session, event('tool/result', {
    message: { source: { callId: 'unrelated-call' } },
  }, 3)), [])

  const [resumedFromResult] = reducer.handle(session, event('tool/result', {
    message: { source: { callId: 'question-one' } },
  }, 4))
  assert.equal(resumedFromResult.state, CompanionState.THINKING)

  const [waitingForUser] = reducer.handle(session, event('tool/call', {
    callId: 'question-two',
    name: 'request_user_input',
  }, 5))
  assert.equal(waitingForUser.state, CompanionState.WAITING)

  const [resumedFromUser] = reducer.handle(session, event('user/message', {
    message: { content: '继续' },
  }, 6))
  assert.equal(resumedFromUser.state, CompanionState.THINKING)
})

test('exit_plan_mode waits for plan approval without matching ordinary planning tools', () => {
  const reducer = new CompanionReducer()
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))

  const [planning] = reducer.handle(session, event('tool/call', {
    callId: 'plan-enter',
    name: 'enter_plan_mode',
  }, 2))
  assert.equal(planning.state, CompanionState.WORKING)
  reducer.handle(session, event('tool/result', {
    message: { source: { callId: 'plan-enter' } },
  }, 3))

  const [waiting] = reducer.handle(session, event('tool/call', {
    callId: 'plan-exit',
    name: 'exit_plan_mode',
  }, 4))
  assert.equal(waiting.state, CompanionState.WAITING)
  assert.equal(waiting.stage, '等待确认')

  const [resumed] = reducer.handle(session, event('tool/result', {
    message: { source: { callId: 'plan-exit' } },
  }, 5))
  assert.equal(resumed.state, CompanionState.THINKING)
})

test('tool failure pulses error without losing the underlying work state', () => {
  const reducer = new CompanionReducer()
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))
  reducer.handle(session, event('tool/call', { callId: 'one', name: 'read_file' }, 2))
  reducer.handle(session, event('tool/call', { callId: 'two', name: 'write_file' }, 3))
  const [failure] = reducer.handle(session, event('tool/result', {
    message: { toolCallId: 'one' },
    error: { name: 'ToolError', code: 'FAILED' },
  }, 4))
  assert.equal(failure.state, CompanionState.ERROR)
  assert.equal(failure.resumeState, CompanionState.WORKING)
})

test('subagent events are ignored by default', () => {
  const reducer = new CompanionReducer()
  const child = { header: { id: 'child', origin: 'subagent', delegationDepth: 1 } }
  assert.deepEqual(reducer.handle(child, event('turn/start', { turn: 1 }, 1)), [])
})

test('live subagent setting preserves top-level session state', () => {
  const reducer = new CompanionReducer()
  const child = { header: { id: 'child', origin: 'subagent', delegationDepth: 1 } }
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))
  reducer.handle(session, event('todo/write', {
    todos: [{ content: '保留当前进度', status: 'in_progress' }],
  }, 2))
  reducer.handle(session, event('tool/call', { callId: 'main-work', name: 'apply_patch' }, 3))

  assert.deepEqual(reducer.setIncludeSubagents(true), [])
  reducer.handle(child, event('turn/start', { turn: 1 }, 1))
  const [blocked] = reducer.handle(child, event('turn/end', {
    turn: 1,
    reason: { kind: 'blocked' },
  }, 2))
  assert.equal(blocked.sessionId, 'child')

  const [restored] = reducer.setIncludeSubagents(false)
  assert.equal(restored.sessionId, 'session-main')
  assert.equal(restored.state, CompanionState.WORKING)
  assert.equal(restored.task, '保留当前进度')
})

test('approval events show waiting and resume after the decision', () => {
  const reducer = new CompanionReducer()
  reducer.handle(session, event('turn/start', { turn: 1 }, 1))

  const [asked] = reducer.handle(session, event('approval/asked', {
    id: 'approval-1',
    toolName: 'bash',
  }, 2))
  assert.equal(asked.state, CompanionState.WAITING)
  assert.equal(asked.stage, '等待审批')

  assert.deepEqual(reducer.handle(session, event('approval/decided', {
    id: 'unrelated',
    outcome: 'granted',
  }, 3)), [])

  const [resumed] = reducer.handle(session, event('approval/decided', {
    id: 'approval-1',
    outcome: 'granted',
  }, 4))
  assert.equal(resumed.state, CompanionState.THINKING)
})

test('tool categories keep renderer semantics independent from DSH tool names', () => {
  assert.equal(toolActivity('functions.search_files'), 'searching')
  assert.equal(toolActivity('apply_patch'), 'editing')
  assert.equal(toolActivity('pnpm_test'), 'testing')
  assert.equal(toolActivity('shell_command'), 'commanding')
  assert.equal(toolActivity('custom_tool'), 'using-tool')
})

test('multi-session selection follows attention priority instead of latest-event order', () => {
  const reducer = new CompanionReducer()
  const waiting = { header: { id: 'waiting-session' } }
  const working = { header: { id: 'working-session' } }

  reducer.handle(waiting, event('turn/start', { turn: 1 }, 1))
  const [blocked] = reducer.handle(waiting, event('turn/end', {
    turn: 1,
    reason: { kind: 'blocked' },
  }, 2))
  assert.equal(blocked.state, CompanionState.WAITING)

  const [tasksAfterStart] = reducer.handle(working, event('turn/start', { turn: 1 }, 1))
  assert.equal(tasksAfterStart.kind, CompanionMessageKind.TASKS)
  assert.equal(tasksAfterStart.tasks.length, 2)
  assert.equal(tasksAfterStart.tasks[0].sessionId, 'waiting-session')
  const [tasksAfterTool] = reducer.handle(working, event('tool/call', {
    callId: 'call-working',
    name: 'shell_command',
  }, 2))
  assert.equal(tasksAfterTool.kind, CompanionMessageKind.TASKS)
  assert.equal(tasksAfterTool.tasks[0].state, CompanionState.WAITING)
  assert.equal(tasksAfterTool.tasks[1].state, CompanionState.WORKING)

  const [revealed] = reducer.disposeSession(waiting)
  assert.equal(revealed.sessionId, 'working-session')
  assert.equal(revealed.state, CompanionState.WORKING)
})

test('multi-task list is cleared when only one active task remains', () => {
  const reducer = new CompanionReducer()
  const first = { header: { id: 'first' } }
  const second = { header: { id: 'second' } }
  reducer.handle(first, event('turn/start', { turn: 1 }, 1))
  reducer.handle(second, event('turn/start', { turn: 1 }, 1))
  const messages = reducer.handle(first, event('turn/end', {
    turn: 1,
    reason: { kind: 'completed' },
  }, 2))
  assert.equal(messages.some((message) => message.kind === CompanionMessageKind.TASKS), true)
  const clearTasks = messages.find((message) => message.kind === CompanionMessageKind.TASKS)
  assert.deepEqual(clearTasks.tasks, [])
})

test('completion pulse resumes the highest-priority remaining session', () => {
  const reducer = new CompanionReducer()
  const first = { header: { id: 'first' } }
  const second = { header: { id: 'second' } }
  reducer.handle(first, event('turn/start', { turn: 1 }, 1))
  reducer.handle(second, event('turn/start', { turn: 1 }, 1))
  reducer.handle(second, event('tool/call', {
    callId: 'search-call',
    name: 'web_search',
  }, 2))

  const [complete] = reducer.handle(first, event('turn/end', {
    turn: 1,
    reason: { kind: 'completed' },
  }, 2))
  assert.equal(complete.kind, CompanionMessageKind.PULSE)
  assert.equal(complete.resumeState, CompanionState.WORKING)
  assert.equal(complete.resumeActivity, 'searching')
})

test('failed turns remain visible until that session changes or is disposed', () => {
  const reducer = new CompanionReducer()
  const failed = { header: { id: 'failed-session' } }
  const newer = { header: { id: 'newer-session' } }
  reducer.handle(failed, event('turn/start', { turn: 1 }, 1))
  const [failure] = reducer.handle(failed, event('turn/end', {
    turn: 1,
    reason: { kind: 'error' },
  }, 2))
  assert.equal(failure.state, CompanionState.ERROR)
  const [tasksAfterNewer] = reducer.handle(newer, event('turn/start', { turn: 1 }, 1))
  assert.equal(tasksAfterNewer.kind, CompanionMessageKind.TASKS)
  assert.equal(tasksAfterNewer.tasks.length, 2)
  assert.equal(tasksAfterNewer.tasks[0].state, CompanionState.ERROR)
})

test('todo events preserve real project and progress context for the status card', () => {
  const reducer = new CompanionReducer()
  const projectSession = {
    header: {
      id: 'project-session',
      cwd: 'D:\\Github_Ku\\dsh-dafeiyu',
    },
  }
  reducer.handle(projectSession, event('turn/start', { turn: 1 }, 1))
  const [task] = reducer.handle(projectSession, event('todo/write', {
    todos: [
      { content: '检查现有实现', status: 'completed' },
      { content: '重做桌面气泡', status: 'in_progress' },
      { content: '运行测试', status: 'pending' },
    ],
  }, 2))

  assert.equal(task.kind, CompanionMessageKind.TASK)
  assert.equal(task.project, 'dsh-dafeiyu')
  assert.deepEqual(task.progress, { completed: 1, total: 3, current: 2 })
  assert.match(task.message, /重做桌面气泡/u)
  assert.match(task.detail, /已完成 1\/3 步/u)

  const [working] = reducer.handle(projectSession, event('tool/call', {
    callId: 'edit-card',
    name: 'apply_patch',
  }, 3))
  assert.equal(working.activity, 'editing')
  assert.equal(working.task, '重做桌面气泡')
  assert.match(working.detail, /dsh-dafeiyu/u)
})

test('user-question detection ignores ordinary tool names with broad words', () => {
  // These used to be mistaken for "waiting for user" because of bare substring
  // matches on review / allow / permission / approval.
  for (const name of ['review_changes', 'code_review', 'allowlist_files', 'permission_scan', 'approval', 'approve', 'review_version', 'ask_llm', 'request_user_agent', 'get_client_context']) {
    assert.equal(isUserQuestionTool(name), false, `expected ${name} not to be a user-question tool`)
  }
  // Real "ask the human" tools must still pause the pet.
  for (const name of ['ask_user_question', 'request_user_input', 'ask_for_user_input', 'ask_user', 'require_approval', 'ask_for_approval', 'request_approval', 'ask_for_permission', 'request_permission', 'user_question', 'user_input', 'authorize', 'consent']) {
    assert.equal(isUserQuestionTool(name), true, `expected ${name} to be a user-question tool`)
  }
})

test('session records are bounded even if DSH never emits session/disposed', () => {
  const reducer = new CompanionReducer({ maxSessions: 4 })
  const sessions = []
  for (let index = 0; index < 8; index += 1) {
    const current = { header: { id: `session-${index}` } }
    sessions.push(current)
    reducer.handle(current, event('turn/start', { turn: 1 }, index + 1))
    // Leave it working so the eviction must fall back to the oldest entry.
    reducer.handle(current, event('tool/call', { callId: `work-${index}`, name: 'shell_command' }, index + 2))
  }
  assert.ok(reducer.sessions.size <= 4, `expected bounded sessions, got ${reducer.sessions.size}`)
  // The two oldest records (0 and 1) should have been evicted first.
  assert.equal(reducer.sessions.has('session-0'), false)
  assert.equal(reducer.sessions.has('session-1'), false)
  assert.equal(reducer.sessions.has('session-7'), true)
})

test('project name follows a folder rename instead of the stale session header', () => {
  // The header is frozen at session creation with the old name; after the
  // folder is renamed, DSH keeps the live session.cwd pointing at the new one.
  let liveSession = { header: { id: 'renamed', title: 'old-name', cwd: 'D:\\work\\old-name' } }
  const reducer = new CompanionReducer()

  const [afterStart] = reducer.handle(liveSession, event('turn/start', { turn: 1 }, 1))
  assert.equal(afterStart.project, 'old-name')

  // Rename: header stays stale, but the live session working directory moves.
  liveSession = { ...liveSession, cwd: 'D:\\work\\new-name' }
  const [afterRename] = reducer.handle(liveSession, event('tool/call', { callId: 'p1', name: 'read_file' }, 2))
  assert.equal(afterRename.project, 'new-name')

  // An explicit projectName on the step wins over every cwd snapshot.
  const [withExplicit] = reducer.handle(liveSession, event('tool/call', {
    callId: 'p2',
    name: 'read_file',
    projectName: 'explicit-project',
  }, 3))
  assert.equal(withExplicit.project, 'explicit-project')
})
