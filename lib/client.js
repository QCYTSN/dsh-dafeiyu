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
    const patchSeq = useRef(0)
    const sliderTimers = useRef(new Map())
    const writable = status === 'ready' && !busy
    useEffect(() => {
      let active = true
      fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(`settings request failed: ${response.status}`)
          return response.json()
        })
        .then((next) => { if (active) { setValue(next); setStatus('ready') } })
        .catch(() => { if (active) setStatus('unavailable') })
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
        if (!response.ok) throw new Error(`settings write failed: ${response.status}`)
        const updated = await response.json()
        if (seq === patchSeq.current) {
          setValue(updated)
          setStatus('ready')
        }
      } catch {
        if (seq === patchSeq.current) setStatus('unavailable')
      } finally {
        if (seq === patchSeq.current) setBusy(false)
      }
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
        ? React.createElement('span', { role: 'status' }, '大肥鱼设置尚未连接到 DSH Host。')
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
          React.createElement(Field, { label: '气泡显示', hint: '常驻显示、完全隐藏，或自定义哪些状态显示气泡。' },
            React.createElement('select', {
              value: value.bubbleMode ?? 'always', disabled: !writable, style: selectStyle,
              onChange: (event) => void write('bubbleMode', event.target.value),
            },
            React.createElement('option', { value: 'always' }, '常驻显示'),
            React.createElement('option', { value: 'hidden' }, '完全隐藏'),
            React.createElement('option', { value: 'custom' }, '自定义显示状态')),
          ),
          (value.bubbleMode ?? 'always') !== 'hidden'
            ? React.createElement(Field, { label: '气泡大小', hint: `${Math.round((value.bubbleScale ?? 1) * 100)}%` },
                React.createElement('input', {
                  type: 'range', min: 0.8, max: 1.2, step: 0.05, value: value.bubbleScale ?? 1,
                  disabled: status !== 'ready',
                  onChange: (event) => void writeSlider('bubbleScale', Number(event.target.value)),
                }),
              )
            : null,
          (value.bubbleMode ?? 'always') === 'custom'
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
          busy ? React.createElement('small', { role: 'status' }, '正在保存…') : null,
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
      let timer = 0
      let source = null
      fetch(MANIFEST_ENDPOINT, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : Promise.reject(new Error('manifest'))))
        .then((manifest) => {
          if (!alive) return
          const runtime = { frames: manifest.clips.idle.frames, frameMs: manifest.clips.idle.frameMs || 125, index: 0 }
          const applyClip = (name) => {
            const clip = manifest.clips[name] || manifest.clips.idle
            runtime.frames = clip.frames
            runtime.frameMs = clip.frameMs || 125
            runtime.index = 0
          }
          const tick = () => {
            if (!alive || runtime.frames.length === 0) return
            if (runtime.frames.length > 1) runtime.index = (runtime.index + 1) % runtime.frames.length
            setSrc(FRAME_ENDPOINT + '?frame=' + encodeURIComponent(runtime.frames[runtime.index]))
            timer = setTimeout(tick, runtime.frameMs)
          }
          tick()
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
        clearTimeout(timer)
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
    // The pet card is purely decorative: if DSH ever changes the slot
    // contract again, fail this card quietly instead of failing the whole
    // WebUI load (that regressed before as 'other plugins stop working').
    // The guard must live INSIDE the inject callback because DSH may invoke
    // it asynchronously, outside any try around the inject() call itself.
    const registerCard = () => {
      try {
        ctx.slots.register({
          name: 'settings.plugin.item', key: 'dsh-dafeiyu', id: 'dsh-dafeiyu', order: 30,
          inject: () => ({}),
        }, BigFishCard)
      } catch (error) {
        if (typeof console !== 'undefined' && console.error) {
          console.error('[dsh-dafeiyu] failed to register settings card:', error)
        }
      }
    }
    try {
      ctx.slots.inject('settings.plugin.item', registerCard)
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
