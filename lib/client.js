window.__ModuleLoader__.load({ id: 'dsh-dafeiyu', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const { useEffect, useRef, useState } = React
  const CONFIG_ENDPOINT = '/plugins/dsh-dafeiyu/config'
  const EVENTS_ENDPOINT = '/plugins/dsh-dafeiyu/events'
  const MANIFEST_ENDPOINT = '/plugins/dsh-dafeiyu/manifest'
  const FRAME_ENDPOINT = '/plugins/dsh-dafeiyu/frame'

  const cardStyle = {
    listStyle: 'none', border: '1px solid var(--border-color, #d8d8d8)', borderRadius: 12,
    padding: 16, background: 'var(--surface-color, transparent)', display: 'grid', gap: 14,
  }
  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }
  const selectStyle = { minWidth: 120, padding: '6px 10px', borderRadius: 8 }
  const BUBBLE_STATE_OPTIONS = [
    ['IDLE', '空闲'],
    ['THINKING', '思考中'],
    ['WORKING', '工作中'],
    ['WAITING', '等待确认'],
    ['SUCCESS', '完成'],
    ['ERROR', '错误'],
  ]
  const bubbleGridStyle = {
    display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '6px 14px',
    padding: '10px 12px', border: '1px solid var(--border-color, #d8d8d8)', borderRadius: 8,
  }

  function Field({ label, hint, children }) {
    return React.createElement('label', { style: rowStyle },
      React.createElement('span', null,
        React.createElement('span', { style: { display: 'block', fontWeight: 600 } }, label),
        React.createElement('small', { style: { display: 'block', opacity: 0.65, marginTop: 3 } }, hint),
      ),
      children,
    )
  }

  function BubbleStatePicker({ value, disabled, onChange }) {
    const selected = Array.isArray(value) ? value : []
    const toggle = (state, checked) => {
      const next = new Set(selected)
      if (checked) next.add(state)
      else next.delete(state)
      onChange([...next])
    }
    return React.createElement('div', { style: bubbleGridStyle },
      ...BUBBLE_STATE_OPTIONS.map(([state, label]) =>
        React.createElement('label', { key: state, style: { display: 'flex', alignItems: 'center', gap: 4 } },
          React.createElement('input', {
            type: 'checkbox', checked: selected.includes(state), disabled,
            onChange: (event) => toggle(state, event.target.checked),
          }),
          label,
        ),
      ),
    )
  }

  function BigFishCard() {
    const [status, setStatus] = useState('loading')
    const [value, setValue] = useState({})
    const [busy, setBusy] = useState(false)
    const [problem, setProblem] = useState(null)
    const [needsRestart, setNeedsRestart] = useState(false)
    const patchSeq = useRef(0)
    const sliderTimers = useRef(new Map())
    const [hotkeyDraft, setHotkeyDraft] = useState(null)
    const writable = status === 'ready' && !busy
    useEffect(() => {
      let active = true
      fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) {
            const detail = await response.json().catch(() => null)
            throw new Error(detail?.error ?? `settings request failed: ${response.status}`)
          }
          return response.json()
        })
        .then((next) => { if (active) { setValue(next); setStatus('ready') } })
        .catch((error) => {
          if (active) { setProblem(String(error?.message ?? error)); setStatus('unavailable') }
        })
      return () => {
        active = false
        for (const timer of sliderTimers.current.values()) clearTimeout(timer)
        sliderTimers.current.clear()
      }
    }, [])
    const write = async (field, next) => {
      const seq = ++patchSeq.current
      setBusy(true)
      try {
        const response = await fetch(CONFIG_ENDPOINT, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [field]: next }),
        })
        const body = await response.json().catch(() => null)
        if (!response.ok) throw new Error(body?.error ?? `settings write failed: ${response.status}`)
        if (seq === patchSeq.current) {
          setValue(body)
          setStatus('ready')
          setProblem(null)
          // The write reached the profile patch, but DSH applies those edits to
          // the running composition only at startup, so the live value can come
          // back unchanged. Say that plainly instead of letting the control
          // silently snap back to the old value, which reads as "not saved".
          setNeedsRestart(JSON.stringify(body?.[field]) !== JSON.stringify(next))
        }
      } catch (error) {
        if (seq === patchSeq.current) {
          setProblem(String(error?.message ?? error))
          setStatus('unavailable')
        }
      } finally {
        if (seq === patchSeq.current) setBusy(false)
      }
    }
    const commitHotkey = () => {
      if (hotkeyDraft === null) return
      const next = hotkeyDraft.trim()
      setHotkeyDraft(null)
      if (!next || next === (value.clickThroughHotkey ?? 'Ctrl+Alt+F')) return
      void write('clickThroughHotkey', next)
    }
    const writeSlider = (field, next) => {
      // Keep the slider responsive while dragging: update the local value
      // immediately and send a single debounced PATCH once the user pauses.
      setValue((prev) => ({ ...prev, [field]: next }))
      // Invalidate any in-flight write so a stale response cannot overwrite
      // the optimistic slider value while the user keeps dragging.
      patchSeq.current += 1
      const pending = sliderTimers.current.get(field)
      if (pending) clearTimeout(pending)
      const timer = setTimeout(() => {
        sliderTimers.current.delete(field)
        void write(field, next)
      }, 250)
      sliderTimers.current.set(field, timer)
    }
    return React.createElement('li', { style: cardStyle, 'data-testid': 'dsh-dafeiyu-settings' },
      React.createElement('div', null,
        React.createElement('strong', { style: { fontSize: 16 } }, '大肥鱼桌面伴侣'),
        React.createElement('p', { style: { margin: '5px 0 0', opacity: 0.72 } }, '入口和状态属于 DSH，鱼始终显示在 Windows 桌面最上层。'),
      ),
      status === 'unavailable'
        ? React.createElement('div', { role: 'status', style: { display: 'grid', gap: 6 } },
            React.createElement('span', null, '大肥鱼设置尚未连接到 DSH Host。'),
            problem ? React.createElement('small', { style: { opacity: 0.72, wordBreak: 'break-word' } }, problem) : null,
          )
        : status === 'loading'
        ? React.createElement('span', null, '正在读取设置…')
        : React.createElement(React.Fragment, null,
          React.createElement(Field, { label: '启用大肥鱼', hint: '关闭后立即退出；重新开启无需单独启动程序。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.enabled !== false, disabled: !writable,
              onChange: (event) => void write('enabled', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '角色大小', hint: `${Math.round((value.scale ?? 1) * 100)}%` },
            React.createElement('input', {
              type: 'range', min: 0.55, max: 1.4, step: 0.05, value: value.scale ?? 1,
              disabled: status !== 'ready',
              onChange: (event) => void writeSlider('scale', Number(event.target.value)),
            }),
          ),
          React.createElement(Field, { label: '活跃程度', hint: '控制空闲时微动作的出现频率。' },
            React.createElement('select', {
              value: value.activityLevel ?? 'normal', disabled: !writable, style: selectStyle,
              onChange: (event) => void write('activityLevel', event.target.value),
            },
            React.createElement('option', { value: 'quiet' }, '安静'),
            React.createElement('option', { value: 'normal' }, '标准'),
            React.createElement('option', { value: 'lively' }, '活泼')),
          ),
          React.createElement(Field, { label: '减少动态效果', hint: '减少走动、循环帧和程序化晃动。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.reducedMotion === true, disabled: !writable,
              onChange: (event) => void write('reducedMotion', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '提示音', hint: '任务完成或出错时播放大肥鱼提示音。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.soundEnabled !== false, disabled: !writable,
              onChange: (event) => void write('soundEnabled', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '气泡显示', hint: '默认只在鼠标移到大肥鱼上时显示；也可以常驻、完全隐藏，或自定义哪些状态显示气泡。' },
            React.createElement('select', {
              value: value.bubbleMode ?? 'hover', disabled: !writable, style: selectStyle,
              onChange: (event) => void write('bubbleMode', event.target.value),
            },
            React.createElement('option', { value: 'hover' }, '悬停时显示'),
            React.createElement('option', { value: 'always' }, '常驻显示'),
            React.createElement('option', { value: 'hidden' }, '完全隐藏'),
            React.createElement('option', { value: 'custom' }, '自定义显示状态')),
          ),
          (value.bubbleMode ?? 'hover') !== 'hidden'
            ? React.createElement(Field, { label: '气泡大小', hint: `${Math.round((value.bubbleScale ?? 1) * 100)}%` },
                React.createElement('input', {
                  type: 'range', min: 0.8, max: 1.2, step: 0.05, value: value.bubbleScale ?? 1,
                  disabled: status !== 'ready',
                  onChange: (event) => void writeSlider('bubbleScale', Number(event.target.value)),
                }),
              )
            : null,
          (value.bubbleMode ?? 'hover') === 'custom'
            ? React.createElement(Field, { label: '自定义显示状态', hint: '勾选后，只有这些状态出现时才会显示气泡。' },
                React.createElement(BubbleStatePicker, {
                  value: value.bubbleStates ?? ['SUCCESS', 'ERROR', 'WAITING'],
                  disabled: !writable,
                  onChange: (next) => void write('bubbleStates', next),
                }),
              )
            : null,
          React.createElement(Field, { label: '响应子 Agent', hint: '默认只跟随顶层任务，避免状态过度跳动。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.includeSubagents === true, disabled: !writable,
              onChange: (event) => void write('includeSubagents', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '页面内桌宠', hint: '在 DSH 页面右下角显示一只跟随状态的小桌宠（纯装饰）；开关后刷新页面生效。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.webOverlay === true, disabled: !writable,
              onChange: (event) => void write('webOverlay', event.target.checked),
            }),
          ),
          React.createElement(Field, {
            label: '鼠标穿透',
            hint: '开启后点击大肥鱼会直接穿透到下面的窗口，宠物仍在显示但不再拦截鼠标。',
          },
            React.createElement('input', {
              type: 'checkbox', checked: value.clickThrough === true, disabled: !writable,
              'data-testid': 'dsh-dafeiyu-click-through',
              onChange: (event) => void write('clickThrough', event.target.checked),
            }),
          ),
          React.createElement(Field, {
            label: '穿透快捷键',
            hint: '全局生效的切换快捷键，例如 Ctrl+Alt+F；与其它软件冲突时改掉即可。',
          },
            React.createElement('input', {
              type: 'text', value: hotkeyDraft ?? (value.clickThroughHotkey ?? 'Ctrl+Alt+F'),
              disabled: !writable, spellCheck: false, placeholder: 'Ctrl+Alt+F',
              style: { minWidth: 140, padding: '6px 10px', borderRadius: 8 },
              onChange: (event) => setHotkeyDraft(event.target.value),
              // Commit on blur/Enter instead of per keystroke: a half-typed
              // binding would otherwise be pushed to the pet as invalid input.
              onBlur: commitHotkey,
              onKeyDown: (event) => { if (event.key === 'Enter') event.currentTarget.blur() },
            }),
          ),
          busy ? React.createElement('small', { role: 'status' }, '正在保存…') : null,
          needsRestart
            ? React.createElement('small', { role: 'status', style: { opacity: 0.8 } },
                '已写入配置，但 DSH 只在启动时加载它——完全退出并重启 DSH 后生效。')
            : null,
        ),
    )
  }

  // In-page companion (opt-in via the webOverlay setting). Purely decorative:
  // it mirrors the DSH state as a small looping sprite in the page corner and
  // never blocks or outlives the page. Every failure path ends in "no pet",
  // never in an exception reaching the WebUI.
  function PetOverlay() {
    const [src, setSrc] = useState(null)
    useEffect(() => {
      let alive = true
      let raf = 0
      let source = null
      fetch(MANIFEST_ENDPOINT, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('manifest'))))
        .then((manifest) => {
          if (!alive) return
          const runtime = { frames: manifest.clips.idle.frames, frameMs: manifest.clips.idle.frameMs || 42, index: 0 }
          let preloader = null
          const applyClip = (name) => {
            const clip = manifest.clips[name] || manifest.clips.idle
            runtime.frames = clip.frames
            runtime.frameMs = clip.frameMs || 42
            runtime.index = 0
          }
          const frameUrl = (frame) => FRAME_ENDPOINT + '?frame=' + encodeURIComponent(frame)
          const show = () => {
            if (!alive || runtime.frames.length === 0) return
            if (runtime.frames.length > 1) runtime.index = (runtime.index + 1) % runtime.frames.length
            setSrc(frameUrl(runtime.frames[runtime.index]))
            if (runtime.frames.length > 1 && typeof Image === 'function') {
              try {
                preloader = preloader || new Image()
                preloader.src = frameUrl(runtime.frames[(runtime.index + 1) % runtime.frames.length])
              } catch {}
            }
          }
          show()
          if (typeof requestAnimationFrame !== 'function') return
          let previous = 0
          let spent = 0
          const step = (now) => {
            if (!alive) return
            if (previous) {
              spent += now - previous
              if (spent >= runtime.frameMs) {
                spent %= runtime.frameMs
                show()
              }
            }
            previous = now
            raf = requestAnimationFrame(step)
          }
          raf = requestAnimationFrame(step)
          if (typeof EventSource !== 'undefined') {
            try {
              source = new EventSource(EVENTS_ENDPOINT)
              source.onmessage = (event) => {
                try {
                  const message = JSON.parse(event.data)
                  if (message.kind === 'state' && message.state && manifest.stateMap[message.state]) {
                    applyClip(manifest.stateMap[message.state])
                  }
                  if (message.kind === 'task' && message.state === 'WORKING' && message.activity
                    && manifest.workingActivityMap && manifest.workingActivityMap[message.activity]) {
                    applyClip(manifest.workingActivityMap[message.activity])
                  }
                } catch {}
              }
            } catch {}
          }
        })
        .catch(() => {})
      return () => {
        alive = false
        if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf)
        try { source?.close() } catch {}
      }
    }, [])
    if (!src) return null
    return React.createElement('img', {
      src, alt: '', 'aria-hidden': true, draggable: false,
      style: {
        position: 'fixed', right: 16, bottom: 12, width: 132, zIndex: 2147483000,
        pointerEvents: 'none', userSelect: 'none', opacity: 0.96,
        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.25))',
      },
    })
  }

  function registerWebOverlay(ctx) {
    const registerOverlay = () => {
      try {
        ctx.slots.register({ name: 'shell.overlay', id: 'dsh-dafeiyu-overlay', order: 999 }, () =>
          React.createElement(PetOverlay, {}))
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[dsh-dafeiyu] failed to register web overlay:', error)
        }
      }
    }
    try {
      ctx.slots.inject('shell.overlay', registerOverlay)
    } catch (error) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[dsh-dafeiyu] failed to inject overlay slot:', error)
      }
    }
  }

  function apply(ctx) {
    // The settings card lives in the Plugins settings section, as one tab
    // beside the shipped plugin list. The seat is `settings.plugins.tab`
    // (list slot: `id` + `order` + `label`, and it declares no inject face).
    // Older DSH builds exposed `settings.plugin.item` here; registering
    // against a slot that no longer exists fails silently — `inject` simply
    // waits forever — which is why the card vanished instead of erroring.
    const registerCard = () => {
      try {
        ctx.slots.register({
          name: 'settings.plugins.tab', id: 'dsh-dafeiyu', order: 30,
          label: '大肥鱼桌面伴侣',
        }, BigFishCard)
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[dsh-dafeiyu] failed to register settings card:', error)
        }
      }
    }
    try {
      ctx.slots.inject('settings.plugins.tab', registerCard)
    } catch (error) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[dsh-dafeiyu] failed to inject settings slot:', error)
      }
    }

    // The in-page pet is opt-in; read the local config once at mount. Any
    // failure (endpoint absent, offline host, closed page) just means no pet.
    try {
      fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((config) => {
          if (config && config.webOverlay === true) registerWebOverlay(ctx)
        })
        .catch(() => {})
    } catch {}
  }

  module.exports = {
    name: 'dsh-dafeiyu-client',
    inject: ['slots'],
    apply,
  }
  return module.exports
} })
