window.__ModuleLoader__.load({ id: 'dsh-dafeiyu', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const { useEffect, useRef, useState } = React
  const CONFIG_ENDPOINT = '/plugins/dsh-dafeiyu/config'

  // DSH-native-like styling via stable CSS variables (no hardcoded module hashes)
  const cardStyle = {
    border: '1px solid var(--dsw-alias-border-l2, #d8d8d8)',
    background: 'var(--dsw-alias-bg-layer-3, #fff)',
    borderRadius: 12, listStyle: 'none', transition: 'border-color .16s,background .16s',
  }
  const cardStyleOpen = {
    ...cardStyle,
    background: 'var(--dsw-alias-bg-layer-2, #f5f5f5)',
    borderColor: 'var(--dsw-alias-label-dimmed, #b8b8b8)',
  }
  const headerStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    width: '100%', background: 'none', border: 'none', borderRadius: 12,
    padding: '14px 16px', gap: 12, cursor: 'pointer', font: 'inherit', color: 'inherit', textAlign: 'left',
  }
  const nameStyle = { color: 'var(--dsw-alias-label-primary, #25282D)', fontSize: 15, fontWeight: 600, lineHeight: 1.4 }
  const descStyle = { color: 'var(--dsw-alias-label-tertiary, #8a8f97)', fontSize: 13, lineHeight: 1.5 }
  const chevronStyle = { color: 'var(--dsw-alias-label-tertiary, #8a8f97)', flex: 'none', transition: 'transform .16s' }
  const bodyStyle = { borderTop: '1px solid var(--dsw-alias-border-l2, #d8d8d8)', margin: '0 16px', paddingBottom: 8 }
  const fieldStyle = { display: 'flex', flexDirection: 'column', gap: 6, padding: '12px 0' }
  const fieldHeadStyle = { display: 'flex', alignItems: 'center', gap: 8 }
  const labelStyle = { minWidth: 0, color: 'var(--dsw-alias-label-primary, #25282D)', flex: 1, fontSize: 13, fontWeight: 500, lineHeight: 1.5 }
  const inputBaseStyle = {
    border: '1px solid var(--dsw-alias-border-l2, #d8d8d8)',
    background: 'var(--dsw-alias-bg-layer-3, #fff)',
    height: 34, font: 'inherit', color: 'var(--dsw-alias-label-primary, #25282D)',
    borderRadius: 8, padding: '0 12px', fontSize: 13, lineHeight: 1.5,
  }
  const hintStyle = { color: 'var(--dsw-alias-label-tertiary, #8a8f97)', margin: 0, fontSize: 12, lineHeight: 1.5 }
  const rangeInputStyle = { width: '100%', margin: 0, padding: 0 }
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
    padding: '10px 12px', border: '1px solid var(--dsw-alias-border-l2, #d8d8d8)', borderRadius: 8,
  }

  // Inline SVG chevron to avoid depending on @deepseek-ai/dsh-client-ui-primitives
  function ChevronIcon({ open }) {
    return React.createElement('svg', {
      style: { ...chevronStyle, transform: open ? 'rotate(180deg)' : 'none' },
      width: 14, height: 14, viewBox: '0 0 14 14', fill: 'none', xmlns: 'http://www.w3.org/2000/svg',
      'aria-hidden': true,
    },
      React.createElement('path', {
        d: 'M3.5 5.25L7 8.75L10.5 5.25', stroke: 'currentColor', strokeWidth: 1.4,
        strokeLinecap: 'round', strokeLinejoin: 'round',
      }),
    )
  }

  function Field({ label, hint, children }) {
    return React.createElement('div', { style: fieldStyle },
      React.createElement('div', { style: fieldHeadStyle },
        React.createElement('label', { style: labelStyle }, label),
      ),
      children,
      React.createElement('p', { style: hintStyle }, hint),
    )
  }

  function CheckboxField({ label, hint, checked, disabled, onChange }) {
    return React.createElement('div', { style: fieldStyle },
      React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
        React.createElement('label', { style: { ...labelStyle, margin: 0 } }, label),
        React.createElement('input', {
          type: 'checkbox', checked, disabled,
          onChange: (event) => onChange(event.target.checked),
        }),
      ),
      React.createElement('p', { style: hintStyle }, hint),
    )
  }

  function SliderField({ label, hint, min, max, step, value, disabled, onChange }) {
    const [localValue, setLocalValue] = useState(value)
    const timerRef = useRef(null)
    useEffect(() => { setLocalValue(value) }, [value])
    const handleChange = (event) => {
      const next = Number(event.target.value)
      setLocalValue(next)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => { onChange(next) }, 250)
    }
    useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])
    return React.createElement('div', { style: fieldStyle },
      React.createElement('div', { style: fieldHeadStyle },
        React.createElement('label', { style: labelStyle }, label),
      ),
      React.createElement('input', {
        type: 'range', min, max, step, value: localValue, disabled, style: { ...inputBaseStyle, ...rangeInputStyle },
        onChange: handleChange,
      }),
      React.createElement('p', { style: hintStyle }, hint),
    )
  }

  function SelectField({ label, hint, value, disabled, onChange, options, style: extraStyle }) {
    const [isOpen, setIsOpen] = useState(false)
    const [highlightedIndex, setHighlightedIndex] = useState(-1)
    const containerRef = useRef(null)

    useEffect(() => {
      if (!isOpen) {
        setHighlightedIndex(-1)
        return
      }
      const currentIndex = options.findIndex((opt) => (Array.isArray(opt) ? opt[0] : opt.value) === value)
      setHighlightedIndex(currentIndex >= 0 ? currentIndex : 0)

      const handleClickOutside = (e) => {
        if (containerRef.current && !containerRef.current.contains(e.target)) {
          setIsOpen(false)
        }
      }
      const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
          setIsOpen(false)
          containerRef.current?.querySelector('[role="button"]')?.focus()
        } else if (e.key === 'ArrowDown') {
          e.preventDefault()
          setHighlightedIndex((prev) => (prev + 1) % options.length)
        } else if (e.key === 'ArrowUp') {
          e.preventDefault()
          setHighlightedIndex((prev) => (prev - 1 + options.length) % options.length)
        } else if (e.key === 'Enter' && highlightedIndex >= 0) {
          e.preventDefault()
          const opt = options[highlightedIndex]
          const optValue = Array.isArray(opt) ? opt[0] : opt.value
          onChange(optValue)
          setIsOpen(false)
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('keydown', handleKeyDown)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
        document.removeEventListener('keydown', handleKeyDown)
      }
    }, [isOpen])

    const getOptionLabel = (opt) => (Array.isArray(opt) ? opt[1] : opt.label)
    const getOptionValue = (opt) => (Array.isArray(opt) ? opt[0] : opt.value)
    const currentLabel = options.map(getOptionLabel).find((_, i) => getOptionValue(options[i]) === value) || ''

    const triggerToggle = () => {
      if (!disabled) setIsOpen((prev) => !prev)
    }

    const handleSelect = (optValue) => {
      onChange(optValue)
      setIsOpen(false)
      containerRef.current?.querySelector('[role="button"]')?.focus()
    }

    return React.createElement('div', { ref: containerRef, style: fieldStyle },
      React.createElement('div', { style: fieldHeadStyle },
        React.createElement('label', { style: labelStyle }, label),
      ),
      React.createElement('div', { style: { position: 'relative' } },
        React.createElement('button', {
          type: 'button',
          role: 'button',
          'aria-haspopup': 'listbox',
          'aria-expanded': isOpen,
          disabled,
          onClick: triggerToggle,
          style: {
            ...inputBaseStyle,
            width: '100%', textAlign: 'left', padding: '0 32px 0 12px',
            cursor: disabled ? 'not-allowed' : 'pointer',
            opacity: disabled ? 0.5 : 1,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            ...extraStyle,
          },
        },
          currentLabel,
          React.createElement('span', {
            style: {
              position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
              pointerEvents: 'none',
            },
          },
            React.createElement(ChevronIcon, { open: isOpen }),
          ),
        ),
        isOpen && React.createElement('div', {
          role: 'listbox',
          style: {
            position: 'absolute', zIndex: 1000,
            top: '100%', left: 0, right: 0, marginTop: 4,
            border: '1px solid var(--dsw-alias-border-l2, #d8d8d8)',
            borderRadius: 8, overflow: 'hidden',
            background: 'var(--dsw-alias-bg-layer-3, #fff)',
            boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
            maxHeight: 200, overflowY: 'auto',
          },
        },
          ...options.map((opt, index) => {
            const optValue = getOptionValue(opt)
            const optLabel = getOptionLabel(opt)
            const isSelected = optValue === value
            return React.createElement('div', {
              key: optValue,
              role: 'option',
              'aria-selected': isSelected,
              onMouseDown: (e) => { e.preventDefault(); handleSelect(optValue) },
              style: {
                padding: '8px 12px', cursor: 'pointer', fontSize: 13,
                color: 'var(--dsw-alias-label-primary, #25282D)',
                background: isSelected
                  ? 'var(--dsw-alias-brand-primary-alpha, rgba(64,156,255,0.12))'
                  : index === highlightedIndex
                    ? 'var(--dsw-alias-bg-layer-2, rgba(0,0,0,0.04))'
                    : 'transparent',
              },
            }, optLabel)
          }),
        ),
      ),
      React.createElement('p', { style: hintStyle }, hint),
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
    const [open, setOpen] = useState(false)
    const [status, setStatus] = useState('loading')
    const [value, setValue] = useState({})
    const patchSeq = useRef(0)
    const writable = status === 'ready'
    useEffect(() => {
      let active = true
      let retryTimer = null
      let failCount = 0
      const maxRetries = 3
      const load = () => {
        fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
          .then(async (response) => {
            if (!response.ok) throw new Error(`settings request failed: ${response.status}`)
            return response.json()
          })
          .then((next) => { if (active) { failCount = 0; setValue(next); setStatus('ready') } })
          .catch(() => {
            if (!active) return
            failCount += 1
            if (failCount >= maxRetries) {
              setStatus('unavailable')
              return // Stop retrying after max retries
            }
            // Exponential backoff: 1s, 2s, 4s
            const delay = Math.min(1000 * Math.pow(2, failCount - 1), 4000)
            retryTimer = setTimeout(load, delay)
          })
      }
      load()
      return () => {
        active = false
        if (retryTimer) clearTimeout(retryTimer)
      }
    }, [])
    const handleRetry = () => {
      setStatus('loading')
      fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
        .then(r => r.json())
        .then(next => { setValue(next); setStatus('ready') })
        .catch(() => setStatus('unavailable'))
    }
    const write = async (field, next) => {
      const seq = ++patchSeq.current
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
      }
    }
    const writeSlider = (field, next) => {
      // No debounce here - SliderField already handles 250ms debounce
      void write(field, next)
    }
    return React.createElement('li', {
        style: open ? cardStyleOpen : cardStyle,
        'data-testid': 'dsh-dafeiyu-settings',
      },
      React.createElement('button', {
          type: 'button', style: headerStyle, 'aria-expanded': open,
          'aria-label': open ? '收起设置' : '展开设置',
          onClick: () => setOpen(!open),
        },
        React.createElement('span', { style: { display: 'flex', flexDirection: 'column', flex: 1, gap: 4, minWidth: 0 } },
          React.createElement('span', { style: nameStyle }, '大肥鱼桌面伴侣'),
          React.createElement('span', { style: descStyle }, '入口和状态属于 DSH，鱼始终显示在 Windows 桌面最上层。'),
        ),
        React.createElement(ChevronIcon, { open }),
      ),
      open && (status === 'unavailable'
        ? React.createElement('div', { role: 'status', style: { display: 'flex', alignItems: 'center', gap: 8 } },
            React.createElement('span', null, '大肥鱼设置尚未连接到 DSH Host。'),
            React.createElement('button', {
              type: 'button', onClick: handleRetry,
              style: { padding: '6px 14px', borderRadius: 6, border: '1px solid var(--dsw-alias-border-l2, #d8d8d8)', background: 'var(--dsw-alias-bg-layer-2, #fff)', color: 'var(--dsw-alias-label-primary, inherit)', cursor: 'pointer' },
            }, '手动重试'),
          )
        : status === 'loading'
        ? React.createElement('span', null, '正在读取设置…')
         : React.createElement('div', { style: bodyStyle },
             React.createElement(CheckboxField, { label: '启用大肥鱼', hint: '关闭后立即退出；重新开启无需单独启动程序。', checked: value.enabled !== false, disabled: !writable, onChange: (next) => void write('enabled', next) }),
             React.createElement(SliderField, { label: '角色大小', hint: `${Math.round((value.scale ?? 1) * 100)}%`, min: 0.55, max: 1.4, step: 0.05, value: value.scale ?? 1, disabled: status !== 'ready', onChange: (next) => void writeSlider('scale', next) }),
             React.createElement(SelectField, {
               label: '活跃程度', hint: '控制空闲时微动作的出现频率。',
               value: value.activityLevel ?? 'normal', disabled: !writable,
               onChange: (next) => void write('activityLevel', next),
               options: [['quiet', '安静'], ['normal', '标准'], ['lively', '活泼']],
             }),
             React.createElement(CheckboxField, { label: '减少动态效果', hint: '减少走动、循环帧和程序化晃动。', checked: value.reducedMotion === true, disabled: !writable, onChange: (next) => void write('reducedMotion', next) }),
             React.createElement(CheckboxField, { label: '提示音', hint: '任务完成或出错时播放大肥鱼提示音。', checked: value.soundEnabled !== false, disabled: !writable, onChange: (next) => void write('soundEnabled', next) }),
             React.createElement(SelectField, {
               label: '气泡显示', hint: '常驻显示、完全隐藏，或自定义哪些状态显示气泡。',
               value: value.bubbleMode ?? 'always', disabled: !writable,
               onChange: (next) => void write('bubbleMode', next),
               options: [['always', '常驻显示'], ['hidden', '完全隐藏'], ['custom', '自定义显示状态']],
             }),
             (value.bubbleMode ?? 'always') !== 'hidden'
               ? React.createElement(SliderField, { label: '气泡大小', hint: `${Math.round((value.bubbleScale ?? 1) * 100)}%`, min: 0.8, max: 1.2, step: 0.05, value: value.bubbleScale ?? 1, disabled: status !== 'ready', onChange: (next) => void writeSlider('bubbleScale', next) })
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
             React.createElement(CheckboxField, { label: '响应子 Agent', hint: '默认只跟随顶层任务，避免状态过度跳动。', checked: value.includeSubagents === true, disabled: !writable, onChange: (next) => void write('includeSubagents', next) }),
           )
      ),
    )
  }

  function apply(ctx) {
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
  }

  module.exports = {
    name: 'dsh-dafeiyu-client',
    inject: ['slots'],
    apply,
  }
  return module.exports
} })
