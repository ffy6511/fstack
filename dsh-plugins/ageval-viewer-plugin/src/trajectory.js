/**
 * Trajectory step model for the sidebar viewer.
 * Classification, body synthesis, elapsed time, and invoke grouping follow
 * apps/shared/components/trial/trajectory-panel.tsx in the ageval viewer.
 * Labels are the sidebar's Chinese chrome; majors stay the viewer's set.
 */

export const MAJOR_LABEL = {
  user: '用户',
  agent: 'Agent',
  thought: '思考',
  tool_call: '工具',
  observation: '观察',
  terminal: '终端',
  permission: '权限',
  message: '消息',
};

const MAJOR_ORDER = ['user', 'agent', 'thought', 'tool_call', 'observation', 'terminal', 'permission', 'message'];
const OK_STATUS = new Set(['completed', 'complete', 'success', 'ok', 'done']);
const QUIET_STOP = new Set(['end_turn', 'stop', 'completed', 'complete', 'end']);

export function isBatchAutoApprove(step) {
  return (step?.type || '') === 'permission_decision' && step?.policy === 'batch_auto_approve';
}

export function classifyStep(step) {
  const s = step || {};
  const stepType = (s.type || '').toString();
  const isToolCall = stepType === 'tool_call';
  const isObservation = stepType === 'observation';
  const isPermission = stepType === 'permission_decision';
  const role = (
    s.role ||
    (isToolCall ? 'tool_call' : isObservation ? 'observation' : isPermission ? 'permission' : stepType || 'event')
  ).toString();
  const isUser = role === 'user' || stepType === 'user';
  const isThought = (s.part || '').toString() === 'thought';
  const isAsst = (role === 'assistant' || stepType === 'assistant') && !isThought;
  const isTerminal = stepType === 'terminal';
  const major = isUser
    ? 'user'
    : isThought
      ? 'thought'
      : isAsst
        ? 'agent'
        : isObservation
          ? 'observation'
          : isTerminal
            ? 'terminal'
            : isPermission
              ? 'permission'
              : isToolCall
                ? 'tool_call'
                : 'message';
  const label = isToolCall
    ? (s.function_name || s.kind || s.title || 'tool_call').toString()
    : MAJOR_LABEL[major] || role;
  return { major, role, label, isUser, isAsst, isThought, isToolCall, isObservation, isTerminal, isPermission };
}

export function stepIconName(step) {
  const flags = classifyStep(step);
  if (flags.isUser) return 'user';
  if (flags.isThought) return 'thought';
  if (flags.isAsst) return 'agent';
  if (flags.isObservation) return 'observation';
  if (flags.isTerminal) return 'terminal';
  if (flags.isPermission) return 'permission';
  if (flags.isToolCall) {
    const kind = String(step.kind || step.function_name || '').toLowerCase();
    if (kind === 'execute' || kind === 'bash' || kind === 'shell') return 'terminal';
    if (kind === 'read' || kind === 'search' || kind === 'fetch' || kind === 'grep' || kind === 'glob') return 'search';
    if (kind === 'edit' || kind === 'write' || kind === 'delete' || kind === 'move') return 'pen';
    return 'tool';
  }
  return 'message';
}

function asFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function stepElapsedMs(step) {
  const direct = asFinite(step?.elapsed_ms);
  if (direct != null && direct >= 0) return direct;
  const lat = asFinite(step?.metadata?.latency_ms);
  if (lat != null && lat >= 0) return lat;
  return null;
}

export function formatElapsedMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const totalS = ms / 1000;
  if (totalS < 10) return `${totalS.toFixed(1)}s`;
  if (totalS < 60) return `${Math.round(totalS)}s`;
  const minutes = Math.floor(totalS / 60);
  const seconds = Math.round(totalS - minutes * 60);
  if (seconds === 60) return `${minutes + 1}m`;
  return seconds ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${minutes}m`;
}

function parsesAsJson(text) {
  const t = text.trim();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try {
    const value = JSON.parse(t);
    return typeof value === 'object' && value !== null;
  } catch {
    return false;
  }
}

function textOf(value) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

export function stepBody(step) {
  const s = step || {};
  const flags = classifyStep(s);
  const toolArgsEmpty = s.args == null || (typeof s.args === 'object' && !Array.isArray(s.args) && Object.keys(s.args).length === 0);
  let body = textOf(s.content);
  if (!body && flags.isToolCall && !toolArgsEmpty) {
    body = typeof s.args === 'string' ? s.args : JSON.stringify(s.args, null, 2);
  }
  if (!body && flags.isToolCall && s.title) body = String(s.title);
  if (!body && flags.isObservation && s.raw_output != null) {
    body = typeof s.raw_output === 'string' ? s.raw_output : JSON.stringify(s.raw_output, null, 2);
  }
  if (!body && flags.isPermission) {
    const bits = [
      s.policy != null && s.policy !== '' ? `policy=${s.policy}` : null,
      s.outcome != null && s.outcome !== '' ? `outcome=${s.outcome}` : null,
      s.option_id != null && s.option_id !== '' ? `option_id=${s.option_id}` : null,
    ].filter(Boolean);
    body = bits.length ? bits.join(' · ') : null;
  }
  if (!body && flags.isTerminal) {
    const bits = [];
    if (s.ok === true) bits.push('ok');
    else if (s.ok === false) bits.push('not ok');
    if (s.stop_reason) bits.push(`stop=${s.stop_reason}`);
    if (s.error) bits.push(`error=${String(s.error)}`);
    if (s.metadata && typeof s.metadata === 'object') {
      const meta = s.metadata;
      const metaBits = ['executor_kind', 'acp_entry_id', 'actual_model', 'locked_model', 'protocol_version']
        .filter(key => meta[key] != null && meta[key] !== '')
        .map(key => `${key}=${String(meta[key])}`);
      if (metaBits.length) bits.push(metaBits.join(' '));
    }
    body = bits.length ? bits.join(' · ') : null;
  }
  const kind = !body
    ? 'text'
    : flags.isTerminal || flags.isPermission
      ? 'text'
      : flags.isToolCall || flags.isObservation
        ? (parsesAsJson(body) ? 'json' : 'text')
        : 'prose';
  let text = body || '';
  if (kind === 'json' && text) {
    try { text = JSON.stringify(JSON.parse(text), null, 2); } catch { /* keep source */ }
  }
  return { text, kind, flags };
}

export function statusText(step) {
  const raw = typeof step?.status === 'string' ? step.status.trim() : '';
  if (!raw || OK_STATUS.has(raw.toLowerCase())) return '';
  return raw;
}

export function stopText(step) {
  const raw = typeof step?.stop_reason === 'string' ? step.stop_reason.trim() : '';
  if (!raw || QUIET_STOP.has(raw.toLowerCase())) return '';
  return raw;
}

export function outlineText(step) {
  const flags = classifyStep(step);
  if (flags.isToolCall) {
    return String(step.function_name || step.kind || step.title || flags.label).trim() || flags.label;
  }
  const content = textOf(step?.content).replace(/\s+/g, ' ').trim();
  return content || flags.label;
}

export function parseTrajectory(raw) {
  if (!raw) return [];
  const steps = [];
  for (const line of String(raw).split(/\n+/)) {
    if (!line.trim()) continue;
    try { steps.push(JSON.parse(line)); }
    catch { steps.push({ type: 'message', content: line }); }
  }
  return steps;
}

export function visibleSteps(steps) {
  return (steps || []).filter(step => !isBatchAutoApprove(step));
}

export function filterItems(steps) {
  const found = new Set();
  for (const step of steps) found.add(classifyStep(step).major);
  if (found.size < 2) return [];
  return [
    { id: 'all', label: '全部' },
    ...MAJOR_ORDER.filter(id => found.has(id)).map(id => ({ id, label: MAJOR_LABEL[id] })),
  ];
}

export function groupInvokes(steps) {
  const blocks = [];
  for (const step of steps) {
    const turn = typeof step.turn_index === 'number' ? step.turn_index : null;
    const profileId = typeof step.profile_id === 'string' && step.profile_id ? step.profile_id : null;
    const last = blocks[blocks.length - 1];
    if (last && last.turn != null && last.turn === turn) {
      last.steps.push(step);
      if (!last.profileId && profileId) last.profileId = profileId;
      continue;
    }
    blocks.push({ turn, profileId, steps: [step] });
  }
  return blocks;
}

export function hasMultipleProfiles(steps) {
  const ids = new Set();
  for (const step of steps) {
    if (typeof step.profile_id === 'string' && step.profile_id) ids.add(step.profile_id);
  }
  return ids.size >= 2;
}

/** Index of the last inherited step, or -1. The fork cut sits after it. */
export function inheritedCut(steps) {
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    if (steps[i]?.inherited === true) return i;
  }
  return -1;
}
