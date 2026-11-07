window.__ModuleLoader__.load({
  id: '@fstack/dsh-pele-diagram',
  factory(require) {
    'use strict'

    const React = require('react')
    const { createRoot } = require('react-dom/client')
    const { createPortal } = require('react-dom')
    const h = React.createElement
    const {
      useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState,
      useSyncExternalStore,
    } = React

    /* ------------------------------------------------------------------ *
     * Constants
     * ------------------------------------------------------------------ */

    const RUNTIME_URL_PATH = 'pele-diagram/runtime/pele-1.13.0.js'
    const KATEX_URL_PATH = 'pele-diagram/runtime/katex-0.19.1.min.js'
    const SETTINGS_URL_PATH = 'pele-diagram/settings'
    const STORAGE_KEY = 'dsh.pele-diagram.settings.v1'
    const LOCALE_NS = 'peleDiagram'
    const MAX_SOURCE_CHARS = 50000
    const MAX_SOURCE_LINES = 2000
    const STREAM_SETTLE_MS = 420

    const DEFAULT_SETTINGS = {
      accent: 'auto',
      radius: 14,
      fontScale: 1,
      diagramTheme: 'auto',
      defaultView: 'diagram',
      toolbar: 'always',
      maxHeight: 520,
      animation: true,
    }

    const PREVIEW_SOURCE = [
      'flowchart LR',
      '  A[输入需求] --> B{是否清晰}',
      '  B -- 是 --> C[实现]',
      '  B -- 否 --> D[补充说明]',
      '  D --> A',
      '  C --> E([交付])',
    ].join('\n')

    const DIAGRAM_KEYWORDS = /^(flowchart|graph|swimlane-beta|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|gantt|pie|journey|timeline|mindmap|gitGraph|quadrantChart|requirementDiagram|C4(?:Context|Container|Component|Dynamic|Deployment)|block(?:-beta)?|packet(?:-beta)?|architecture-beta|sankey(?:-beta)?|xychart(?:-beta)?|kanban|agentflow-beta|railroad(?:-(?:ebnf|abnf|peg))?-beta|treeView-beta|cynefin-beta|wardley-beta|eventmodeling|usecase-beta|venn-beta|ishikawa(?:-beta)?|radar-beta|treemap(?:-beta)?)\b/

    /* ------------------------------------------------------------------ *
     * Locale
     * ------------------------------------------------------------------ */

    const EN = {
      badge: 'Pele',
      diagramView: 'Diagram',
      codeView: 'Source',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      resetZoom: 'Reset zoom to 100%',
      fit: 'Fit to view',
      fullscreen: 'Open fullscreen preview',
      download: 'Download SVG',
      copy: 'Copy source',
      copied: 'Copied',
      close: 'Close',
      loading: 'Rendering diagram…',
      empty: 'No diagram source',
      renderFailed: 'Pele could not render this diagram. The source is shown below.',
      tooLarge: 'Diagram not rendered: the source exceeds the size limit.',
      diagramLabel: 'Pele {type} diagram',
      viewerLabel: 'Pele diagram fullscreen preview',
      viewerTitle: '{type} · Pele',
      statusRendered: 'Diagram rendered.',
      statusFailed: 'Diagram rendering failed. Source shown.',
      settingsNav: 'Pele diagrams',
      settingsTitle: 'Pele diagrams',
      settingsIntro: 'Render Mermaid code blocks with Pele. Control the accent color, corner radius, palette, font size and interaction defaults.',
      preview: 'Live preview',
      appearance: 'Appearance',
      accent: 'Accent color',
      accentDesc: 'Used for borders, connectors and controls. Follows the app accent by default.',
      followTheme: 'Follow app',
      customAccent: 'Custom',
      radius: 'Corner radius',
      radiusDesc: 'Applied to the diagram card, diagram nodes, toolbar buttons and the fullscreen panel.',
      fontScale: 'Diagram text size',
      fontScaleDesc: 'Scales the labels rendered inside the diagram.',
      diagramTheme: 'Diagram palette',
      diagramThemeDesc: 'Choose the diagram colors and canvas. “Auto” follows the app light/dark theme and the accent color.',
      themeAuto: 'Auto',
      themeNeutral: 'Neutral',
      themeDark: 'Dark',
      themeForest: 'Forest',
      themeBase: 'Accent',
      behavior: 'Interaction',
      defaultView: 'Initial view',
      defaultViewDesc: 'Whether new diagram cards open as a diagram or as source code.',
      toolbarMode: 'Toolbar visibility',
      toolbarDesc: 'Auto-hide the toolbar until the card is hovered or focused.',
      toolbarAlways: 'Always',
      toolbarHover: 'On hover',
      maxHeight: 'Maximum diagram height',
      maxHeightDesc: 'Taller diagrams pan inside the card instead of stretching the transcript.',
      unlimited: 'No limit',
      animation: 'Animate zoom',
      animationDesc: 'Smooth zooming and fitted transitions. Disabled automatically for reduced motion.',
      resetAll: 'Restore defaults',
      resetAllDesc: 'Restore every appearance and interaction option to its default.',
      savedLocally: 'Saved to your DSH profile and cached in this browser.',
      source: 'Source',
      sizeChars: '{n} characters',
    }

    const ZH = {
      badge: 'Pele',
      diagramView: '图表',
      codeView: '源码',
      zoomIn: '放大',
      zoomOut: '缩小',
      resetZoom: '恢复到 100%',
      fit: '适应视图',
      fullscreen: '全屏预览',
      download: '下载 SVG',
      copy: '复制源码',
      copied: '已复制',
      close: '关闭',
      loading: '正在渲染图表…',
      empty: '没有图表源码',
      renderFailed: 'Pele 无法渲染这张图，下方保留源码。',
      tooLarge: '图表未渲染：源码超出大小限制。',
      diagramLabel: 'Pele {type} 图表',
      viewerLabel: 'Pele 图表全屏预览',
      viewerTitle: '{type} · Pele',
      statusRendered: '图表已渲染。',
      statusFailed: '图表渲染失败，已显示源码。',
      settingsNav: 'Pele 图表',
      settingsTitle: 'Pele 图表',
      settingsIntro: '用 Pele 渲染 Mermaid 代码块，可调整主题色、圆角、配色、字号和交互默认值。',
      preview: '实时预览',
      appearance: '外观',
      accent: '主题色',
      accentDesc: '用于边框、连线和控件；默认跟随应用主题色。',
      followTheme: '跟随应用',
      customAccent: '自定义',
      radius: '圆角',
      radiusDesc: '应用于图表卡片、图表节点、工具栏按钮和全屏面板。',
      fontScale: '图表字号',
      fontScaleDesc: '缩放图表内部的文字标签。',
      diagramTheme: '图表配色',
      diagramThemeDesc: '选择图表内部配色与画布底色；“自动”跟随应用明暗主题和主题色。',
      themeAuto: '自动',
      themeNeutral: '中性',
      themeDark: '深色',
      themeForest: '森林',
      themeBase: '强调',
      behavior: '交互',
      defaultView: '默认视图',
      defaultViewDesc: '新的图表卡片默认显示图表还是源码。',
      toolbarMode: '工具栏显示',
      toolbarDesc: '悬停或聚焦前隐藏工具栏，让阅读更安静。',
      toolbarAlways: '始终显示',
      toolbarHover: '悬停显示',
      maxHeight: '图表最大高度',
      maxHeightDesc: '超高的图表会在卡片内平移，而不是拉长整个对话。',
      unlimited: '不限制',
      animation: '缩放动画',
      animationDesc: '平滑的缩放和适应过渡；系统偏好减少动态效果时会自动关闭。',
      resetAll: '恢复默认',
      resetAllDesc: '把外观与交互选项全部恢复为默认值。',
      savedLocally: '保存在 DSH 配置中，并在当前浏览器缓存。',
      source: '源码',
      sizeChars: '{n} 字符',
    }

    const DICTS = { en: EN, 'zh-CN': ZH, zh: ZH }

    let localeService = null

    function uiLanguage() {
      let id = ''
      try {
        id = localeService && typeof localeService.getLocale === 'function'
          ? String(localeService.getLocale().active || '')
          : ''
      } catch {}
      if (!id && typeof navigator !== 'undefined') {
        id = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en')
      }
      return id.toLowerCase().indexOf('zh') === 0 ? 'zh-CN' : 'en'
    }

    function translate(key, params) {
      const dict = DICTS[uiLanguage()] || EN
      let text = dict[key]
      if (text === undefined) text = EN[key]
      if (text === undefined) text = key
      if (params) {
        text = text.replace(/\{(\w+)\}/g, (match, name) => (
          Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
        ))
      }
      return text
    }

    /* ------------------------------------------------------------------ *
     * Settings store
     * ------------------------------------------------------------------ */

    function clamp(value, min, max) {
      const number = Number(value)
      if (!Number.isFinite(number)) return min
      return Math.min(max, Math.max(min, number))
    }

    function isHex(value) {
      return typeof value === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)
    }

    function sanitize(raw) {
      const input = raw && typeof raw === 'object' ? raw : {}
      return {
        accent: input.accent === 'auto' || isHex(input.accent) ? input.accent : DEFAULT_SETTINGS.accent,
        radius: clamp(input.radius === undefined ? DEFAULT_SETTINGS.radius : input.radius, 0, 28),
        fontScale: clamp(input.fontScale === undefined ? DEFAULT_SETTINGS.fontScale : input.fontScale, 0.8, 1.5),
        diagramTheme: ['auto', 'neutral', 'dark', 'forest', 'base'].indexOf(input.diagramTheme) >= 0
          ? input.diagramTheme
          : DEFAULT_SETTINGS.diagramTheme,
        defaultView: input.defaultView === 'code' ? 'code' : 'diagram',
        toolbar: input.toolbar === 'hover' ? 'hover' : 'always',
        maxHeight: [0, 320, 420, 520, 680, 840].indexOf(Number(input.maxHeight)) >= 0
          ? Number(input.maxHeight)
          : DEFAULT_SETTINGS.maxHeight,
        animation: input.animation !== false,
      }
    }

    function loadSettings() {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY)
        if (raw === null) return sanitize(DEFAULT_SETTINGS)
        return sanitize(Object.assign({}, DEFAULT_SETTINGS, JSON.parse(raw)))
      } catch {
        return sanitize(DEFAULT_SETTINGS)
      }
    }

    let settingsValue = loadSettings()
    const settingsListeners = new Set()
    let settingsTouched = false
    let settingsSaveTimer = 0

    function subscribeSettings(listener) {
      settingsListeners.add(listener)
      return () => { settingsListeners.delete(listener) }
    }

    function getSettings() {
      return settingsValue
    }

    function useSettings() {
      return useSyncExternalStore(subscribeSettings, getSettings, getSettings)
    }

    function notifySettings() {
      for (const listener of Array.from(settingsListeners)) {
        try { listener() } catch {}
      }
    }

    function cacheSettingsLocally() {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settingsValue))
      } catch {}
    }

    function scheduleSettingsSave() {
      if (typeof window.fetch !== 'function') return
      window.clearTimeout(settingsSaveTimer)
      settingsSaveTimer = window.setTimeout(() => {
        settingsSaveTimer = 0
        window.fetch(hostUrl(SETTINGS_URL_PATH), {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ settings: settingsValue }),
          cache: 'no-store',
          credentials: 'same-origin',
        }).catch(() => {})
      }, 320)
    }

    function updateSettings(patch) {
      settingsValue = sanitize(Object.assign({}, settingsValue, patch))
      settingsTouched = true
      cacheSettingsLocally()
      notifySettings()
      scheduleSettingsSave()
    }

    /** Adopt the profile's persisted preferences unless the user already changed something. */
    function hydrateSettings() {
      if (typeof window.fetch !== 'function') return
      window.fetch(hostUrl(SETTINGS_URL_PATH), {
        headers: { accept: 'application/json' },
        cache: 'no-store',
        credentials: 'same-origin',
      }).then(response => (response.ok ? response.json() : null)).then(payload => {
        if (settingsTouched) return
        if (!payload || payload.settings === null || typeof payload.settings !== 'object') return
        const next = sanitize(Object.assign({}, DEFAULT_SETTINGS, payload.settings))
        if (JSON.stringify(next) === JSON.stringify(settingsValue)) return
        settingsValue = next
        cacheSettingsLocally()
        notifySettings()
      }).catch(() => {})
    }

    function resetSettings() {
      updateSettings(DEFAULT_SETTINGS)
    }

    /* ------------------------------------------------------------------ *
     * Theme
     * ------------------------------------------------------------------ */

    const themeListeners = new Set()

    function subscribeTheme(listener) {
      themeListeners.add(listener)
      return () => { themeListeners.delete(listener) }
    }

    function isDarkTheme() {
      if (typeof document === 'undefined' || !document.body) return false
      return document.body.hasAttribute('data-ds-dark-theme')
    }

    function useDarkTheme() {
      return useSyncExternalStore(subscribeTheme, isDarkTheme, () => false)
    }

    function notifyTheme() {
      for (const listener of Array.from(themeListeners)) {
        try { listener() } catch {}
      }
    }

    function localeTick(listener) {
      if (!localeService || typeof localeService.subscribe !== 'function') return () => {}
      return localeService.subscribe(listener)
    }

    function useLocaleTick() {
      const [, force] = useState(0)
      useEffect(() => {
        return localeTick(() => force(value => value + 1))
      }, [])
    }

    /* ------------------------------------------------------------------ *
     * Color utilities
     * ------------------------------------------------------------------ */

    function readToken(name, fallback) {
      if (typeof document === 'undefined' || !document.body) return fallback
      try {
        const value = window.getComputedStyle(document.body).getPropertyValue(name).trim()
        return value || fallback
      } catch {
        return fallback
      }
    }

    function parseColor(value) {
      if (typeof value !== 'string') return null
      const text = value.trim()
      if (isHex(text)) {
        const hex = text.length === 4
          ? '#' + text[1] + text[1] + text[2] + text[2] + text[3] + text[3]
          : text
        return [
          parseInt(hex.slice(1, 3), 16),
          parseInt(hex.slice(3, 5), 16),
          parseInt(hex.slice(5, 7), 16),
        ]
      }
      const match = /^rgba?\(([^)]+)\)$/i.exec(text)
      if (match) {
        const parts = match[1].split(/[\s,/]+/).filter(Boolean).map(Number)
        if (parts.length >= 3 && parts.slice(0, 3).every(Number.isFinite)) {
          return [parts[0], parts[1], parts[2]]
        }
      }
      return null
    }

    function toHex(rgb) {
      return '#' + rgb.map(channel => (
        Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')
      )).join('')
    }

    /** Resolve a CSS color expression (color-mix, named colors) to a concrete color. */
    function concreteColor(value) {
      if (parseColor(value)) return value
      if (typeof document === 'undefined' || !document.body) return value
      try {
        const probe = document.createElement('span')
        probe.style.color = value
        probe.style.display = 'none'
        document.body.appendChild(probe)
        const resolved = window.getComputedStyle(probe).color
        probe.remove()
        return parseColor(resolved) ? resolved : value
      } catch {
        return value
      }
    }

    function mixColor(a, b, ratio) {
      const left = parseColor(a)
      const right = parseColor(b)
      if (!left || !right) return a
      const weight = clamp(ratio, 0, 1)
      return toHex(left.map((channel, index) => channel + (right[index] - channel) * weight))
    }

    function accentToken() {
      return concreteColor(readToken('--dsw-alias-brand-primary', '#4d6bfe'))
    }

    function resolvedAccent(settings) {
      return settings.accent === 'auto' ? accentToken() : settings.accent
    }

    function accentCss(settings) {
      return settings.accent === 'auto' ? 'var(--dsw-alias-brand-primary)' : settings.accent
    }

    function surfaceToken(dark) {
      return concreteColor(readToken('--dsw-alias-bg-layer-1', dark ? '#1e1e20' : '#ffffff'))
    }

    function textToken(dark) {
      return concreteColor(readToken('--dsw-alias-label-primary', dark ? '#f5f5f5' : '#1b1b1c'))
    }

    /**
     * Per-palette diagram colors. Pele reads them as CSS variables, so palette
     * changes repaint existing SVGs without a re-render; each palette also owns
     * its canvas color, otherwise switching would look unchanged.
     */
    function paletteFor(settings, dark) {
      const appSurface = surfaceToken(dark)
      const appText = textToken(dark)
      const accent = resolvedAccent(settings)
      let accentColor = accent
      let surface = appSurface
      let text = appText
      let canvas = 'var(--dsw-alias-bg-layer-1)'
      let canvasText = 'var(--dsw-alias-label-primary)'
      let tint = dark ? 0.74 : 0.88
      let tintAlt = dark ? 0.86 : 0.94
      let lineMix = dark ? 0.26 : 0.18
      let paletteDark = dark

      if (settings.diagramTheme === 'neutral') {
        accentColor = dark ? '#a8b3c2' : '#64748b'
        surface = dark ? '#1d232b' : '#f7f9fb'
        text = dark ? '#e6eaf0' : '#1f2937'
        canvas = surface
        canvasText = text
        tint = dark ? 0.84 : 0.9
        tintAlt = dark ? 0.9 : 0.96
        lineMix = 0.18
      } else if (settings.diagramTheme === 'dark') {
        accentColor = mixColor(accent, '#ffffff', 0.35)
        surface = '#171a20'
        text = '#e8ebf0'
        canvas = '#14171c'
        canvasText = text
        tint = 0.84
        tintAlt = 0.92
        lineMix = 0.12
        paletteDark = true
      } else if (settings.diagramTheme === 'forest') {
        accentColor = dark ? '#6ee7a0' : '#2f9e44'
        surface = dark ? '#122018' : '#f4fbf5'
        text = dark ? '#e4f6e9' : '#1b3b24'
        canvas = surface
        canvasText = text
        tint = dark ? 0.82 : 0.88
        tintAlt = dark ? 0.9 : 0.95
        lineMix = 0.16
      } else if (settings.diagramTheme === 'base') {
        tint = dark ? 0.62 : 0.8
        tintAlt = dark ? 0.78 : 0.9
        lineMix = 0.1
      }

      return {
        accent: accentColor,
        surface,
        text,
        canvas,
        canvasText,
        nodeFill: mixColor(accentColor, surface, tint),
        nodeFillAlt: mixColor(accentColor, surface, tintAlt),
        line: mixColor(accentColor, text, lineMix),
        error: paletteDark ? '#ff9a9a' : 'var(--dsw-alias-state-error-primary)',
        dark: paletteDark,
      }
    }

    /* ------------------------------------------------------------------ *
     * Pele runtime
     * ------------------------------------------------------------------ */

    const FONT_STACK = '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
    const MONO_STACK = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

    let runtimePromise = null
    let katexPromise = null
    let renderSequence = 0

    function hostUrl(path) {
      let base = document.baseURI
      try {
        const url = new URL(base)
        url.search = ''
        url.hash = ''
        if (!url.pathname.endsWith('/')) url.pathname += '/'
        base = url.href
      } catch {}
      return new URL(path, base).href
    }

    function runtimeUrl() {
      return hostUrl(RUNTIME_URL_PATH)
    }

    function loadRuntime() {
      if (typeof window !== 'undefined' && window.pele) return Promise.resolve(window.pele)
      if (runtimePromise) return runtimePromise
      runtimePromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = runtimeUrl()
        script.async = true
        script.dataset.dshPeleRuntime = ''
        script.addEventListener('load', () => {
          if (window.pele) resolve(window.pele)
          else reject(new Error('Pele runtime did not initialize'))
        }, { once: true })
        script.addEventListener('error', () => {
          reject(new Error('Pele runtime failed to load'))
        }, { once: true })
        document.head.append(script)
      }).catch(error => {
        runtimePromise = null
        throw error
      })
      return runtimePromise
    }

    function loadKatex() {
      if (typeof window !== 'undefined' && window.katex) return Promise.resolve(window.katex)
      if (katexPromise) return katexPromise
      katexPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script')
        script.src = hostUrl(KATEX_URL_PATH)
        script.async = true
        script.dataset.dshPeleKatex = ''
        script.addEventListener('load', () => {
          if (window.katex) resolve(window.katex)
          else reject(new Error('KaTeX runtime did not initialize'))
        }, { once: true })
        script.addEventListener('error', () => {
          reject(new Error('KaTeX runtime failed to load'))
        }, { once: true })
        document.head.append(script)
      }).catch(error => {
        katexPromise = null
        throw error
      })
      return katexPromise
    }

    let mathProbe = null
    let mathResolver = null
    const mathCache = new Map()

    function ensureMathProbe() {
      if (mathProbe && mathProbe.isConnected) return mathProbe
      mathProbe = document.createElement('div')
      mathProbe.setAttribute('aria-hidden', 'true')
      mathProbe.setAttribute('data-dsh-pd-owned', '')
      mathProbe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;display:inline-block;white-space:nowrap;pointer-events:none;'
      document.body.appendChild(mathProbe)
      return mathProbe
    }

    /**
     * Pele's `math` hook: typeset with KaTeX's MathML output and report the
     * measured size so Pele can reserve room in the SVG. Failures return null,
     * which makes Pele fall back to showing the TeX source.
     */
    function getMathResolver(katex) {
      if (mathResolver) return mathResolver
      mathResolver = (tex, size) => {
        const key = tex + '\u0000' + size
        const cached = mathCache.get(key)
        if (cached) return cached
        try {
          const probe = ensureMathProbe()
          probe.style.fontSize = size + 'px'
          probe.innerHTML = katex.renderToString(tex, {
            displayMode: true,
            output: 'mathml',
            throwOnError: true,
            strict: 'ignore',
          })
          const expression = probe.querySelector('math')
          if (!expression) return null
          const rect = expression.getBoundingClientRect()
          if (!(rect.width > 0) || !(rect.height > 0)) return null
          const result = { html: expression.outerHTML, width: rect.width, height: rect.height }
          if (mathCache.size >= 200) mathCache.clear()
          mathCache.set(key, result)
          return result
        } catch {
          return null
        }
      }
      return mathResolver
    }

    function disposeMath() {
      mathResolver = null
      mathCache.clear()
      if (mathProbe) {
        mathProbe.remove()
        mathProbe = null
      }
    }

    /** Series colors for the non-default palettes; auto/base keep Pele's own. */
    const SERIES_PALETTES = {
      neutral: ['#64748b', '#94a3b8', '#475569', '#cbd5e1', '#334155', '#a8b3c2', '#7c8aa0', '#e2e8f0'],
      dark: ['#96a8fc', '#f58518', '#54a24b', '#e45756', '#72b7b2', '#eeca3b', '#b279a2', '#9d755d'],
      forest: ['#2f9e44', '#6ee7a0', '#1b7a33', '#a7d8b1', '#0f5132', '#74c69d', '#40916c', '#d8f3dc'],
    }

    /**
     * The CSS variables Pele reads. Accent, radius and palette changes apply
     * without re-rendering the SVG; only source, width and font size need a
     * render.
     */
    function peleVarsFor(settings, dark) {
      const palette = paletteFor(settings, dark)
      const muted = mixColor(palette.text, palette.surface, 0.45)
      const nodeRadius = Math.min(14, Math.round(settings.radius * 0.6))
      const vars = {
        '--pele-bg': palette.surface,
        '--pele-fg': palette.text,
        '--pele-fg-on-light': '#1b1b1c',
        '--pele-fg-on-dark': '#f5f5f5',
        '--pele-muted': muted,
        '--pele-line': palette.line,
        '--pele-surface': palette.nodeFill,
        '--pele-surface-alt': palette.nodeFillAlt,
        '--pele-border': palette.accent,
        '--pele-accent': palette.accent,
        '--pele-critical': palette.error,
        '--pele-error': palette.error,
        '--pele-radius': nodeRadius + 'px',
        '--pele-font': FONT_STACK,
        '--pele-font-mono': MONO_STACK,
      }
      const series = SERIES_PALETTES[settings.diagramTheme]
      if (series) {
        series.forEach((color, index) => { vars['--pele-series-' + (index + 1)] = color })
      }
      return vars
    }

    /** Bake the current variables into a standalone SVG for download. */
    function bakePeleVars(svgText, vars) {
      try {
        const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
        const root = doc.documentElement
        if (!root || root.nodeName.toLowerCase() !== 'svg') return svgText
        for (const [name, value] of Object.entries(vars)) {
          if (typeof value === 'string' && value.indexOf('var(') !== 0) root.style.setProperty(name, value)
        }
        return new XMLSerializer().serializeToString(root)
      } catch {
        return svgText
      }
    }

    function normalizePeleSvg(svgText, width, height) {
      const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
      const root = doc.documentElement
      if (!root || root.nodeName.toLowerCase() !== 'svg') throw new Error('Pele returned invalid SVG')
      root.setAttribute('width', String(width))
      root.setAttribute('height', String(height))
      root.setAttribute('focusable', 'false')
      // Keep the root style: Pele maps --pele-* into its internal --_* vars there.
      return new XMLSerializer().serializeToString(root)
    }

    function renderPele(pele, code, settings, width, math) {
      const id = 'dshPele' + (++renderSequence)
      const options = {
        idPrefix: id,
        fontSize: Math.round(14 * settings.fontScale),
        fontFamily: FONT_STACK,
        maxWidth: Math.max(240, Math.round(width || 760)),
        autoDirection: true,
        directionBreakpoint: 640,
        responsive: true,
        padding: 12,
        limit: MAX_SOURCE_CHARS,
        maxEdges: 2000,
      }
      if (math) options.math = math
      const result = pele.render(code, options)
      return {
        svg: normalizePeleSvg(result.svg, result.width, result.height),
        width: result.width,
        height: result.height,
        type: result.type || diagramType(code),
      }
    }

    function stripFrontmatter(text) {
      let value = String(text || '').replace(/^\uFEFF/, '')
      value = value.replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/, '')
      value = value.replace(/^(?:[ \t]*%%.*\r?\n)+/, '')
      return value
    }

    function diagramType(text) {
      const start = stripFrontmatter(text).trimStart()
      const match = DIAGRAM_KEYWORDS.exec(start)
      return match ? match[1] : 'diagram'
    }

    function looksLikeDiagram(text) {
      const start = stripFrontmatter(text).trimStart()
      return DIAGRAM_KEYWORDS.test(start)
    }

    function checkLimits(text) {
      if (text.length > MAX_SOURCE_CHARS) return 'chars'
      if (text.split('\n').length > MAX_SOURCE_LINES) return 'lines'
      return null
    }

    /* ------------------------------------------------------------------ *
     * Shared React hooks
     * ------------------------------------------------------------------ */

    function usePeleRender(source, settings, width) {
      const [state, setState] = useState({ status: 'loading' })
      const generation = useRef(0)
      const fontScale = settings.fontScale

      useEffect(() => {
        const current = ++generation.current
        const text = String(source || '').trim()
        if (!text) {
          setState({ status: 'empty' })
          return () => { generation.current += 1 }
        }
        const limit = checkLimits(text)
        if (limit !== null) {
          setState({ status: 'error', reason: limit, error: translate('tooLarge'), type: diagramType(text) })
          return () => { generation.current += 1 }
        }
        setState(previous => (
          previous.source === text && previous.status === 'ok'
            ? previous
            : previous.svg
              ? { ...previous, status: 'loading' }
              : { status: 'loading' }
        ))
        let cancelled = false
        const timer = window.setTimeout(() => {
          const loaders = [loadRuntime()]
          if (text.indexOf('$$') >= 0) loaders.push(loadKatex().catch(() => null))
          Promise.all(loaders).then(([pele, katex]) => {
            if (cancelled || current !== generation.current) return
            const math = katex ? getMathResolver(katex) : null
            const result = renderPele(pele, text, { fontScale }, width, math)
            if (cancelled || current !== generation.current) return
            setState({
              status: 'ok',
              svg: result.svg,
              width: result.width,
              height: result.height,
              type: result.type,
              source: text,
            })
          }).catch(error => {
            if (cancelled || current !== generation.current) return
            setState({
              status: 'error',
              error: error && error.message ? error.message : String(error),
              type: diagramType(text),
            })
          })
        }, 60)
        return () => {
          cancelled = true
          generation.current += 1
          window.clearTimeout(timer)
        }
      }, [source, fontScale, width])

      return state
    }

    function useReducedMotion() {
      const [reduced, setReduced] = useState(() => (
        typeof window !== 'undefined' && window.matchMedia
          ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
          : false
      ))
      useEffect(() => {
        if (!window.matchMedia) return
        const query = window.matchMedia('(prefers-reduced-motion: reduce)')
        const listener = () => setReduced(query.matches)
        query.addEventListener('change', listener)
        return () => query.removeEventListener('change', listener)
      }, [])
      return reduced
    }

    /* ------------------------------------------------------------------ *
     * Icons
     * ------------------------------------------------------------------ */

    function icon(children, size) {
      return h('svg', {
        width: size || 14,
        height: size || 14,
        viewBox: '0 0 16 16',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.6,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, children)
    }

    const IconMinus = () => icon(h('path', { d: 'M3.5 8h9' }))
    const IconPlus = () => icon([h('path', { d: 'M8 3.5v9', key: 'v' }), h('path', { d: 'M3.5 8h9', key: 'h' })])
    const IconFit = () => icon([
      h('path', { d: 'M4 12L12 4', key: 'a' }),
      h('path', { d: 'M4 8V12H8', key: 'b' }),
      h('path', { d: 'M8 4H12V8', key: 'c' }),
    ])
    const IconExpand = () => icon([
      h('path', { d: 'M6 2.8H2.8V6', key: 'a' }),
      h('path', { d: 'M10 2.8h3.2V6', key: 'b' }),
      h('path', { d: 'M13.2 10v3.2H10', key: 'c' }),
      h('path', { d: 'M6 13.2H2.8V10', key: 'd' }),
    ])
    const IconClose = () => icon([
      h('path', { d: 'M4 4l8 8', key: 'a' }),
      h('path', { d: 'M12 4l-8 8', key: 'b' }),
    ])
    const IconDownload = () => icon([
      h('path', { d: 'M8 2.2v7.2', key: 'a' }),
      h('path', { d: 'M4.9 6.6L8 9.7l3.1-3.1', key: 'b' }),
      h('path', { d: 'M3 12.6h10', key: 'c' }),
    ])
    const IconCopy = () => icon([
      h('rect', { x: 5.6, y: 5.6, width: 7, height: 7, rx: 1.6, key: 'a' }),
      h('path', { d: 'M10.4 3.6V3.2A1.7 1.7 0 0 0 8.7 1.5H3.2A1.7 1.7 0 0 0 1.5 3.2v5.5a1.7 1.7 0 0 0 1.7 1.7h.4', key: 'b' }),
    ])
    const IconCheck = () => icon(h('path', { d: 'M3.2 8.4l3.1 3.1 6.5-7', strokeWidth: 1.8 }))
    const IconCode = () => icon([
      h('path', { d: 'M5.6 4.4L2.2 8l3.4 3.6', key: 'a' }),
      h('path', { d: 'M10.4 4.4L13.8 8l-3.4 3.6', key: 'b' }),
    ])
    const IconDiagram = () => icon([
      h('rect', { x: 1.8, y: 2.2, width: 5, height: 4, rx: 1, key: 'a' }),
      h('rect', { x: 9.2, y: 9.8, width: 5, height: 4, rx: 1, key: 'b' }),
      h('rect', { x: 1.8, y: 9.8, width: 5, height: 4, rx: 1, key: 'c' }),
      h('path', { d: 'M6.8 4.2h3.2a1 1 0 0 1 1 1v4.6', key: 'd' }),
    ])
    const IconSettingsNav = ({ size }) => h('svg', {
      width: size,
      height: size,
      viewBox: '0 0 20 20',
      fill: 'none',
      stroke: 'currentColor',
      strokeWidth: 1.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      'aria-hidden': 'true',
    }, [
      h('path', { d: 'M10 2.6c2.2 3.5 4.3 5.1 4.3 8.1a4.3 4.3 0 0 1-8.6 0c0-1.9.9-3.3 2-4.7.4 1.2 1 2 1.9 2.6.1-2.1.2-4 .4-6z', key: 'flame' }),
      h('path', { d: 'M10 9.1c.9 1.4 1.7 2.1 1.7 3.2a1.7 1.7 0 0 1-3.4 0c0-.8.4-1.4.8-2 .2.5.5.9.9 1.1 0-.7 0-1.5 0-2.3z', key: 'core' }),
    ])

    /* ------------------------------------------------------------------ *
     * Zoomable diagram stage
     * ------------------------------------------------------------------ */

    const ZoomableDiagram = React.forwardRef(function ZoomableDiagram(props, ref) {
      const {
        svg, width, height, mode, animation, onScale, labels,
      } = props
      const containerRef = useRef(null)
      const [view, setView] = useState({ zoom: 1, x: 0, y: 0 })
      const viewRef = useRef(view)
      const [dragging, setDragging] = useState(false)
      const dragRef = useRef(null)

      viewRef.current = view

      const applyView = useCallback(next => {
        viewRef.current = next
        setView(next)
        if (onScale) onScale(next.zoom)
      }, [onScale])

      const computeFit = useCallback(() => {
        const element = containerRef.current
        if (!element || !width || !height) return 1
        const box = element.getBoundingClientRect()
        const padX = mode === 'fullscreen' ? 96 : 32
        const padY = mode === 'fullscreen' ? 96 : 24
        const fitWidth = (box.width - padX) / width
        const fitHeight = mode === 'fullscreen' ? (box.height - padY) / height : Infinity
        const cap = mode === 'fullscreen' ? 2 : 1
        const fitted = Math.min(fitWidth, fitHeight, cap)
        return Number.isFinite(fitted) && fitted > 0 ? fitted : 1
      }, [width, height, mode])

      const fit = useCallback(() => {
        applyView({ zoom: computeFit(), x: 0, y: 0 })
      }, [applyView, computeFit])

      const zoomAt = useCallback((target, clientX, clientY) => {
        const current = viewRef.current
        const next = clamp(target, 0.15, 6)
        if (!containerRef.current || Math.abs(next - current.zoom) < 0.0001) return
        const box = containerRef.current.getBoundingClientRect()
        const anchorX = clientX === undefined ? 0 : clientX - box.left - box.width / 2
        const anchorY = clientY === undefined ? 0 : clientY - box.top - box.height / 2
        const ratio = next / current.zoom
        applyView({
          zoom: next,
          x: anchorX - (anchorX - current.x) * ratio,
          y: anchorY - (anchorY - current.y) * ratio,
        })
      }, [applyView])

      useImperativeHandle(ref, () => ({
        zoomIn: () => zoomAt(viewRef.current.zoom * 1.2),
        zoomOut: () => zoomAt(viewRef.current.zoom / 1.2),
        reset: () => applyView({ zoom: 1, x: 0, y: 0 }),
        fit,
        getZoom: () => viewRef.current.zoom,
      }), [zoomAt, applyView, fit])

      useEffect(() => {
        const element = containerRef.current
        if (!element) return undefined
        applyView({ zoom: computeFit(), x: 0, y: 0 })
        const observer = new ResizeObserver(() => {
          applyView({ zoom: computeFit(), x: 0, y: 0 })
        })
        observer.observe(element)
        return () => observer.disconnect()
      }, [svg, width, height, mode, computeFit, applyView])

      useEffect(() => {
        const element = containerRef.current
        if (!element) return undefined
        const onWheel = event => {
          const wantsZoom = mode === 'fullscreen' || event.ctrlKey || event.metaKey
          if (!wantsZoom) return
          event.preventDefault()
          zoomAt(viewRef.current.zoom * (event.deltaY < 0 ? 1.12 : 1 / 1.12), event.clientX, event.clientY)
        }
        element.addEventListener('wheel', onWheel, { passive: false })
        return () => element.removeEventListener('wheel', onWheel)
      }, [mode, zoomAt])

      useEffect(() => {
        if (!dragging) return undefined
        const onMove = event => {
          const drag = dragRef.current
          if (!drag || drag.id !== event.pointerId) return
          applyView({
            zoom: viewRef.current.zoom,
            x: drag.x + (event.clientX - drag.startX),
            y: drag.y + (event.clientY - drag.startY),
          })
        }
        const onEnd = event => {
          const drag = dragRef.current
          if (drag && drag.id !== event.pointerId) return
          dragRef.current = null
          setDragging(false)
        }
        window.addEventListener('pointermove', onMove)
        window.addEventListener('pointerup', onEnd)
        window.addEventListener('pointercancel', onEnd)
        return () => {
          window.removeEventListener('pointermove', onMove)
          window.removeEventListener('pointerup', onEnd)
          window.removeEventListener('pointercancel', onEnd)
        }
      }, [dragging, applyView])

      const onPointerDown = event => {
        if (event.target && event.target.closest && event.target.closest('a')) return
        if (event.button !== 0 && event.pointerType === 'mouse') return
        event.preventDefault()
        dragRef.current = {
          id: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          x: viewRef.current.x,
          y: viewRef.current.y,
        }
        setDragging(true)
      }

      const onDoubleClick = () => {
        const fitted = computeFit()
        if (Math.abs(viewRef.current.zoom - fitted) < 0.01) {
          applyView({ zoom: 1, x: 0, y: 0 })
        } else {
          fit()
        }
      }

      const transition = animation && !dragging ? 'transform 140ms cubic-bezier(0.2, 0.7, 0.3, 1)' : 'none'

      return h('div', {
        ref: containerRef,
        className: 'dsh-pd-viewport',
        'data-dragging': dragging ? 'true' : undefined,
        role: 'group',
        'aria-label': labels,
        onPointerDown,
        onDoubleClick,
        style: { height: mode === 'fullscreen' ? '100%' : undefined },
      }, h('div', {
        className: 'dsh-pd-stage',
        style: {
          width: width ? width + 'px' : undefined,
          height: height ? height + 'px' : undefined,
          marginLeft: width ? -width / 2 + 'px' : undefined,
          marginTop: height ? -height / 2 + 'px' : undefined,
          transform: 'translate(' + view.x + 'px, ' + view.y + 'px) scale(' + view.zoom + ')',
          transition,
        },
        dangerouslySetInnerHTML: { __html: svg },
      }))
    })

    /* ------------------------------------------------------------------ *
     * Card boundary
     * ------------------------------------------------------------------ */

    class CardBoundary extends React.Component {
      constructor(props) {
        super(props)
        this.state = { crashed: false }
      }

      static getDerivedStateFromError() {
        return { crashed: true }
      }

      componentDidCatch(error) {
        try { console.error('[pele-diagram] card crashed', error) } catch {}
      }

      render() {
        if (this.state.crashed) {
          return h('div', {
            className: 'dsh-pd-card dsh-pd-crashed',
            'data-dsh-pd-owned': '',
          }, h('pre', { className: 'dsh-pd-source' }, this.props.source))
        }
        return this.props.children
      }
    }

    /* ------------------------------------------------------------------ *
     * Card
     * ------------------------------------------------------------------ */

    function ToolButton({ label, onClick, active, disabled, children }) {
      return h('button', {
        type: 'button',
        className: 'dsh-pd-btn',
        'aria-label': label,
        title: label,
        'aria-pressed': active === undefined ? undefined : (active ? 'true' : 'false'),
        disabled: disabled || undefined,
        onClick,
      }, children)
    }

    function DiagramCard({ source, variant }) {
      const settings = useSettings()
      const dark = useDarkTheme()
      const t = translate
      useLocaleTick()
      const reducedMotion = useReducedMotion()

      const [view, setView] = useState(() => (settings.defaultView === 'code' ? 'code' : 'diagram'))
      const [scale, setScale] = useState(1)
      const [fullscreen, setFullscreen] = useState(false)
      const [copied, setCopied] = useState(false)
      const [stageHeight, setStageHeight] = useState(320)
      const [bodyWidth, setBodyWidth] = useState(0)
      const zoomRef = useRef(null)
      const bodyRef = useRef(null)
      const closeFullscreen = useCallback(() => setFullscreen(false), [])

      const rendered = usePeleRender(source, settings, bodyWidth)
      const type = rendered.type || diagramType(source)
      const failed = rendered.status === 'error'
      const ready = !!rendered.svg && (rendered.status === 'ok' || rendered.status === 'loading')
      const showDiagram = view === 'diagram' && !failed && ready
      const showSource = view === 'code' || failed || rendered.status === 'empty'

      const accent = accentCss(settings)
      const palette = paletteFor(settings, dark)
      const peleVars = peleVarsFor(settings, dark)
      const vars = Object.assign({
        '--dpd-accent': accent,
        '--dpd-radius': settings.radius + 'px',
        '--dpd-canvas': palette.canvas,
        '--dpd-canvas-fg': palette.canvasText,
        '--dpd-error': palette.error,
      }, peleVars)

      const maxHeight = settings.maxHeight > 0 ? settings.maxHeight : 4000

      useEffect(() => {
        const element = bodyRef.current
        if (!element) return undefined
        const observer = new ResizeObserver(entries => {
          const entry = entries[0]
          const width = entry && entry.contentRect ? entry.contentRect.width : element.clientWidth
          setBodyWidth(Math.round(width || 0))
        })
        observer.observe(element)
        setBodyWidth(element.clientWidth)
        return () => observer.disconnect()
      }, [])

      useEffect(() => {
        if (!ready || !bodyRef.current) return
        const available = Math.max(240, bodyRef.current.clientWidth || 640)
        const fit = Math.min(1, (available - 32) / Math.max(1, rendered.width))
        const natural = Math.round(rendered.height * fit + 40)
        setStageHeight(Math.max(190, Math.min(maxHeight, natural)))
      }, [ready, rendered.svg, rendered.width, rendered.height, maxHeight])

      const copySource = useCallback(() => {
        const text = String(source || '')
        const done = () => {
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1400)
        }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done).catch(() => {})
          return
        }
        const helper = document.createElement('textarea')
        helper.value = text
        helper.setAttribute('readonly', '')
        helper.style.position = 'fixed'
        helper.style.opacity = '0'
        document.body.appendChild(helper)
        helper.select()
        try { document.execCommand('copy'); done() } catch {}
        helper.remove()
      }, [source])

      const downloadSvg = useCallback(() => {
        if (!rendered.svg) return
        const standalone = bakePeleVars(rendered.svg, peleVars)
        const blob = new Blob(['<?xml version="1.0" encoding="UTF-8"?>\n' + standalone], {
          type: 'image/svg+xml;charset=utf-8',
        })
        const url = URL.createObjectURL(blob)
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = 'pele-' + (type || 'diagram') + '.svg'
        anchor.style.display = 'none'
        document.body.appendChild(anchor)
        anchor.click()
        anchor.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      }, [rendered.svg, type, peleVars])

      const animation = settings.animation && !reducedMotion

      const toolbar = h('div', {
        className: 'dsh-pd-tools',
        key: 'tools',
        'data-mode': settings.toolbar,
      }, [
        h('div', { className: 'dsh-pd-seg', role: 'group', key: 'seg', 'aria-label': t('badge') }, [
          h('button', {
            key: 'diagram',
            type: 'button',
            className: 'dsh-pd-seg-btn',
            'aria-pressed': view === 'diagram' ? 'true' : 'false',
            onClick: () => setView('diagram'),
            disabled: !ready,
          }, [h('span', { className: 'dsh-pd-seg-icon', key: 'i' }, h(IconDiagram, null)), t('diagramView')]),
          h('button', {
            key: 'code',
            type: 'button',
            className: 'dsh-pd-seg-btn',
            'aria-pressed': view === 'code' ? 'true' : 'false',
            onClick: () => setView('code'),
          }, [h('span', { className: 'dsh-pd-seg-icon', key: 'i' }, h(IconCode, null)), t('codeView')]),
        ]),
        h('div', { className: 'dsh-pd-tool-group', key: 'zoom' },
          showDiagram ? [
            h(ToolButton, { key: 'out', label: t('zoomOut'), onClick: () => zoomRef.current && zoomRef.current.zoomOut() }, h(IconMinus, null)),
            h('button', {
              key: 'level',
              type: 'button',
              className: 'dsh-pd-zoom-label',
              title: t('resetZoom'),
              'aria-label': t('resetZoom'),
              onClick: () => zoomRef.current && zoomRef.current.reset(),
            }, Math.round(scale * 100) + '%'),
            h(ToolButton, { key: 'in', label: t('zoomIn'), onClick: () => zoomRef.current && zoomRef.current.zoomIn() }, h(IconPlus, null)),
            h(ToolButton, { key: 'fit', label: t('fit'), onClick: () => zoomRef.current && zoomRef.current.fit() }, h(IconFit, null)),
          ] : null,
        ),
        h('div', { className: 'dsh-pd-tool-group', key: 'actions' }, [
          showSource ? h(ToolButton, { key: 'copy', label: copied ? t('copied') : t('copy'), onClick: copySource },
            copied ? h(IconCheck, null) : h(IconCopy, null)) : null,
          ready ? h(ToolButton, { key: 'download', label: t('download'), onClick: downloadSvg }, h(IconDownload, null)) : null,
          ready ? h(ToolButton, { key: 'full', label: t('fullscreen'), onClick: () => setFullscreen(true) }, h(IconExpand, null)) : null,
        ].filter(Boolean)),
      ])

      const body = showDiagram
        ? h(ZoomableDiagram, {
          ref: zoomRef,
          svg: rendered.svg,
          width: rendered.width,
          height: rendered.height,
          mode: 'inline',
          animation,
          onScale: setScale,
          labels: t('diagramLabel', { type }),
        })
        : showSource || failed
          ? h('div', { className: 'dsh-pd-source-wrap' },
            failed ? h('div', {
              className: 'dsh-pd-notice',
              role: 'note',
              title: rendered.error || undefined,
            }, [
              h('span', { className: 'dsh-pd-notice-dot', key: 'dot' }),
              h('span', { key: 'text' }, rendered.reason === 'chars' || rendered.reason === 'lines'
                ? t('tooLarge')
                : t('renderFailed')),
            ]) : null,
            h('pre', { className: 'dsh-pd-source', 'aria-label': t('source') }, source),
          )
          : h('div', { className: 'dsh-pd-skeleton', role: 'status', 'aria-label': t('loading') },
            h('span', { className: 'dsh-pd-shimmer' }),
            h('span', { className: 'dsh-pd-shimmer dsh-pd-shimmer-short' }))

      const status = ready
        ? t('statusRendered')
        : failed
          ? t('statusFailed')
          : t('loading')

      return h('div', {
        className: 'dsh-pd-card',
        'data-view': view === 'diagram' ? 'diagram' : 'code',
        'data-state': rendered.status,
        'data-variant': variant || 'inline',
        style: Object.assign({}, vars, view === 'diagram' && ready ? { '--dpd-stage-h': stageHeight + 'px' } : {}),
        role: 'figure',
        'aria-label': t('diagramLabel', { type }),
        'data-dsh-pd-owned': '',
      }, [
        h('div', { className: 'dsh-pd-bar', key: 'bar' }, [
          h('span', { className: 'dsh-pd-badge', key: 'badge' }, [
            h('span', { className: 'dsh-pd-badge-dot', key: 'dot' }),
            h('span', { className: 'dsh-pd-badge-name', key: 'name' }, t('badge')),
            h('span', { className: 'dsh-pd-badge-type', key: 'type' }, type),
          ]),
          toolbar,
        ]),
        h('div', { className: 'dsh-pd-body', key: 'body', ref: bodyRef }, body),
        h('div', { className: 'dsh-pd-sr', key: 'sr', role: 'status', 'aria-live': 'polite' }, status),
        fullscreen && ready ? h(FullscreenViewer, {
          key: 'fullscreen',
          svg: rendered.svg,
          width: rendered.width,
          height: rendered.height,
          type,
          vars,
          animation,
          onClose: closeFullscreen,
        }) : null,
      ])
    }

    /* ------------------------------------------------------------------ *
     * Fullscreen viewer
     * ------------------------------------------------------------------ */

    function FullscreenViewer({ svg, width, height, type, vars, animation, onClose }) {
      const t = translate
      useLocaleTick()
      const panelRef = useRef(null)
      const zoomRef = useRef(null)
      const [scale, setScale] = useState(1)

      useEffect(() => {
        const previousOverflow = document.body.style.overflow
        const previousActive = document.activeElement
        document.body.style.overflow = 'hidden'
        const focusables = () => {
          const panel = panelRef.current
          if (!panel) return []
          return Array.from(panel.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
            .filter(element => !element.disabled && element.getClientRects().length > 0)
        }
        const frame = window.requestAnimationFrame(() => {
          const first = focusables()[0]
          if (first) first.focus()
          else if (panelRef.current) panelRef.current.focus()
        })
        const onKeyDown = event => {
          if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
            return
          }
          if (event.key !== 'Tab') return
          const items = focusables()
          if (items.length === 0) {
            event.preventDefault()
            return
          }
          const first = items[0]
          const last = items[items.length - 1]
          const active = document.activeElement
          if (!panelRef.current.contains(active)) {
            event.preventDefault()
            first.focus()
          } else if (event.shiftKey && active === first) {
            event.preventDefault()
            last.focus()
          } else if (!event.shiftKey && active === last) {
            event.preventDefault()
            first.focus()
          }
        }
        document.addEventListener('keydown', onKeyDown, true)
        return () => {
          window.cancelAnimationFrame(frame)
          document.removeEventListener('keydown', onKeyDown, true)
          document.body.style.overflow = previousOverflow
          if (previousActive && previousActive.focus) previousActive.focus()
        }
      }, [onClose])

      const onBackdropClick = event => {
        if (event.target === event.currentTarget) onClose()
      }

      return createPortal(h('div', {
        className: 'dsh-pd-modal',
        'data-dsh-pd-owned': '',
        style: vars,
        onMouseDown: onBackdropClick,
      }, h('div', {
        ref: panelRef,
        className: 'dsh-pd-modal-panel',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': t('viewerLabel'),
        tabIndex: -1,
      }, [
        h('div', { className: 'dsh-pd-modal-bar', key: 'bar' }, [
          h('span', { className: 'dsh-pd-modal-title', key: 'title' }, t('viewerTitle', { type })),
          h('div', { className: 'dsh-pd-tool-group', key: 'zoom' }, [
            h(ToolButton, { key: 'out', label: t('zoomOut'), onClick: () => zoomRef.current && zoomRef.current.zoomOut() }, h(IconMinus, null)),
            h('button', {
              key: 'level',
              type: 'button',
              className: 'dsh-pd-zoom-label',
              title: t('resetZoom'),
              'aria-label': t('resetZoom'),
              onClick: () => zoomRef.current && zoomRef.current.reset(),
            }, Math.round(scale * 100) + '%'),
            h(ToolButton, { key: 'in', label: t('zoomIn'), onClick: () => zoomRef.current && zoomRef.current.zoomIn() }, h(IconPlus, null)),
            h(ToolButton, { key: 'fit', label: t('fit'), onClick: () => zoomRef.current && zoomRef.current.fit() }, h(IconFit, null)),
            h(ToolButton, { key: 'close', label: t('close'), onClick: onClose }, h(IconClose, null)),
          ]),
        ]),
        h('div', { className: 'dsh-pd-modal-body', key: 'body' }, h(ZoomableDiagram, {
          ref: zoomRef,
          svg,
          width,
          height,
          mode: 'fullscreen',
          animation,
          onScale: setScale,
          labels: t('diagramLabel', { type }),
        })),
      ])), document.body)
    }

    /* ------------------------------------------------------------------ *
     * Settings section
     * ------------------------------------------------------------------ */

    function SettingRow({ label, description, control }) {
      return h('div', { className: 'dsh-pd-set-row' }, [
        h('div', { className: 'dsh-pd-set-row-text', key: 'text' }, [
          h('div', { className: 'dsh-pd-set-label', key: 'label' }, label),
          description ? h('div', { className: 'dsh-pd-set-desc', key: 'desc' }, description) : null,
        ]),
        h('div', { className: 'dsh-pd-set-control', key: 'control' }, control),
      ])
    }

    function SegmentedControl({ value, options, onChange, label }) {
      return h('div', { className: 'dsh-pd-seg dsh-pd-seg-settings', role: 'group', 'aria-label': label }, options.map(option => (
        h('button', {
          key: option.value,
          type: 'button',
          className: 'dsh-pd-seg-btn',
          'aria-pressed': value === option.value ? 'true' : 'false',
          onClick: () => onChange(option.value),
        }, option.label)
      )))
    }

    function RangeControl({ value, min, max, step, display, onChange, label }) {
      return h('div', { className: 'dsh-pd-range' }, [
        h('input', {
          key: 'range',
          type: 'range',
          min,
          max,
          step,
          value,
          'aria-label': label,
          onChange: event => onChange(Number(event.target.value)),
        }),
        h('span', { key: 'value', className: 'dsh-pd-range-value' }, display),
      ])
    }

    function SettingsSection() {
      const t = translate
      useLocaleTick()
      const settings = useSettings()
      useDarkTheme()

      const accentValue = settings.accent === 'auto' ? resolvedAccent(settings) : settings.accent

      return h('div', { className: 'dsh-pd-settings', 'data-dsh-pd-owned': '' }, [
        h('header', { className: 'dsh-pd-settings-head', key: 'head' }, [
          h('h2', { key: 'title' }, t('settingsTitle')),
          h('p', { key: 'intro' }, t('settingsIntro')),
        ]),
        h('section', { className: 'dsh-pd-set-card', key: 'preview' }, [
          h('div', { className: 'dsh-pd-set-card-head', key: 'head' }, [
            h('span', { className: 'dsh-pd-set-card-dot', key: 'dot' }),
            t('preview'),
          ]),
          h('div', { className: 'dsh-pd-set-preview', key: 'body' }, h(DiagramCard, {
            source: PREVIEW_SOURCE,
            variant: 'preview',
          })),
        ]),
        h('section', { className: 'dsh-pd-set-card', key: 'appearance' }, [
          h('div', { className: 'dsh-pd-set-card-head', key: 'head' }, t('appearance')),
          h('div', { className: 'dsh-pd-set-body', key: 'body' }, [
            h(SettingRow, {
              key: 'accent',
              label: t('accent'),
              description: t('accentDesc'),
              control: h('div', { className: 'dsh-pd-accent' }, [
                h('label', { className: 'dsh-pd-swatch', key: 'swatch', style: { '--dpd-swatch': accentValue } }, [
                  h('input', {
                    key: 'input',
                    type: 'color',
                    value: isHex(accentValue) ? accentValue : '#4d6bfe',
                    'aria-label': t('accent'),
                    onChange: event => updateSettings({ accent: event.target.value }),
                  }),
                  h('span', { key: 'ring', className: 'dsh-pd-swatch-ring' }),
                ]),
                h('span', { key: 'hex', className: 'dsh-pd-hex' }, settings.accent === 'auto' ? t('followTheme') : settings.accent),
                h('button', {
                  key: 'auto',
                  type: 'button',
                  className: 'dsh-pd-mini',
                  disabled: settings.accent === 'auto',
                  onClick: () => updateSettings({ accent: 'auto' }),
                }, t('followTheme')),
              ]),
            }),
            h(SettingRow, {
              key: 'radius',
              label: t('radius'),
              description: t('radiusDesc'),
              control: h(RangeControl, {
                value: settings.radius,
                min: 0,
                max: 28,
                step: 1,
                display: settings.radius + ' px',
                label: t('radius'),
                onChange: value => updateSettings({ radius: value }),
              }),
            }),
            h(SettingRow, {
              key: 'font',
              label: t('fontScale'),
              description: t('fontScaleDesc'),
              control: h(RangeControl, {
                value: Math.round(settings.fontScale * 100),
                min: 80,
                max: 150,
                step: 5,
                display: Math.round(settings.fontScale * 100) + '%',
                label: t('fontScale'),
                onChange: value => updateSettings({ fontScale: value / 100 }),
              }),
            }),
            h(SettingRow, {
              key: 'theme',
              label: t('diagramTheme'),
              description: t('diagramThemeDesc'),
              control: h('select', {
                className: 'dsh-pd-select',
                value: settings.diagramTheme,
                'aria-label': t('diagramTheme'),
                onChange: event => updateSettings({ diagramTheme: event.target.value }),
              }, [
                h('option', { key: 'auto', value: 'auto' }, t('themeAuto')),
                h('option', { key: 'neutral', value: 'neutral' }, t('themeNeutral')),
                h('option', { key: 'dark', value: 'dark' }, t('themeDark')),
                h('option', { key: 'forest', value: 'forest' }, t('themeForest')),
                h('option', { key: 'base', value: 'base' }, t('themeBase')),
              ]),
            }),
          ]),
        ]),
        h('section', { className: 'dsh-pd-set-card', key: 'behavior' }, [
          h('div', { className: 'dsh-pd-set-card-head', key: 'head' }, t('behavior')),
          h('div', { className: 'dsh-pd-set-body', key: 'body' }, [
            h(SettingRow, {
              key: 'view',
              label: t('defaultView'),
              description: t('defaultViewDesc'),
              control: h(SegmentedControl, {
                value: settings.defaultView,
                label: t('defaultView'),
                options: [
                  { value: 'diagram', label: t('diagramView') },
                  { value: 'code', label: t('codeView') },
                ],
                onChange: value => updateSettings({ defaultView: value }),
              }),
            }),
            h(SettingRow, {
              key: 'toolbar',
              label: t('toolbarMode'),
              description: t('toolbarDesc'),
              control: h(SegmentedControl, {
                value: settings.toolbar,
                label: t('toolbarMode'),
                options: [
                  { value: 'always', label: t('toolbarAlways') },
                  { value: 'hover', label: t('toolbarHover') },
                ],
                onChange: value => updateSettings({ toolbar: value }),
              }),
            }),
            h(SettingRow, {
              key: 'height',
              label: t('maxHeight'),
              description: t('maxHeightDesc'),
              control: h('select', {
                className: 'dsh-pd-select',
                value: String(settings.maxHeight),
                'aria-label': t('maxHeight'),
                onChange: event => updateSettings({ maxHeight: Number(event.target.value) }),
              }, [0, 320, 420, 520, 680, 840].map(value => (
                h('option', { key: String(value), value: String(value) }, value === 0 ? t('unlimited') : value + ' px')
              ))),
            }),
            h(SettingRow, {
              key: 'animation',
              label: t('animation'),
              description: t('animationDesc'),
              control: h('button', {
                type: 'button',
                role: 'switch',
                'aria-checked': settings.animation ? 'true' : 'false',
                'aria-label': t('animation'),
                className: 'dsh-pd-switch',
                'data-on': settings.animation ? 'true' : 'false',
                onClick: () => updateSettings({ animation: !settings.animation }),
              }, h('span', { className: 'dsh-pd-switch-knob' })),
            }),
          ]),
        ]),
        h('footer', { className: 'dsh-pd-set-foot', key: 'foot' }, [
          h('span', { key: 'note' }, t('savedLocally')),
          h('button', { key: 'reset', type: 'button', className: 'dsh-pd-mini', onClick: resetSettings }, t('resetAll')),
        ]),
      ])
    }

    function matchReducedMotion() {
      return typeof window !== 'undefined' && window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
        : false
    }

    /* ------------------------------------------------------------------ *
     * DOM enhancer
     * ------------------------------------------------------------------ */

    function createEnhancer() {
      const entries = new Set()
      const byCode = new WeakMap()
      let disposed = false
      let observer = null
      let sweepFrame = 0

      function isOwned(node) {
        return !!(node && node.closest && node.closest('[data-dsh-pd-owned]'))
      }

      function languageOf(code) {
        const classes = code.classList
        if (classes && classes.length > 0) {
          let hasLanguageClass = false
          for (const name of classes) {
            if (/^language-mermaid(?:js)?$/i.test(name) || /^language-mmd$/i.test(name)) return 'mermaid'
            if (/^language-/i.test(name)) hasLanguageClass = true
          }
          if (hasLanguageClass) return null
        }
        const block = code.closest('.md-code-block')
        const labelNode = block ? block.querySelector('[data-text-interaction-exclude]') : null
        if (labelNode) {
          const label = String(labelNode.textContent || '').trim().toLowerCase().split(/\s+/)[0]
          if (label) {
            if (/^(mermaid|mermaidjs|mmd)$/.test(label)) return 'mermaid'
            // A generic plain-text label is not evidence of another language;
            // fall through to content detection so a mislabeled diagram still
            // renders. Any other explicit language (graphql, ts, …) wins.
            if (!/^(text|plaintext|plain|txt|md|markdown)$/.test(label)) return null
          }
        }
        return looksLikeDiagram(code.textContent || '') ? 'mermaid' : null
      }

      function consider(code) {
        if (disposed) return
        if (!code || !code.isConnected) return
        if (byCode.has(code)) return
        if (isOwned(code)) return
        if (code.closest('[contenteditable="true"]')) return
        const pre = code.closest('pre')
        if (!pre) return
        if (languageOf(code) !== 'mermaid') return
        const block = code.closest('.md-code-block') || pre
        const parent = block.parentNode
        if (!parent) return
        const host = document.createElement('div')
        host.className = 'dsh-pd-host'
        host.setAttribute('data-dsh-pd-owned', '')
        parent.insertBefore(host, block)
        const root = createRoot(host)
        const entry = {
          code,
          block,
          host,
          root,
          source: null,
          timer: 0,
          disposed: false,
        }
        byCode.set(code, entry)
        entries.add(entry)
        paint(entry, true)
      }

      function paint(entry, force) {
        if (entry.disposed) return
        const source = entry.code.textContent || ''
        if (!force && source === entry.source) return
        entry.source = source
        entry.root.render(h(CardBoundary, { source }, h(DiagramCard, { source, variant: 'inline' })))
      }

      function schedule(entry) {
        if (entry.disposed) return
        window.clearTimeout(entry.timer)
        entry.timer = window.setTimeout(() => {
          entry.timer = 0
          if (entry.disposed) return
          if (!entry.code.isConnected || !entry.host.isConnected) {
            destroy(entry)
            return
          }
          paint(entry, false)
        }, STREAM_SETTLE_MS)
      }

      function destroy(entry) {
        if (entry.disposed) return
        entry.disposed = true
        window.clearTimeout(entry.timer)
        entries.delete(entry)
        try { byCode.delete(entry.code) } catch {}
        try { entry.root.unmount() } catch {}
        try { entry.host.remove() } catch {}
      }

      function sweep() {
        if (sweepFrame) return
        sweepFrame = window.requestAnimationFrame(() => {
          sweepFrame = 0
          if (disposed) return
          for (const entry of Array.from(entries)) {
            if (!entry.host.isConnected || !entry.code.isConnected) destroy(entry)
          }
        })
      }

      function onRecords(records) {
        for (const record of records) {
          if (record.type === 'characterData') {
            const parent = record.target && record.target.parentElement
            if (!parent || isOwned(parent)) continue
            const code = parent.closest ? parent.closest('code') : null
            if (!code) continue
            const entry = byCode.get(code)
            if (entry) schedule(entry)
            else consider(code)
            continue
          }
          for (const node of record.addedNodes) {
            if (node.nodeType !== 1) continue
            if (isOwned(node)) continue
            if (node.tagName === 'CODE') consider(node)
            if (node.querySelectorAll) {
              const codes = node.querySelectorAll('pre > code')
              for (const code of codes) consider(code)
              if (node.querySelectorAll('code').length !== codes.length) {
                for (const code of node.querySelectorAll('code')) consider(code)
              }
            }
          }
          if (record.removedNodes && record.removedNodes.length > 0) sweep()
        }
      }

      function start() {
        if (disposed) return
        const initial = document.querySelectorAll('pre > code')
        for (const code of initial) consider(code)
        observer = new MutationObserver(onRecords)
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true,
        })
      }

      function stop() {
        disposed = true
        if (observer) observer.disconnect()
        observer = null
        if (sweepFrame) window.cancelAnimationFrame(sweepFrame)
        for (const entry of Array.from(entries)) destroy(entry)
      }

      return { start, stop }
    }

    /* ------------------------------------------------------------------ *
     * Stylesheet
     * ------------------------------------------------------------------ */

    const CSS = `
.dsh-pd-host{display:block}
.dsh-pd-host + .md-code-block,.dsh-pd-host + pre{display:none!important}

.dsh-pd-card{--dpd-accent:var(--dsw-alias-brand-primary);--dpd-radius:14px;--dpd-stage-h:340px;box-sizing:border-box;margin:10px 0 12px;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dpd-radius);background:var(--dsw-alias-bg-layer-1);overflow:hidden;color:var(--dsw-alias-label-primary);font-family:inherit;line-height:1.4}
.dsh-pd-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;min-height:38px;padding:4px 8px 4px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 62%,transparent)}
.dsh-pd-badge{display:flex;align-items:center;gap:7px;min-width:0;margin-right:auto;font-size:12px;color:var(--dsw-alias-label-secondary);white-space:nowrap}
.dsh-pd-badge-dot{width:7px;height:7px;border-radius:999px;background:var(--dpd-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--dpd-accent) 16%,transparent);flex:none}
.dsh-pd-badge-name{font-weight:600;letter-spacing:.01em;color:var(--dsw-alias-label-primary)}
.dsh-pd-badge-type{overflow:hidden;text-overflow:ellipsis;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;color:var(--dsw-alias-label-tertiary)}
.dsh-pd-tools{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:8px;min-width:0}
.dsh-pd-tools[data-mode='hover']{transition:opacity .16s ease}
@media (hover:hover) and (pointer:fine){.dsh-pd-tools[data-mode='hover']{opacity:0}.dsh-pd-card:hover .dsh-pd-tools[data-mode='hover'],.dsh-pd-card:focus-within .dsh-pd-tools[data-mode='hover']{opacity:1}}
.dsh-pd-tool-group{display:flex;align-items:center;gap:2px}
.dsh-pd-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;min-width:26px;height:26px;padding:0 6px;border:1px solid transparent;border-radius:clamp(4px,calc(var(--dpd-radius) * .42),9px);background:transparent;color:var(--dsw-alias-label-secondary);font:12px/1 inherit;cursor:pointer;transition:background .12s ease,color .12s ease,border-color .12s ease}
.dsh-pd-btn:hover:not([disabled]){background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-label-primary)}
.dsh-pd-btn:focus-visible{outline:2px solid var(--dpd-accent);outline-offset:1px}
.dsh-pd-btn[disabled]{opacity:.4;cursor:default}
.dsh-pd-zoom-label{appearance:none;min-width:46px;height:26px;padding:0 4px;border:1px solid transparent;border-radius:clamp(4px,calc(var(--dpd-radius) * .42),9px);background:transparent;color:var(--dsw-alias-label-tertiary);font:11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;cursor:pointer}
.dsh-pd-zoom-label:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent);color:var(--dsw-alias-label-primary)}
.dsh-pd-zoom-label:focus-visible{outline:2px solid var(--dpd-accent);outline-offset:1px}
.dsh-pd-seg{display:inline-flex;align-items:center;gap:2px;padding:2px;border:1px solid var(--dsw-alias-border-l1);border-radius:clamp(5px,calc(var(--dpd-radius) * .48),10px);background:color-mix(in srgb,var(--dsw-alias-label-primary) 4%,transparent)}
.dsh-pd-seg-btn{appearance:none;display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 8px;border:0;border-radius:clamp(3px,calc(var(--dpd-radius) * .34),7px);background:transparent;color:var(--dsw-alias-label-secondary);font:11px/1 inherit;cursor:pointer;white-space:nowrap}
.dsh-pd-seg-btn:hover:not([disabled]){color:var(--dsw-alias-label-primary)}
.dsh-pd-seg-btn[aria-pressed='true']{background:var(--dsw-alias-bg-layer-1);color:var(--dpd-accent);box-shadow:0 0 0 1px color-mix(in srgb,var(--dpd-accent) 26%,transparent)}
.dsh-pd-seg-btn:focus-visible{outline:2px solid var(--dpd-accent);outline-offset:1px}
.dsh-pd-seg-btn[disabled]{opacity:.4;cursor:default}
.dsh-pd-seg-icon{display:inline-flex}

.dsh-pd-body{position:relative;background:var(--dpd-canvas,var(--dsw-alias-bg-layer-1));color:var(--dpd-canvas-fg,var(--dsw-alias-label-primary))}
.dsh-pd-viewport{position:relative;height:var(--dpd-stage-h);overflow:hidden;cursor:grab;touch-action:none;background-color:var(--dpd-canvas,var(--dsw-alias-bg-layer-1));background-image:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--dpd-canvas-fg,var(--dsw-alias-label-primary)) 15%,transparent) 1px,transparent 0);background-size:18px 18px}
.dsh-pd-viewport[data-dragging='true']{cursor:grabbing}
.dsh-pd-viewport:focus-visible{outline:2px solid var(--dpd-accent);outline-offset:-3px}
.dsh-pd-stage{position:absolute;left:50%;top:50%;transform-origin:center center;will-change:transform}
.dsh-pd-stage svg{display:block;max-width:none!important;height:auto;background:transparent}
.dsh-pd-stage svg text{user-select:none}

.dsh-pd-source-wrap{display:flex;flex-direction:column;min-width:0}
.dsh-pd-source{margin:0;padding:12px 14px;max-height:var(--dpd-stage-h);overflow:auto;background:var(--dpd-canvas,var(--dsw-alias-bg-layer-2));color:var(--dpd-canvas-fg,var(--dsw-alias-label-primary));font:12.5px/1.65 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre;tab-size:2}
.dsh-pd-notice{display:flex;align-items:flex-start;gap:8px;padding:9px 14px;border-bottom:1px solid color-mix(in srgb,var(--dpd-error,var(--dsw-alias-state-error-primary)) 24%,transparent);background:color-mix(in srgb,var(--dpd-error,var(--dsw-alias-state-error-primary)) 10%,transparent);color:var(--dpd-error,var(--dsw-alias-state-error-primary));font-size:12px;line-height:1.5}
.dsh-pd-notice-dot{width:6px;height:6px;margin-top:5px;border-radius:999px;background:currentColor;flex:none}

.dsh-pd-skeleton{display:flex;flex-direction:column;gap:10px;padding:26px 18px;min-height:190px;justify-content:center}
.dsh-pd-shimmer{display:block;height:12px;border-radius:6px;background:linear-gradient(90deg,color-mix(in srgb,var(--dpd-canvas-fg,var(--dsw-alias-label-primary)) 6%,transparent),color-mix(in srgb,var(--dpd-canvas-fg,var(--dsw-alias-label-primary)) 15%,transparent),color-mix(in srgb,var(--dpd-canvas-fg,var(--dsw-alias-label-primary)) 6%,transparent));background-size:200% 100%;animation:dsh-pd-shimmer 1.3s linear infinite}
.dsh-pd-shimmer-short{width:58%}
@keyframes dsh-pd-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.dsh-pd-sr{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}

.dsh-pd-modal{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 72%,transparent);backdrop-filter:blur(10px)}
.dsh-pd-modal-panel{display:flex;flex-direction:column;width:min(94vw,1400px);height:min(90vh,1040px);border:1px solid var(--dsw-alias-border-l1);border-radius:calc(var(--dpd-radius) + 4px);background:var(--dsw-alias-bg-layer-1);box-shadow:0 18px 60px color-mix(in srgb,var(--dsw-alias-label-primary) 18%,transparent);overflow:hidden;outline:none}
.dsh-pd-modal-bar{display:flex;align-items:center;gap:12px;min-height:48px;padding:8px 12px;border-bottom:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb,var(--dsw-alias-bg-layer-2) 60%,transparent)}
.dsh-pd-modal-title{margin-right:auto;font-size:13px;font-weight:600;color:var(--dsw-alias-label-primary)}
.dsh-pd-modal-body{position:relative;flex:1;min-height:0}
.dsh-pd-modal .dsh-pd-viewport{height:100%;background-image:radial-gradient(circle at 1px 1px,color-mix(in srgb,var(--dpd-canvas-fg,var(--dsw-alias-label-primary)) 15%,transparent) 1px,transparent 0);background-size:20px 20px}

.dsh-pd-settings{display:flex;flex-direction:column;gap:16px;max-width:780px;padding:2px 0 36px;color:var(--dsw-alias-label-primary)}
.dsh-pd-settings-head h2{margin:0;font-size:18px;font-weight:600;line-height:1.4}
.dsh-pd-settings-head p{margin:6px 0 0;font-size:13px;line-height:1.65;color:var(--dsw-alias-label-secondary)}
.dsh-pd-set-card{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);overflow:hidden}
.dsh-pd-set-card-head{display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:1px solid var(--dsw-alias-border-l1);font-size:13px;font-weight:600}
.dsh-pd-set-card-dot{width:6px;height:6px;border-radius:999px;background:var(--dsw-alias-brand-primary)}
.dsh-pd-set-preview{padding:2px 16px 8px}
.dsh-pd-set-preview .dsh-pd-card{margin:12px 0 6px}
.dsh-pd-set-body{padding:2px 16px 10px}
.dsh-pd-set-row{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:13px 0}
.dsh-pd-set-row + .dsh-pd-set-row{border-top:1px solid color-mix(in srgb,var(--dsw-alias-border-l1) 62%,transparent)}
.dsh-pd-set-row-text{min-width:0}
.dsh-pd-set-label{font-size:13px;color:var(--dsw-alias-label-primary)}
.dsh-pd-set-desc{margin-top:3px;font-size:12px;line-height:1.55;color:var(--dsw-alias-label-tertiary);max-width:420px}
.dsh-pd-set-control{flex:none;display:flex;align-items:center}
.dsh-pd-accent{display:flex;align-items:center;gap:10px}
.dsh-pd-swatch{position:relative;display:inline-flex;width:34px;height:26px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dpd-swatch);cursor:pointer;overflow:hidden}
.dsh-pd-swatch input{position:absolute;inset:0;opacity:0;cursor:pointer}
.dsh-pd-swatch-ring{position:absolute;inset:0;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)}
.dsh-pd-hex{font:11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-tertiary);min-width:76px}
.dsh-pd-mini{appearance:none;height:26px;padding:0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:transparent;color:var(--dsw-alias-label-secondary);font:12px/1 inherit;cursor:pointer}
.dsh-pd-mini:hover:not([disabled]){background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent);color:var(--dsw-alias-label-primary)}
.dsh-pd-mini:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-pd-mini[disabled]{opacity:.45;cursor:default}
.dsh-pd-select{appearance:none;height:28px;min-width:118px;padding:0 26px 0 10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font:12px/1 inherit;cursor:pointer;background-image:linear-gradient(45deg,transparent 50%,var(--dsw-alias-label-tertiary) 50%),linear-gradient(135deg,var(--dsw-alias-label-tertiary) 50%,transparent 50%);background-position:calc(100% - 14px) 50%,calc(100% - 9px) 50%;background-size:5px 5px;background-repeat:no-repeat}
.dsh-pd-select:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-pd-range{display:flex;align-items:center;gap:10px}
.dsh-pd-range input{width:150px;accent-color:var(--dsw-alias-brand-primary);cursor:pointer}
.dsh-pd-range-value{min-width:46px;text-align:right;font:11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--dsw-alias-label-tertiary)}
.dsh-pd-seg-settings{background:transparent}
.dsh-pd-switch{appearance:none;position:relative;width:38px;height:22px;padding:0;border:1px solid var(--dsw-alias-border-l2);border-radius:999px;background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent);cursor:pointer;transition:background .15s ease,border-color .15s ease}
.dsh-pd-switch[data-on='true']{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.dsh-pd-switch:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}
.dsh-pd-switch-knob{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:999px;background:var(--dsw-alias-bg-layer-1);box-shadow:0 1px 2px color-mix(in srgb,var(--dsw-alias-label-primary) 25%,transparent);transition:transform .15s ease}
.dsh-pd-switch[data-on='true'] .dsh-pd-switch-knob{transform:translateX(16px);background:#fff}
.dsh-pd-set-foot{display:flex;align-items:center;justify-content:space-between;gap:16px;font-size:12px;color:var(--dsw-alias-label-tertiary)}

@media (prefers-reduced-motion:reduce){
.dsh-pd-shimmer{animation:none}
.dsh-pd-stage{transition:none!important}
.dsh-pd-tools,.dsh-pd-btn,.dsh-pd-switch,.dsh-pd-switch-knob{transition:none!important}
}
@media (max-width:720px){
.dsh-pd-set-row{flex-direction:column;align-items:flex-start;gap:10px}
.dsh-pd-set-control{width:100%;justify-content:flex-start}
.dsh-pd-range input{width:min(220px,72vw)}
.dsh-pd-modal{padding:0}
.dsh-pd-modal-panel{width:100vw;height:100vh;border-radius:0;border:none}
}
`

    /* ------------------------------------------------------------------ *
     * Plugin
     * ------------------------------------------------------------------ */

    function apply(ctx) {
      if (typeof document === 'undefined' || !document.body) return
      hydrateSettings()
      localeService = ctx.get('locale') || null
      if (localeService && typeof localeService.register === 'function') {
        for (const [locale, dict] of Object.entries(DICTS)) {
          try { localeService.register(LOCALE_NS, locale, dict) } catch {}
        }
      }

      const style = document.createElement('style')
      style.dataset.dshPeleDiagram = ''
      style.textContent = CSS
      document.head.append(style)

      const enhancer = createEnhancer()
      enhancer.start()

      const themeObserver = new MutationObserver(notifyTheme)
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] })

      ctx.effect(() => () => {
        themeObserver.disconnect()
        enhancer.stop()
        window.clearTimeout(settingsSaveTimer)
        disposeMath()
        style.remove()
      }, 'pele-diagram: chat enhancer')

      ctx.slots.inject('settings.section', () => ctx.slots.register({
        name: 'settings.section',
        id: 'pele-diagrams',
        order: 13,
        label: () => translate('settingsNav'),
      }, SettingsSection))

      ctx.slots.inject('settings.section.icon', () => ctx.slots.register({
        name: 'settings.section.icon',
        id: 'pele-diagrams',
        order: 13,
        label: () => translate('settingsNav'),
      }, props => h(IconSettingsNav, { size: props.size })))
    }

    return {
      inject: ['slots', 'locale'],
      apply,
    }
  },
})
