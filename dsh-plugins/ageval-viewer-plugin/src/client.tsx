import { CustomSelect as Select } from './select';
import { createElement as h, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  classifyStep, filterItems, formatElapsedMs, groupInvokes, hasMultipleProfiles, inheritedCut,
  outlineText, parseTrajectory, statusText, stepBody, stepElapsedMs, stepIconName, stopText, visibleSteps,
} from './trajectory.js';

type DataSource = { kind: 'local' | 'ssh'; path: string; host?: string };
type Host = { alias: string; hostName?: string; user?: string; port?: string };
type DirectoryEntry = { name: string; path: string };

type Row = {
  dataset: string; suite: string; model?: string; harness?: string; status: string;
  pass?: number | null; fail?: number | null; error?: number | null; expected?: number | null;
  passRate?: number | null; clean?: boolean;
};
type Task = { taskId: string; status: string; score?: unknown; errorTitle?: string; errorMessage?: string; runId?: string; runIds?: string[] };
type DetailData = { row: Row; tasks: Task[]; errors: Record<string, number> };
type EvidenceFile = { bytes: number; truncated?: boolean; text: string };
type Attempt = { dataset: string; suite: string; taskId: string; runId: string; files?: Record<string, EvidenceFile> };

const API = '/fstack-ageval/api';
const TAB_ID = 'fstack-ageval-viewer';
const NS = 'fstack-ageval-viewer';
const STYLE_TEXT = '__AGEVAL_CSS__';
const PREVIEW_LINES = 2.5;
const TICK = String.fromCharCode(96);
const FENCE = TICK + TICK + TICK;

const zh = {
  title: 'ageval', guide: '查看本机 ageval 运行结果', save: '保存', refresh: '刷新', loading: '读取中…',
  empty: '没有匹配的 suite', noRoot: '先填写 dataset 根目录', search: '搜索 suite / model / bench',
  selected: '已选', send: '发给当前 session', newSession: '新建 session', question: '让 agent 分析已选结果…',
  failed: '请求失败', sent: '已发送', currentUnavailable: '当前 session 不可用',
  readOnly: '只读', allBenches: '全部 bench', allModels: '全部 model', allStatuses: '全部状态', allVerdicts: '全部结果',
  clean: '完场, E=0', hasErrors: '有 ERROR', clear: '清除', addContext: '加入分析', suites: 'suites', tasksCount: 'tasks',
  passRate: '通过率', changeRoot: '更改', collapseRoot: '收起', files: '文件', noSteps: '这条 run 没有 trajectory.jsonl',
  noTasks: '没有匹配的 task', observational: '轨迹只记录过程，PASS 由独立评测给出。', fork: '以上继承自父 attempt',
  expandAll: '展开', collapseAll: '收起', copy: '复制', copied: '已复制', truncated: '已截断',
};
const dict = zh;

const ICONS: Record<string, [string, Record<string, string>][]> = {
  user: [['circle', { cx: '12', cy: '8', r: '4' }], ['path', { d: 'M5 20v-1a7 7 0 0 1 14 0v1' }]],
  agent: [['path', { d: 'M12 8V4H8' }], ['rect', { x: '4', y: '8', width: '16', height: '12', rx: '2' }], ['path', { d: 'M2 14h2M20 14h2M9 13v2M15 13v2' }]],
  thought: [['path', { d: 'M9.5 9a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 4' }], ['path', { d: 'M12 17h.01' }], ['path', { d: 'M8 19a6.5 6.5 0 1 1 9.2-6' }]],
  tool: [['path', { d: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z' }]],
  observation: [['path', { d: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z' }], ['circle', { cx: '12', cy: '12', r: '3' }]],
  terminal: [['path', { d: 'm4 17 6-6-6-6' }], ['path', { d: 'M12 19h8' }]],
  permission: [['path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10' }]],
  message: [['path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }]],
  grid: [['rect', { x: '3', y: '3', width: '7', height: '7', rx: '1' }], ['rect', { x: '14', y: '3', width: '7', height: '7', rx: '1' }], ['rect', { x: '14', y: '14', width: '7', height: '7', rx: '1' }], ['rect', { x: '3', y: '14', width: '7', height: '7', rx: '1' }]],
  search: [['circle', { cx: '11', cy: '11', r: '7' }], ['path', { d: 'm20 20-3.5-3.5' }]],
  pen: [['path', { d: 'M12 20h9' }], ['path', { d: 'M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z' }]],
  chevron: [['path', { d: 'm6 9 6 6 6-6' }]],
  copy: [['rect', { x: '9', y: '9', width: '13', height: '13', rx: '2' }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
};

function get(ctx: any, name: string): any { try { return typeof ctx?.get === 'function' ? ctx.get(name) : ctx?.[name]; } catch { return undefined; } }
async function readJson(url: string, init?: RequestInit, source?: string): Promise<any> {
  const headers = new Headers(init?.headers);
  if (init?.method && init.method !== 'GET') { headers.set('content-type', 'application/json'); headers.set('x-ageval-action', '1'); }
  if (source) headers.set('x-ageval-source', source);
  const response = await fetch(url, { credentials: 'same-origin', ...init, headers });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error || dict.failed);
  return body;
}
function injectCss(): void {
  const style = document.querySelector('style[data-ageval-viewer]') || document.createElement('style');
  style.setAttribute('data-ageval-viewer', 'true');
  if (style.textContent !== STYLE_TEXT) style.textContent = STYLE_TEXT;
  if (!style.parentNode) document.head.appendChild(style);
}
function sessionIdOf(ctx: any, props: any): string | undefined {
  for (const id of [props?.sessionId, props?.tab?.sessionId]) if (typeof id === 'string' && id) return id;
  const rows = get(ctx, 'sessions')?.list?.getSnapshot?.()?.byId || {};
  for (const [id, row] of Object.entries(rows as Record<string, any>)) if ((row?.retainedBy?.mainView || 0) > 0) return id;
  return undefined;
}
function pct(value: number | null | undefined): string { return value == null ? '-' : (value * 100).toFixed(1) + '%'; }
function formatScore(value: unknown): string { return typeof value === 'number' && Number.isFinite(value) ? String(Number(value.toFixed(3))) : String(value); }
function benchLabel(name: string, root: string): string {
  if (name !== '.') return name;
  return root.split('/').filter(Boolean).pop() || 'dataset';
}
function verdictOf(status: string): 'pass' | 'fail' | 'error' | 'other' {
  const value = String(status || '').toLowerCase();
  if (value === 'pass' || value === 'passed') return 'pass';
  if (value === 'fail' || value === 'failed') return 'fail';
  if (value === 'error' || value === 'errored') return 'error';
  return 'other';
}
function scrollParent(node: HTMLElement): HTMLElement {
  let el: HTMLElement | null = node.parentElement;
  while (el) {
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return el;
    el = el.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}
function icon(name: string, className?: string) {
  const spec = ICONS[name] || ICONS.message;
  return h('svg', {
    viewBox: '0 0 24 24', width: 14, height: 14, fill: 'none', stroke: 'currentColor', strokeWidth: 2,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true, className: className ? 'ageval-ico ' + className : 'ageval-ico',
  }, spec.map(([tag, attrs], index) => h(tag, { key: index, ...attrs })));
}
function inlineNodes(text: string) {
  const nodes: any[] = [];
  const re = new RegExp('(' + TICK + '[^' + TICK + '\n]+' + TICK + ')|(\\*\\*([^*]+)\\*\\*)', 'g');
  let last = 0; let match: RegExpExecArray | null; let key = 0;
  while ((match = re.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1]) nodes.push(h('code', { key: key++, className: 'ageval-inline-code' }, match[1].slice(1, -1)));
    else nodes.push(h('strong', { key: key++, className: 'ageval-strong' }, match[3]));
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}
function proseNodes(text: string) {
  const blocks: any[] = [];
  const lines = text.split('\n');
  let index = 0; let key = 0;
  while (index < lines.length) {
    if (lines[index].startsWith(FENCE)) {
      const buf: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith(FENCE)) { buf.push(lines[index]); index += 1; }
      if (index < lines.length) index += 1;
      blocks.push(h('pre', { key: key++, className: 'ageval-codeblock' }, buf.join('\n')));
      continue;
    }
    const buf: string[] = [];
    while (index < lines.length && !lines[index].startsWith(FENCE)) { buf.push(lines[index]); index += 1; }
    blocks.push(h('div', { key: key++, className: 'ageval-prose' }, inlineNodes(buf.join('\n'))));
  }
  return blocks;
}
function Button({ children, onClick, disabled, accent = false, quiet = false, className = '', label }: any) {
  return h('button', { type: 'button', className: 'ageval-button' + (accent ? ' ageval-button--accent' : '') + (quiet ? ' ageval-button--quiet' : '') + (className ? ' ' + className : ''), onClick, disabled, 'aria-label': label }, children);
}

function ScoreRing({ value }: { value?: number | null }) {
  if (value == null || !Number.isFinite(value)) return h('span', { className: 'ageval-ring' }, '-');
  const ratio = Math.max(0, Math.min(1, value));
  const size = 18; const stroke = 2.5; const radius = (size - stroke) / 2; const circumference = 2 * Math.PI * radius;
  return h('span', { className: 'ageval-ring', title: pct(value) + ' ' + dict.passRate },
    h('svg', { width: size, height: size, viewBox: '0 0 ' + size + ' ' + size, className: 'ageval-ring-svg', 'aria-hidden': true },
      h('circle', { cx: size / 2, cy: size / 2, r: radius, className: 'ageval-ring-track', fill: 'none', strokeWidth: stroke }),
      ratio > 0 ? h('circle', { cx: size / 2, cy: size / 2, r: radius, className: 'ageval-ring-fill', fill: 'none', strokeWidth: stroke, strokeDasharray: (ratio * circumference) + ' ' + circumference, strokeLinecap: 'round' }) : null),
    h('span', { className: 'ageval-ring-label' }, pct(value)));
}
function Metrics({ row }: { row: Row }) {
  return h('span', { className: 'ageval-metrics' }, 'P ' + (row.pass ?? '-') + '  F ' + (row.fail ?? '-') + '  E ' + (row.error ?? '-'));
}
function Banner({ error, message }: { error?: string; message?: string }) {
  if (error) return h('div', { className: 'ageval-banner ageval-banner--error', role: 'alert' }, error);
  if (message) return h('div', { className: 'ageval-banner ageval-banner--ok' }, message);
  return null;
}
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return h('button', {
    type: 'button', className: 'ageval-icon-btn', title: copied ? dict.copied : dict.copy, 'aria-label': copied ? dict.copied : dict.copy,
    onClick: (event: any) => {
      event.stopPropagation();
      navigator.clipboard?.writeText(text).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200); }).catch(() => {});
    },
  }, icon(copied ? 'check' : 'copy'));
}
function StepItem({ step, stepId, hideTurn, allExpanded, expandGen }: { step: any; stepId: string; hideTurn: boolean; allExpanded: boolean; expandGen: number }) {
  const liRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const repositionRef = useRef(false);
  const [overflows, setOverflows] = useState(false);
  const [open, setOpen] = useState(true);
  const body = stepBody(step);
  const flags = body.flags;
  const elapsed = stepElapsedMs(step);
  const status = statusText(step);
  const stop = stopText(step);
  const failed = status && /fail|error|cancel/i.test(status);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el || !body.text) { setOverflows(false); return; }
    const check = () => {
      const probe = el.firstElementChild instanceof HTMLElement ? el.firstElementChild : el;
      const lineHeight = parseFloat(getComputedStyle(probe).lineHeight);
      const line = Number.isFinite(lineHeight) && lineHeight > 0 ? lineHeight : 20;
      setOverflows(el.scrollHeight > PREVIEW_LINES * line + 1);
    };
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [body.text, body.kind]);
  useEffect(() => { if (!overflows || expandGen === 0) return; setOpen(allExpanded); }, [overflows, allExpanded, expandGen]);
  function toggle() {
    const li = liRef.current;
    if (li) {
      const scroller = scrollParent(li);
      const offset = parseFloat(getComputedStyle(scroller).getPropertyValue('--traj-invoke-h')) || 0;
      if (li.getBoundingClientRect().top - scroller.getBoundingClientRect().top < offset - 1) repositionRef.current = true;
    }
    setOpen(value => !value);
  }
  useLayoutEffect(() => {
    if (!repositionRef.current) return;
    repositionRef.current = false;
    const li = liRef.current;
    if (!li) return;
    const scroller = scrollParent(li);
    const offset = parseFloat(getComputedStyle(scroller).getPropertyValue('--traj-invoke-h')) || 0;
    scroller.scrollTop = Math.max(0, li.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - offset);
  }, [open]);
  const folded = Boolean(body.text) && overflows && !open;
  const rendered = !body.text ? null : body.kind === 'prose' ? proseNodes(body.text) : h('pre', { className: 'ageval-codeblock' }, body.text);
  return h('article', { ref: liRef, className: 'ageval-step' + (flags.isObservation ? ' ageval-step--observation' : ''), 'data-traj-step': stepId },
    h('div', { className: 'ageval-step-head' },
      h('div', { className: 'ageval-step-main' },
        h('div', { className: 'ageval-step-label ageval-step-label--' + flags.major }, icon(stepIconName(step)), h('span', null, flags.label)),
        !hideTurn && step.turn_index != null ? h('span', { className: 'ageval-turn' }, 'turn ' + step.turn_index) : null,
        flags.isToolCall && step.kind && step.kind !== flags.label ? h('span', { className: 'ageval-step-kind' }, step.kind) : null),
      h('div', { className: 'ageval-step-side' },
        status ? h('span', { className: failed ? 'ageval-error-text ageval-turn' : 'ageval-turn' }, status) : null,
        stop ? h('span', { className: 'ageval-turn' }, stop) : null,
        step.ok === false ? h('span', { className: 'ageval-error-text ageval-turn' }, 'not ok') : null,
        elapsed != null ? h('span', { className: 'ageval-turn' }, formatElapsedMs(elapsed)) : null,
        body.text && overflows ? h('button', { type: 'button', className: 'ageval-icon-btn', onClick: toggle, 'aria-expanded': open, 'aria-label': open ? '收起这一步' : '展开这一步' }, icon('chevron', open ? 'ageval-chevron ageval-chevron--open' : 'ageval-chevron')) : null,
        body.text ? h(CopyButton, { text: body.text }) : null)),
    body.text ? h('div', { className: 'ageval-step-body' + (folded ? ' ageval-step-body--fold' : ''), onClick: folded ? toggle : undefined }, h('div', { ref: contentRef }, rendered))
      : (flags.isToolCall || flags.isObservation || flags.isPermission) ? h('div', { className: 'ageval-step-empty' }, flags.isToolCall ? 'tool call (no args)' : flags.isObservation ? 'observation (empty)' : 'permission (no decision fields)') : null);
}
function Outline({ items, activeId, onJump }: { items: { id: string; text: string; icon: string; major: string; weight: number }[]; activeId: string | null; onJump: (id: string) => void }) {
  const [pointerOpen, setPointerOpen] = useState(false);
  const [keyOpen, setKeyOpen] = useState(false);
  const open = pointerOpen || keyOpen;
  const listRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (pointerOpen) return;
    const list = listRef.current;
    if (!list || !activeId) return;
    const button = list.querySelector<HTMLElement>('[data-outline-id="' + activeId + '"]');
    if (!button) return;
    const top = button.offsetTop; const bottom = top + button.offsetHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight;
  }, [activeId, open, pointerOpen]);
  if (items.length < 2) return null;
  const weights = items.map(item => item.weight);
  const minWeight = Math.min(...weights); const maxWeight = Math.max(...weights);
  return h('div', { className: 'ageval-outline-dock' }, h('nav', {
    ref: listRef, className: 'ageval-outline' + (open ? ' ageval-outline--open' : ''), 'aria-label': '轨迹大纲',
    onPointerEnter: () => setPointerOpen(true), onPointerLeave: () => setPointerOpen(false), onFocus: () => setKeyOpen(true),
    onBlur: (event: any) => { if (!event.currentTarget.contains(event.relatedTarget)) setKeyOpen(false); },
  }, items.map(item => {
    const width = maxWeight <= minWeight ? 17 : 10 + Math.sqrt((item.weight - minWeight) / (maxWeight - minWeight)) * 14;
    return h('button', {
      key: item.id, type: 'button', className: 'ageval-outline-btn', 'data-outline-id': item.id, title: item.text, 'aria-label': item.text,
      'aria-current': item.id === activeId ? 'location' : undefined,
      onMouseDown: (event: any) => event.preventDefault(), onClick: () => onJump(item.id),
    }, open
      ? [icon(item.icon), h('span', { key: 't', className: 'ageval-outline-text' }, item.text)]
      : h('span', { className: 'ageval-outline-bar', style: { width: width + 'px' } }));
  })));
}
function StepList({ steps, hideTurn, allExpanded, expandGen, start = 0 }: { steps: any[]; hideTurn: boolean; allExpanded: boolean; expandGen: number; start?: number }) {
  return h('div', null, steps.map((step, index) => h(StepItem, { key: String(step.line || index) + '-' + String(start + index), step, stepId: 'traj-step-' + String(start + index), hideTurn, allExpanded, expandGen })));
}
function Trajectory({ raw, truncated }: { raw: string; truncated?: boolean }) {
  const steps = useMemo(() => visibleSteps(parseTrajectory(raw)), [raw]);
  const items = useMemo(() => filterItems(steps), [steps]);
  const [kind, setKind] = useState('all');
  const [allExpanded, setAllExpanded] = useState(true);
  const [expandGen, setExpandGen] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const portRef = useRef<HTMLDivElement | null>(null);
  const invokeRef = useRef<HTMLDivElement | null>(null);
  const shown = useMemo(() => kind === 'all' ? steps : steps.filter(step => classifyStep(step).major === kind), [steps, kind]);
  const multi = useMemo(() => hasMultipleProfiles(shown), [shown]);
  const blocks = useMemo(() => groupInvokes(shown), [shown]);
  const showInvoke = multi && blocks.length >= 2 && blocks.some(block => block.turn != null);
  const outline = useMemo(() => shown.map((step, index) => ({ id: 'traj-step-' + index, text: outlineText(step), icon: stepIconName(step), major: classifyStep(step).major, weight: Math.max(1, outlineText(step).length) })), [shown]);
  useEffect(() => { if (kind !== 'all' && items.length && !items.some(item => item.id === kind)) setKind('all'); }, [items, kind]);
  useEffect(() => { if (portRef.current) portRef.current.scrollTop = 0; }, [kind]);
  useLayoutEffect(() => {
    const header = invokeRef.current; const port = portRef.current;
    if (!showInvoke || !header || !port) { port?.style.removeProperty('--traj-invoke-h'); return; }
    const apply = () => port.style.setProperty('--traj-invoke-h', header.offsetHeight + 'px');
    const observer = new ResizeObserver(apply); observer.observe(header); apply();
    return () => observer.disconnect();
  }, [showInvoke, blocks]);
  useEffect(() => {
    const root = portRef.current;
    if (!root || outline.length < 2) return;
    const nodes = [...root.querySelectorAll<HTMLElement>('[data-traj-step]')];
    const visible = new Map<string, number>();
    const pick = () => { const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0]; if (top) setActiveId(top[0]); };
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) {
        const id = entry.target.getAttribute('data-traj-step');
        if (!id) continue;
        if (entry.isIntersecting) visible.set(id, entry.boundingClientRect.top); else visible.delete(id);
      }
      pick();
    }, { root, rootMargin: '0px 0px -70% 0px', threshold: [0, 0.25] });
    nodes.forEach(node => observer.observe(node));
    setActiveId(outline[0]?.id ?? null);
    return () => observer.disconnect();
  }, [outline]);
  function jump(id: string) {
    const root = portRef.current;
    const el = root?.querySelector<HTMLElement>('[data-traj-step="' + id + '"]');
    if (!root || !el) return;
    setActiveId(id);
    const offset = parseFloat(getComputedStyle(root).getPropertyValue('--traj-invoke-h')) || 0;
    const dest = Math.max(0, el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop - offset);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.scrollTo({ top: dest, behavior: !reduced && Math.abs(dest - root.scrollTop) < 1600 ? 'smooth' : 'auto' });
  }
  const cut = kind === 'all' ? inheritedCut(shown) : -1;
  let cursor = 0;
  const body = !shown.length ? h('div', { className: 'ageval-empty' }, '这个筛选下没有步骤') : showInvoke
    ? blocks.map((block, index) => {
        const start = cursor; cursor += block.steps.length;
        const who = block.profileId || '';
        const title = block.turn != null ? (who ? 'turn ' + block.turn + '  ' + who : 'turn ' + block.turn) : (who || 'turn');
        return h('section', { key: String(block.turn ?? 'x') + '-' + index },
          h('div', { ref: index === 0 ? invokeRef : undefined, className: 'ageval-invoke' }, title, h('span', { className: 'ageval-turn' }, block.steps.length + ' 步')),
          h(StepList, { steps: block.steps, hideTurn: true, allExpanded, expandGen, start }));
      })
    : h('div', null,
        cut >= 0 ? h(StepList, { steps: shown.slice(0, cut + 1), hideTurn: false, allExpanded, expandGen, start: 0 }) : null,
        cut >= 0 ? h('div', { className: 'ageval-fork' }, dict.fork) : null,
        h(StepList, { steps: cut >= 0 ? shown.slice(cut + 1) : shown, hideTurn: false, allExpanded, expandGen, start: cut >= 0 ? cut + 1 : 0 }));
  return h('div', { className: 'ageval-traj-host' },
    h('div', { className: 'ageval-traj-bar' },
      items.length ? h(Select, { value: items.some(item => item.id === kind) ? kind : 'all', onChange: setKind, aria: '轨迹步骤', className: 'ageval-traj-filter', options: items.map(item => [item.id, item.label] as [string, string]) }) : null,
      h('span', { className: 'ageval-traj-count' }, shown.length + ' 步' + (truncated ? ' · ' + dict.truncated : '')),
      h(Button, { quiet: true, onClick: () => { setAllExpanded(value => !value); setExpandGen(value => value + 1); }, label: allExpanded ? '收起全部' : '展开全部' }, allExpanded ? dict.collapseAll : dict.expandAll)),
    h('div', { className: 'ageval-traj-stage' },
      h('div', { ref: portRef, className: 'ageval-trace-port' }, body),
      h(Outline, { items: outline, activeId, onJump: jump })));
}
function prettyFile(text: string): string {
  if (text.length > 180000) return text;
  try { return JSON.stringify(JSON.parse(text), null, 2); } catch { return text; }
}
function AttemptView({ attempt, onBack }: { attempt: Attempt; onBack: () => void }) {
  const files = attempt.files || {};
  const trajectory = files['trajectory.jsonl'];
  const others = Object.entries(files).filter(([name]) => name !== 'trajectory.jsonl');
  const [tab, setTab] = useState(trajectory ? 'trajectory' : 'files');
  let peek = '';
  try {
    const result = JSON.parse(files['result.json']?.text || '');
    const bits = [typeof result?.status === 'string' ? result.status : '', result?.score != null ? 'score ' + result.score : '', result?.reward != null ? 'reward ' + result.reward : ''].filter(Boolean);
    peek = bits.join('  ');
  } catch { /* result is optional */ }
  return h('div', { className: 'ageval-detail' },
    h('header', { className: 'ageval-detail-head' },
      h(Button, { className: 'ageval-back', onClick: onBack, label: '返回' }, '‹'),
      h('div', { className: 'ageval-detail-title' }, h('h3', null, attempt.taskId), h('div', { className: 'ageval-detail-sub' }, attempt.runId + (peek ? '  ' + peek : '')))),
    h('div', { className: 'ageval-tabs', role: 'tablist' },
      h('button', { type: 'button', className: 'ageval-tab' + (tab === 'trajectory' ? ' ageval-tab--on' : ''), onClick: () => setTab('trajectory') }, '轨迹'),
      others.length ? h('button', { type: 'button', className: 'ageval-tab' + (tab === 'files' ? ' ageval-tab--on' : ''), onClick: () => setTab('files') }, dict.files) : null),
    tab === 'files' ? h('div', { className: 'ageval-detail-scroll' }, others.map(([name, file]) => h('section', { key: name, className: 'ageval-file' }, h('h4', null, name + ' · ' + file.bytes + ' bytes' + (file.truncated ? ' · ' + dict.truncated : '')), h('pre', null, prettyFile(file.text)))))
      : trajectory?.text ? h('div', { className: 'ageval-traj-wrap' },
          h('p', { className: 'ageval-traj-note' }, dict.observational),
          h(Trajectory, { raw: trajectory.text, truncated: trajectory.truncated }))
        : h('div', { className: 'ageval-empty' }, dict.noSteps));
}
function DetailView({ data, selected, error, busy, onBack, onToggle, onAttempt }: { data: DetailData; selected: boolean; error: string; busy: string; onBack: () => void; onToggle: () => void; onAttempt: (task: Task, runId: string) => void }) {
  const [query, setQuery] = useState('');
  const [verdict, setVerdict] = useState('all');
  const [bucket, setBucket] = useState('');
  const [runs, setRuns] = useState({} as Record<string, string>);
  const counts = useMemo(() => {
    const tally = { pass: 0, fail: 0, error: 0, other: 0 };
    for (const task of data.tasks) tally[verdictOf(task.status)] += 1;
    return tally;
  }, [data.tasks]);
  const tasks = useMemo(() => data.tasks.filter(task => {
    const needle = query.trim().toLowerCase();
    const hay = (task.taskId + ' ' + (task.errorTitle || '')).toLowerCase();
    return (!needle || hay.includes(needle)) && (verdict === 'all' || verdictOf(task.status) === verdict) && (!bucket || task.errorTitle === bucket);
  }), [data.tasks, query, verdict, bucket]);
  const row = data.row;
  return h('div', { className: 'ageval-detail' },
    h('header', { className: 'ageval-detail-head' },
      h(Button, { className: 'ageval-back', onClick: onBack, label: '返回' }, '‹'),
      h('div', { className: 'ageval-detail-title' }, h('h3', null, (row.dataset === '.' ? '' : row.dataset + '/') + row.suite), h('div', { className: 'ageval-detail-sub' }, [row.model || 'model unknown', busy].filter(Boolean).join('  '))),
      h(ScoreRing, { value: row.passRate })),
    h(Banner, { error }),
    h('div', { className: 'ageval-kpis' }, h('label', { className: 'ageval-root-row' }, h('input', { className: 'ageval-check', type: 'checkbox', checked: selected, onChange: onToggle }), h('span', null, selected ? '已加入分析' : dict.addContext)), h(Metrics, { row }), h('span', { className: 'ageval-meta' }, row.status)),
    Object.keys(data.errors).length ? h('div', { className: 'ageval-chips' }, Object.entries(data.errors).map(([name, count]) => h('button', { key: name, type: 'button', className: 'ageval-chip' + (bucket === name ? ' ageval-chip--on' : ''), onClick: () => setBucket(current => current === name ? '' : name) }, name + ' ' + count))) : null,
    h('div', { className: 'ageval-chips' }, [['all', '全部 ' + data.tasks.length], ['pass', 'PASS ' + counts.pass], ['fail', 'FAIL ' + counts.fail], ['error', 'ERROR ' + counts.error]].map(([id, label]) => h('button', { key: id, type: 'button', className: 'ageval-chip' + (verdict === id ? ' ageval-chip--on' : ''), onClick: () => setVerdict(id) }, label))),
    h('div', { className: 'ageval-task-tools' }, h('input', { className: 'ageval-control', value: query, placeholder: '搜索 task', onChange: (event: any) => setQuery(event.target.value) })),
    h('div', { className: 'ageval-detail-scroll' }, tasks.length ? tasks.map(task => {
      const runId = runs[task.taskId] || task.runId || '';
      const ids = task.runIds && task.runIds.length ? task.runIds : (task.runId ? [task.runId] : []);
      return h('div', {
        key: task.taskId, className: 'ageval-task', role: runId ? 'button' : undefined, tabIndex: runId ? 0 : undefined,
        onClick: (event: any) => { if (!runId || event.target.closest('input,select,button')) return; onAttempt(task, runId); },
        onKeyDown: (event: any) => { if (!runId || event.target.closest('input,select')) return; if (event.key === 'Enter') onAttempt(task, runId); },
      },
        h('span', { className: 'ageval-verdict ageval-verdict--' + verdictOf(task.status) }, verdictOf(task.status) === 'other' ? (task.status || '-') : verdictOf(task.status)),
        h('div', { className: 'ageval-task-main' }, h('div', { className: 'ageval-task-id' }, task.taskId), task.errorTitle ? h('div', { className: 'ageval-subline ageval-error-text' }, task.errorTitle) : null),
        task.score == null ? null : h('span', { className: 'ageval-metrics', title: String(task.score) }, formatScore(task.score)),
        ids.length > 1 ? h(Select, { className: 'ageval-attempt-select', value: runId, aria: 'Attempt', onChange: (value: string) => setRuns(prev => ({ ...prev, [task.taskId]: value })), options: ids.map(id => [id, id] as [string, string]) }) : null);
    }) : h('div', { className: 'ageval-empty' }, dict.noTasks)));
}
function SuiteList({ rows, selected, onToggle, onOpen }: { rows: Row[]; selected: Record<string, Row>; onToggle: (row: Row) => void; onOpen: (row: Row) => void }) {
  return h('div', null, rows.map(row => {
    const key = row.dataset + '/' + row.suite;
    return h('div', {
      key, className: 'ageval-suite' + (selected[key] ? ' ageval-suite--selected' : ''), role: 'button', tabIndex: 0,
      onClick: (event: any) => { if (event.target.closest('input,button')) return; onOpen(row); },
      onKeyDown: (event: any) => { if (event.target.closest('input')) return; if (event.key === 'Enter') onOpen(row); },
    },
      h('input', { className: 'ageval-check', type: 'checkbox', checked: Boolean(selected[key]), onChange: () => onToggle(row), 'aria-label': dict.selected + ' ' + key }),
      h('div', { className: 'ageval-suite-main' }, h('div', { className: 'ageval-suite-name' }, row.suite), h('div', { className: 'ageval-subline' }, [row.model || 'model unknown', row.harness].filter(Boolean).join('  '))),
      h('div', { className: 'ageval-suite-side' }, h(ScoreRing, { value: row.passRate }), h(Metrics, { row })));
  }));
}
function sourceDisplay(source: DataSource): string {
  return source.kind === 'ssh' ? `${source.host} · ${source.path}` : source.path;
}
export function SourcePicker({ source, recent, onChoose, onRemove, onClose }: {
  source: DataSource | null; recent: DataSource[]; onChoose: (s: DataSource) => Promise<void>; onRemove: (s: DataSource) => Promise<void>; onClose: () => void;
}) {
  const [mode, setMode] = useState<'local' | 'ssh' | 'saved'>(source?.kind || 'local');
  const [hosts, setHosts] = useState<Host[]>([]);
  const [host, setHost] = useState(source?.host || '');
  const [path, setPath] = useState(source?.path || '');
  const [listing, setListing] = useState<{ path: string; entries: DirectoryEntry[]; truncated?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState('');
  const sequence = useRef(0), dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current; element?.showModal();
    let mounted = true;
    void readJson(API + '/ssh/hosts').then(result => { if (mounted) setHosts(result.hosts || []); }).catch(error => { if (mounted) setFailure(error.message); });
    return () => { mounted = false; sequence.current++; element?.close(); };
  }, []);
  const browse = async (alias: string, location?: string) => {
    const request = ++sequence.current;
    setHost(alias); setBusy(true); setFailure(''); setListing(null);
    try {
      const home = location ? null : await readJson(API + '/ssh/test', { method: 'POST', body: JSON.stringify({ host: alias }) });
      const result = await readJson(API + '/ssh/list', { method: 'POST', body: JSON.stringify({ host: alias, path: location || home.home }) });
      if (request === sequence.current) { setPath(result.path); setListing(result); }
    } catch (error: any) { if (request === sequence.current) setFailure(error.message); }
    finally { if (request === sequence.current) setBusy(false); }
  };
  const choose = async (picked: DataSource) => {
    setBusy(true); setFailure('');
    try { await onChoose(picked); } catch (error: any) { setFailure(error.message); setBusy(false); }
  };
  const removeSaved = async (picked: DataSource) => {
    setBusy(true); setFailure('');
    try { await onRemove(picked); } catch (error: any) { setFailure(error.message); }
    finally { setBusy(false); }
  };
  return h('dialog', { ref: dialog, className: 'ageval-source-dialog', 'aria-labelledby': 'ageval-source-title', onCancel: onClose },
    h('div', { className: 'ageval-modal-head' }, h('h3', { id: 'ageval-source-title' }, '选择数据源'), h(Button, { quiet: true, onClick: onClose, label: '关闭' }, '×')),
    h('div', { className: 'ageval-source-tabs', role: 'tablist', 'aria-label': '数据源分组' },
      ...([['local', '本机'], ['ssh', 'SSH 服务器'], ['saved', '已保存路径']] as const).map(([id, label]) => h('button', {
        key: id, id: `ageval-source-tab-${id}`, type: 'button', role: 'tab',
        className: 'ageval-tab' + (mode === id ? ' ageval-tab--on' : ''),
        'aria-selected': mode === id, 'aria-controls': 'ageval-source-panel', tabIndex: mode === id ? 0 : -1,
        disabled: busy,
        onClick: () => { sequence.current++; setMode(id); setPath(source?.kind === id ? source.path : ''); setFailure(''); setListing(null); },
        onKeyDown: (event: any) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const ids = ['local', 'ssh', 'saved'] as const;
          const index = ids.indexOf(mode);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (index + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
          document.getElementById(`ageval-source-tab-${ids[next]}`)?.click();
          document.getElementById(`ageval-source-tab-${ids[next]}`)?.focus();
        },
      }, label))),
    h('div', { id: 'ageval-source-panel', role: 'tabpanel', 'aria-labelledby': `ageval-source-tab-${mode}` },
    mode === 'saved' ? h('div', { className: 'ageval-saved-paths' },
      h('p', { className: 'ageval-source-caption' }, '删除只移除保存记录，不删除文件，也不中断当前数据源。'),
      recent.length ? recent.map(item => h('div', { key: sourceDisplay(item), className: 'ageval-saved-path-row' },
        h('button', { type: 'button', className: 'ageval-saved-path-open', disabled: busy, onClick: () => void choose(item), title: sourceDisplay(item) },
          icon(item.kind === 'ssh' ? 'terminal' : 'grid'),
          h('span', { className: 'ageval-saved-path-info' }, h('span', { className: 'ageval-saved-path-name' }, item.kind === 'ssh' ? item.host : '本机'), h('span', { className: 'ageval-saved-path-location' }, item.path))),
        h('button', { type: 'button', className: 'ageval-saved-path-remove', disabled: busy, 'aria-label': `删除保存记录：${sourceDisplay(item)}`, title: '仅删除此保存记录', onClick: (event: any) => { event.stopPropagation(); void removeSaved(item); } }, '删除记录')))
        : h('div', { className: 'ageval-empty' }, '还没有已保存路径')) :
    mode === 'local' ? h('div', { className: 'ageval-source-local' },
      h('label', { htmlFor: 'ageval-local-path' }, 'Dataset 根目录'),
      h('input', { id: 'ageval-local-path', className: 'ageval-control', value: path, placeholder: '/path/to/dataset-root', onChange: (event: any) => setPath(event.target.value) }),
      h(Button, { accent: true, disabled: busy || !path.startsWith('/'), onClick: () => void choose({ kind: 'local', path }) }, '保存并打开')) :
      h('div', { className: 'ageval-source-ssh' },
        h('div', { className: 'ageval-host-list', 'aria-label': 'SSH Hosts' }, hosts.length ? hosts.map(item => h('button', {
          key: item.alias, type: 'button', className: `ageval-host-row${host === item.alias ? ' is-selected' : ''}`,
          onClick: () => void browse(item.alias),
        }, h('span', { className: 'ageval-host-name' }, item.alias), h('span', { className: 'ageval-host-meta' }, item.hostName ? `${item.user || ''}@${item.hostName}:${item.port || 22}` : 'SSH 配置'))) : h('p', { className: 'ageval-source-caption' }, '没有找到 SSH Host 别名')),
        h('div', { className: 'ageval-tree' },
          host ? h('form', { className: 'ageval-tree-location', onSubmit: (event: any) => { event.preventDefault(); void browse(host, path); } },
            h('input', { className: 'ageval-control', value: path, 'aria-label': '远程路径', placeholder: '/home/user/datasets', onChange: (event: any) => setPath(event.target.value) }),
            h('button', { type: 'submit', className: 'ageval-button', disabled: busy || !path.startsWith('/') }, '前往')) : null,
          busy ? h('div', { className: 'ageval-empty', role: 'status' }, '正在读取远程目录…') : listing ? h('div', { className: 'ageval-tree-entries' },
            listing.path !== '/' ? h('button', { type: 'button', className: 'ageval-tree-row', onClick: () => void browse(host, listing.path.replace(/\/[^/]+\/?$/, '') || '/') }, '‹ 上一级') : null,
            listing.entries.map(entry => h('button', { key: entry.path, type: 'button', className: 'ageval-tree-row', onClick: () => void browse(host, entry.path) }, icon('chevron'), entry.name)),
            !listing.entries.length ? h('p', { className: 'ageval-source-caption' }, '此目录没有子目录') : null,
            listing.truncated ? h('p', { className: 'ageval-source-caption' }, '仅显示前 500 个目录，可输入路径继续') : null) : h('div', { className: 'ageval-empty' }, '选择 Host 后逐层浏览目录'),
          listing && !busy ? h(Button, { accent: true, onClick: () => void choose({ kind: 'ssh', host, path: listing.path }) }, '保存并打开此目录') : null))),
    failure ? h('p', { className: 'ageval-banner ageval-banner--error', role: 'alert' }, failure) : null,
    h('div', { className: 'ageval-modal-foot' }, h('span', { className: 'ageval-source-caption' }, '只读 · 按需读取证据，不同步工作区'), h(Button, { onClick: onClose }, '取消')));
}
function App({ ctx, props }: { ctx: any; props: any }) {
  const [root, setRoot] = useState('');
  const [source, setSource] = useState<DataSource | null>(null);
  const [scope, setScope] = useState('');
  const [draftRoot, setDraftRoot] = useState('');
  const [recent, setRecent] = useState<DataSource[]>([]);
  const [sourceOpen, setSourceOpen] = useState(false);
  const loadVersion = useRef(0);
  const [rows, setRows] = useState([] as Row[]);
  const [query, setQuery] = useState('');
  const [bench, setBench] = useState('all');
  const [model, setModel] = useState('all');
  const [status, setStatus] = useState('all');
  const [verdict, setVerdict] = useState('all');
  const [selected, setSelected] = useState({} as Record<string, Row>);
  const [detail, setDetail] = useState(null as DetailData | null);
  const [attempt, setAttempt] = useState(null as Attempt | null);
  const [pending, setPending] = useState('');
  const [question, setQuestion] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectionOpen, setSelectionOpen] = useState(false);
  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    setLoading(true); setError('');
    try {
      const config = await readJson(API + '/config');
      if (version !== loadVersion.current) return;
      const src = config.source || (config.root ? { kind: 'local', path: config.root } : null);
      setSource(src); setRoot(src?.path || ''); setScope(config.scope || ''); setDraftRoot(src?.path || ''); setRecent(config.recent || []);
      setRows([]);
      const result = src ? await readJson(API + '/suites', undefined, config.scope) : { rows: [] };
      if (version === loadVersion.current) setRows(result.rows || []);
    } catch (cause: any) { if (version === loadVersion.current) setError(String(cause?.message || cause)); }
    finally { if (version === loadVersion.current) setLoading(false); }
  }, []);
  useEffect(() => { injectCss(); void load(); return () => { loadVersion.current++; }; }, [load]);
  const chooseSource = async (src: DataSource) => {
    await readJson(API + '/config', { method: 'PUT', body: JSON.stringify(src) });
    setSourceOpen(false); setSelected({}); setDetail(null); setAttempt(null);
    setBench('all'); setModel('all'); setStatus('all'); setVerdict('all'); setQuery(''); setMessage('');
    await load();
  };
  const removeSavedSource = async (picked: DataSource) => {
    const config = await readJson(API + '/saved/remove', { method: 'POST', body: JSON.stringify(picked) });
    setRecent(config.recent || []);
  };
  const toggle = (row: Row) => setSelected(prev => { const key = row.dataset + '/' + row.suite; const next = { ...prev }; if (next[key]) delete next[key]; else next[key] = row; return next; });
  const open = async (row: Row) => {
    setError(''); setPending('');
    try { setDetail(await readJson(API + '/suite?dataset=' + encodeURIComponent(row.dataset) + '&suite=' + encodeURIComponent(row.suite), undefined, scope)); setAttempt(null); }
    catch (cause: any) { setError(String(cause?.message || cause)); }
  };
  const openAttempt = async (task: Task, runId: string) => {
    if (!detail?.row || !runId) return;
    setError(''); setPending(task.taskId);
    try { setAttempt(await readJson(API + '/attempt?dataset=' + encodeURIComponent(detail.row.dataset) + '&suite=' + encodeURIComponent(detail.row.suite) + '&task=' + encodeURIComponent(task.taskId) + '&run=' + encodeURIComponent(runId), undefined, scope)); }
    catch (cause: any) { setError(String(cause?.message || cause)); }
    finally { setPending(''); }
  };
  const send = async (target: 'current' | 'new') => {
    const items = Object.values(selected) as Row[];
    if (!items.length) { setError('先选择 suite'); return; }
    let sessionId = sessionIdOf(ctx, props);
    if (target === 'current' && !sessionId) { setError(dict.currentUnavailable); return; }
    try {
      const body = await readJson(API + '/context', { method: 'POST', body: JSON.stringify({ selections: items.map(item => ({ dataset: item.dataset, suite: item.suite })), question }) }, scope);
      const sessions = get(ctx, 'sessions');
      if (target === 'new') sessionId = await sessions.create(source?.kind === 'local' ? { cwd: root } : {});
      const conversation = sessions.scope(sessionId)?.get?.('conversation');
      if (!conversation?.send) throw new Error(dict.currentUnavailable);
      await conversation.send(body.text);
      setMessage(dict.sent); setError('');
    } catch (cause: any) { setError(String(cause?.message || dict.failed)); }
  };
  const benches = useMemo(() => Array.from(new Set(rows.map(row => row.dataset))).sort(), [rows]);
  const models = useMemo(() => Array.from(new Set(rows.map(row => row.model).filter(Boolean) as string[])).sort(), [rows]);
  const filtered = useMemo(() => rows.filter(row => {
    const needle = query.trim().toLowerCase();
    const hay = (row.dataset + ' ' + (row.model || '') + ' ' + row.suite + ' ' + (row.harness || '')).toLowerCase();
    return (!needle || hay.includes(needle)) && (bench === 'all' || row.dataset === bench) && (model === 'all' || row.model === model) && (status === 'all' || row.status === status) && (verdict === 'all' || (verdict === 'clean' ? row.clean : (row.error || 0) > 0));
  }), [rows, query, bench, model, status, verdict]);
  const groups = useMemo(() => Array.from(new Set(filtered.map(row => row.dataset))).sort().map(name => [name, filtered.filter(row => row.dataset === name)] as [string, Row[]]), [filtered]);
  const filtering = Boolean(query || bench !== 'all' || model !== 'all' || status !== 'all' || verdict !== 'all');
  if (attempt) return h(AttemptView, { attempt, onBack: () => { setAttempt(null); setError(''); } });
  if (detail) return h(DetailView, { data: detail, selected: Boolean(selected[detail.row.dataset + '/' + detail.row.suite]), error, busy: pending ? dict.loading : '', onBack: () => { setDetail(null); setError(''); }, onToggle: () => toggle(detail.row), onAttempt: openAttempt });
  return h('div', { className: 'ageval-viewer' },
    h('div', { className: 'ageval-topbar' },
      h('div', { className: 'ageval-heading' }, h('h2', null, dict.title), h('span', { className: 'ageval-meta' }, (loading ? dict.loading + ' · ' : '') + dict.readOnly + ' · ' + filtered.length + '/' + rows.length), h(Button, { quiet: true, onClick: () => void load(), disabled: loading }, dict.refresh)),
      h('div', { className: 'ageval-root-row' },
        h('button', { type: 'button', className: 'ageval-source-display', onClick: () => setSourceOpen(true), title: source ? sourceDisplay(source) : undefined },
          icon(source?.kind === 'ssh' ? 'terminal' : 'grid'), h('span', null, source ? sourceDisplay(source) : '选择数据源'), icon('chevron')),
        recent.length ? h(Select, { className: 'ageval-recent-select', value: '', placeholder: '最近路径', aria: '最近路径', disabled: loading, onChange: (value: string) => { const item = recent[Number(value)]; if (item) void chooseSource(item).catch((e: Error) => setError(e.message)); }, options: recent.map((item, index) => [String(index), sourceDisplay(item)] as [string, string]) }) : null),
      h('input', { className: 'ageval-control ageval-filter-search', value: query, placeholder: dict.search, onChange: (event: any) => setQuery(event.target.value) }),
      h('div', { className: 'ageval-filter-row' },
        h('div', { className: 'ageval-filter-select' }, h(Select, { value: bench, onChange: setBench, aria: 'Bench', options: [['all', dict.allBenches], ...benches.map(item => [item, benchLabel(item, root)] as [string, string])] })),
        h('div', { className: 'ageval-filter-select' }, h(Select, { value: model, onChange: setModel, aria: 'Model', options: [['all', dict.allModels], ...models.map(item => [item, item] as [string, string])] })),
        h('div', { className: 'ageval-filter-select' }, h(Select, { value: status, onChange: setStatus, aria: 'Status', options: [['all', dict.allStatuses], ...Array.from(new Set(rows.map(item => item.status))).sort().map(item => [item, item] as [string, string])] })),
        h('div', { className: 'ageval-filter-select' }, h(Select, { value: verdict, onChange: setVerdict, aria: 'Result', options: [['all', dict.allVerdicts], ['clean', dict.clean], ['error', dict.hasErrors]] })),
        filtering ? h(Button, { quiet: true, onClick: () => { setQuery(''); setBench('all'); setModel('all'); setStatus('all'); setVerdict('all'); } }, dict.clear) : null)),
    h('div', { className: 'ageval-summary' }, h('strong', null, filtered.length + ' ' + dict.suites), h('span', null, filtered.reduce((sum, row) => sum + (row.expected || 0), 0) + ' ' + dict.tasksCount)),
    !root ? h('div', { className: 'ageval-empty' }, dict.noRoot) : h('div', { className: 'ageval-scroll' }, loading && !rows.length ? h('div', { className: 'ageval-empty' }, dict.loading) : groups.length ? groups.map(([name, items]) => h('section', { key: name, className: 'ageval-group' }, h('div', { className: 'ageval-group-title' }, benchLabel(name, root), h('span', { className: 'ageval-group-count' }, items.length + ' ' + dict.suites)), h(SuiteList, { rows: items, selected, onToggle: toggle, onOpen: open }))) : h('div', { className: 'ageval-empty' }, dict.empty)),
    h(Banner, { error, message }),
    h('div', { className: 'ageval-composer' },
      h('input', { className: 'ageval-control', value: question, placeholder: dict.question, onChange: (event: any) => setQuestion(event.target.value), onKeyDown: (event: any) => { if (event.key === 'Enter') { event.preventDefault(); void send('current'); } } }),
      h('div', { className: 'ageval-composer-actions' },
        h(Button, { quiet: true, onClick: () => setSelectionOpen(true), disabled: !Object.keys(selected).length }, Object.keys(selected).length + ' ' + dict.selected),
        h(Button, { onClick: () => void send('current'), disabled: loading }, dict.send),
        h(Button, { onClick: () => void send('new'), disabled: loading }, dict.newSession))),
    sourceOpen ? h(SourcePicker, { source, recent, onChoose: chooseSource, onRemove: removeSavedSource, onClose: () => setSourceOpen(false) }) : null, selectionOpen ? h('div', { className: 'ageval-modal-backdrop', role: 'presentation', onClick: () => setSelectionOpen(false) }, h('div', { className: 'ageval-modal', role: 'dialog', 'aria-modal': true, onClick: (event: any) => event.stopPropagation() },
      h('div', { className: 'ageval-modal-head' }, h('h3', null, dict.selected + ' ' + dict.suites), h(Button, { quiet: true, onClick: () => setSelectionOpen(false), label: '关闭' }, '×')),
      h('div', { className: 'ageval-modal-list' }, (Object.entries(selected) as [string, Row][]).map(([key, row]) => h('div', { key, className: 'ageval-selected-row' }, h('span', { className: 'ageval-task-id' }, key), h(ScoreRing, { value: row.passRate }), h(Button, { quiet: true, onClick: () => toggle(row) }, '取消')))),
      h('div', { className: 'ageval-modal-foot' }, h(Button, { accent: true, onClick: () => setSelectionOpen(false) }, '完成')))) : null);
}
function title(): string { return dict.title; }
const pluginName = 'ageval-viewer';
const inject = ['slots', 'locale', 'sidebarRightTabs', 'sessions'];
function apply(ctx: any): void {
  injectCss();
  const tabs = get(ctx, 'sidebarRightTabs');
  const slots = get(ctx, 'slots');
  if (!tabs || !slots) return;
  try { ctx.locale?.register?.(NS, { zh, en: zh }); } catch { /* locale is optional */ }
  ctx.effect(() => tabs.register({ id: TAB_ID, kind: 'fstack.ageval', title, guide: [{ id: TAB_ID, order: 32, title, description: () => dict.guide }] }));
  ctx.effect(() => slots.inject('sidebar.right.pane.tab', () => slots.register({ name: 'sidebar.right.pane.tab', key: TAB_ID }, (slotProps: any) => h(App, { ctx, props: slotProps }))));
}
export { pluginName as name, inject, apply };
export default { name: pluginName, inject, apply };
