/**
 * openui-lang, the subset UI blocks need: one statement per line, positional
 * arguments, a `root = Stack([...])` entry, no state and no actions.
 *
 * The parser deliberately keeps the model's intent visible in diagnostics: a
 * finished block with any error is not drawn, and the reasons name the line,
 * the component, the argument index and the signature it should have matched.
 * Half a block drawn silently is worse than a block that says why it failed.
 */

import {
  COMPONENTS,
  DIRECTIONS,
  NESTED_ONLY,
  STEP_STATUSES,
  TONES,
  closestComponent,
  signatureOf,
} from './catalog.js';

/** @typedef {{ line: number, message: string }} Diagnostic */

const PUNCT = new Set(['(', ')', '[', ']', '{', '}', ',', '=', ':']);

class SyntaxError extends Error {
  /**
   * @param {number} line
   * @param {string} message
   */
  constructor(line, message) {
    super(message);
    this.line = line;
  }
}

/**
 * Split one physical line into tokens. A block statement never continues on the
 * next line: the guidance says so, and a half-parsed multi-line call produces
 * errors that name the real cause.
 * @param {string} line
 * @param {number} lineNo
 * @returns {Array<{t: string, v: string | number | boolean | null, col: number}>}
 */
function lex(line, lineNo) {
  const tokens = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const start = i;
      let value = '';
      i++;
      let closed = false;
      while (i < line.length) {
        const c = line[i];
        if (c === '\\') {
          const next = line[i + 1];
          if (next === undefined) throw new SyntaxError(lineNo, `unfinished escape at column ${i + 1}`);
          value += next === 'n' ? '\n' : next === 't' ? '\t' : next;
          i += 2;
          continue;
        }
        if (c === ch) {
          closed = true;
          i++;
          break;
        }
        value += c;
        i++;
      }
      if (!closed) throw new SyntaxError(lineNo, `unterminated string starting at column ${start + 1}`);
      tokens.push({ t: 'str', v: value, col: start });
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === '-' && /[0-9]/.test(line[i + 1] ?? ''))) {
      const start = i;
      if (line[i] === '-') i++;
      while (/[0-9]/.test(line[i] ?? '')) i++;
      if (line[i] === '.' && /[0-9]/.test(line[i + 1] ?? '')) {
        i++;
        while (/[0-9]/.test(line[i] ?? '')) i++;
      }
      tokens.push({ t: 'num', v: Number(line.slice(start, i)), col: start });
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (/[A-Za-z0-9_]/.test(line[i] ?? '')) i++;
      const word = line.slice(start, i);
      if (word === 'true' || word === 'false') tokens.push({ t: 'bool', v: word === 'true', col: start });
      else if (word === 'null') tokens.push({ t: 'null', v: null, col: start });
      else tokens.push({ t: 'ident', v: word, col: start });
      continue;
    }
    if (PUNCT.has(ch)) {
      tokens.push({ t: ch, v: ch, col: i });
      i++;
      continue;
    }
    throw new SyntaxError(lineNo, `unexpected character ${JSON.stringify(ch)} at column ${i + 1}`);
  }
  return tokens;
}

/**
 * A cursor over one line's tokens.
 */
class Cursor {
  /**
   * @param {Array<{t: string, v: unknown, col: number}>} tokens
   * @param {number} line
   */
  constructor(tokens, line) {
    this.tokens = tokens;
    this.pos = 0;
    this.line = line;
  }

  /** @returns {{t: string, v: unknown, col: number} | undefined} */
  peek() {
    return this.tokens[this.pos];
  }

  /** @param {string} what @returns {{t: string, v: unknown, col: number}} */
  take(what) {
    const token = this.tokens[this.pos];
    if (token === undefined) {
      throw new SyntaxError(this.line, `expected ${what}, reached the end of the line`);
    }
    this.pos++;
    return token;
  }

  /** @param {string} punct */
  expectPunct(punct) {
    const token = this.take(`"${punct}"`);
    if (token.t !== punct) {
      throw new SyntaxError(this.line, `expected "${punct}" at column ${token.col + 1}, found ${describeToken(token)}`);
    }
    return token;
  }

  done() {
    return this.pos >= this.tokens.length;
  }
}

/**
 * @param {{t: string, v: unknown}} token
 * @returns {string}
 */
function describeToken(token) {
  switch (token.t) {
    case 'str':
      return `the string ${JSON.stringify(token.v)}`;
    case 'num':
      return `the number ${token.v}`;
    case 'bool':
      return `the boolean ${token.v}`;
    case 'null':
      return 'null';
    case 'ident':
      return `the name "${token.v}"`;
    default:
      return `"${token.t}"`;
  }
}

/**
 * @param {Cursor} cursor
 * @returns {any}
 */
function parseValue(cursor) {
  const token = cursor.peek();
  if (token === undefined) throw new SyntaxError(cursor.line, 'expected a value, reached the end of the line');
  if (token.t === 'str') {
    cursor.pos++;
    return { k: 'str', v: token.v };
  }
  if (token.t === 'num') {
    cursor.pos++;
    return { k: 'num', v: token.v };
  }
  if (token.t === 'bool') {
    cursor.pos++;
    return { k: 'bool', v: token.v };
  }
  if (token.t === 'null') {
    cursor.pos++;
    return { k: 'null' };
  }
  if (token.t === '[') {
    cursor.pos++;
    /** @type {any[]} */
    const items = [];
    if (cursor.peek()?.t === ']') {
      cursor.pos++;
      return { k: 'arr', items };
    }
    for (;;) {
      items.push(parseValue(cursor));
      const next = cursor.peek();
      if (next?.t === ',') {
        cursor.pos++;
        continue;
      }
      if (next?.t === ']') {
        cursor.pos++;
        return { k: 'arr', items };
      }
      throw new SyntaxError(cursor.line, `expected "," or "]" in the array, found ${next === undefined ? 'the end of the line' : describeToken(next)}`);
    }
  }
  if (token.t === '{') {
    cursor.pos++;
    /** @type {Array<{key: string, value: any}>} */
    const entries = [];
    if (cursor.peek()?.t === '}') {
      cursor.pos++;
      return { k: 'obj', entries };
    }
    for (;;) {
      const keyToken = cursor.take('an object key');
      if (keyToken.t !== 'ident' && keyToken.t !== 'str') {
        throw new SyntaxError(cursor.line, `an object key must be a bare name or a quoted string, found ${describeToken(keyToken)}`);
      }
      cursor.expectPunct(':');
      entries.push({ key: String(keyToken.v), value: parseValue(cursor) });
      const next = cursor.peek();
      if (next?.t === ',') {
        cursor.pos++;
        continue;
      }
      if (next?.t === '}') {
        cursor.pos++;
        return { k: 'obj', entries };
      }
      throw new SyntaxError(cursor.line, `expected "," or "}" in the object, found ${next === undefined ? 'the end of the line' : describeToken(next)}`);
    }
  }
  if (token.t === 'ident') {
    cursor.pos++;
    return { k: 'ref', name: token.v };
  }
  throw new SyntaxError(cursor.line, `expected a value, found ${describeToken(token)}`);
}

/**
 * `name = Component(arg, ...)` — the only statement form this subset has.
 * @param {string} line
 * @param {number} lineNo
 * @returns {{ name: string, call: any } | null}
 */
function parseStatement(line, lineNo) {
  const cursor = new Cursor(lex(line, lineNo), lineNo);
  const head = cursor.take('a name');
  if (head.t !== 'ident') throw new SyntaxError(lineNo, `a statement starts with a name, found ${describeToken(head)}`);
  cursor.expectPunct('=');
  const componentToken = cursor.take('a component name');
  if (componentToken.t !== 'ident') {
    throw new SyntaxError(lineNo, `expected a component call after "=", found ${describeToken(componentToken)}`);
  }
  cursor.expectPunct('(');
  /** @type {any[]} */
  const args = [];
  if (cursor.peek()?.t === ')') {
    cursor.pos++;
  } else {
    for (;;) {
      args.push(parseValue(cursor));
      const next = cursor.peek();
      if (next?.t === ',') {
        cursor.pos++;
        continue;
      }
      if (next?.t === ')') {
        cursor.pos++;
        break;
      }
      throw new SyntaxError(lineNo, `expected "," or ")" in the call, found ${next === undefined ? 'the end of the line' : describeToken(next)}`);
    }
  }
  if (!cursor.done()) {
    const extra = cursor.peek();
    throw new SyntaxError(lineNo, `unexpected ${describeToken(extra)} after the call — one statement per line, and a call is not followed by anything`);
  }
  return { name: String(head.v), call: { k: 'call', name: String(componentToken.v), args, line: lineNo } };
}

const MISSING = Symbol('missing');

/**
 * Resolve one argument against its declared kind.
 * @param {string} kind
 * @param {any} node
 * @param {{ bad: (line: number, message: string) => void, line: number, component: string, index: number, paramName: string }} at
 * @param {any[]} resolvedSoFar
 * @returns {any}
 */
function resolveKind(kind, node, at, resolvedSoFar) {
  const where = `${at.component}: argument ${at.index + 1} (\`${at.paramName}\`)`;
  switch (kind) {
    case 'text':
      if (node.k !== 'str') return at.bad(at.line, `${where} must be a string, found ${kindName(node)}`);
      return node.v;
    case 'value':
      if (node.k === 'str' || node.k === 'num') return node.v;
      return at.bad(at.line, `${where} must be a string or a number, found ${kindName(node)}`);
    case 'tone':
      if (node.k !== 'str') return at.bad(at.line, `${where} must be one of ${TONES.join(' | ')}, found ${kindName(node)}`);
      if (!TONES.includes(node.v)) return at.bad(at.line, `${where} must be one of ${TONES.join(' | ')}, found "${node.v}"`);
      return node.v;
    case 'bool':
      if (node.k !== 'bool') return at.bad(at.line, `${where} must be true or false, found ${kindName(node)}`);
      return node.v;
    case 'direction':
      if (node.k !== 'str') return at.bad(at.line, `${where} must be "row" or "column", found ${kindName(node)}`);
      if (!DIRECTIONS.includes(node.v)) return at.bad(at.line, `${where} must be "row" or "column", found "${node.v}"`);
      return node.v;
    case 'textList': {
      if (node.k !== 'arr') return at.bad(at.line, `${where} must be an array of strings, found ${kindName(node)}`);
      return node.items.map((item, i) => {
        if (item.k !== 'str') {
          return at.bad(at.line, `${where} item ${i + 1} must be a string, found ${kindName(item)}`);
        }
        return item.v;
      });
    }
    case 'numberList': {
      if (node.k !== 'arr') return at.bad(at.line, `${where} must be an array of numbers, found ${kindName(node)}`);
      return node.items.map((item, i) => {
        if (item.k === 'null') return null;
        if (item.k !== 'num') {
          return at.bad(at.line, `${where} item ${i + 1} must be a number or null, found ${kindName(item)}`);
        }
        return item.v;
      });
    }
    case 'tableRows': {
      if (node.k !== 'arr') return at.bad(at.line, `${where} must be an array of rows, found ${kindName(node)}`);
      const width = Array.isArray(resolvedSoFar[0]) ? resolvedSoFar[0].length : undefined;
      return node.items.map((row, r) => {
        if (row.k !== 'arr') {
          return at.bad(at.line, `${where} row ${r + 1} must be an array of cells, found ${kindName(row)}`);
        }
        if (width !== undefined && row.items.length !== width) {
          return at.bad(at.line, `${where} row ${r + 1} has ${row.items.length} cell(s) but there are ${width} column(s)`);
        }
        return row.items.map((cell, c) => {
          if (cell.k !== 'str' && cell.k !== 'num') {
            return at.bad(at.line, `${where} row ${r + 1} cell ${c + 1} must be a string or a number, found ${kindName(cell)}`);
          }
          return cell.v;
        });
      });
    }
    case 'stepItems': {
      if (node.k !== 'arr') return at.bad(at.line, `${where} must be an array of {title, status?, markdown?}, found ${kindName(node)}`);
      return node.items.map((item, i) => {
        if (item.k !== 'obj') {
          return at.bad(at.line, `${where} item ${i + 1} must be an object {title, status?, markdown?}, found ${kindName(item)}`);
        }
        /** @type {{title?: string, status?: string, markdown?: string}} */
        const out = {};
        for (const entry of item.entries) {
          if (entry.key === 'title') {
            if (entry.value.k !== 'str') return at.bad(at.line, `${where} item ${i + 1}: "title" must be a string`);
            out.title = entry.value.v;
          } else if (entry.key === 'markdown') {
            if (entry.value.k !== 'str') return at.bad(at.line, `${where} item ${i + 1}: "markdown" must be a string`);
            out.markdown = entry.value.v;
          } else if (entry.key === 'status') {
            if (entry.value.k !== 'str' || !STEP_STATUSES.includes(entry.value.v)) {
              return at.bad(at.line, `${where} item ${i + 1}: "status" must be one of ${STEP_STATUSES.join(' | ')}`);
            }
            out.status = entry.value.v;
          } else {
            return at.bad(at.line, `${where} item ${i + 1}: unknown key "${entry.key}" — allowed: title, status, markdown`);
          }
        }
        if (out.title === undefined) return at.bad(at.line, `${where} item ${i + 1} has no "title"`);
        return out;
      });
    }
    default:
      throw new Error(`unhandled kind ${kind}`);
  }
}

/**
 * @param {any} node
 * @returns {string}
 */
function kindName(node) {
  switch (node.k) {
    case 'str': return 'a string';
    case 'num': return 'a number';
    case 'bool': return 'a boolean';
    case 'null': return 'null';
    case 'arr': return 'an array';
    case 'obj': return 'an object';
    case 'ref': return `a reference to "${node.name}"`;
    case 'call': return `a ${node.name}(...) call`;
    default: return node.k;
  }
}

/**
 * Parse and validate a program.
 * @param {string} source
 * @returns {{ ok: boolean, tree: any | null, diagnostics: Diagnostic[], counts: Record<string, number> }}
 */
export function parseProgram(source) {
  /** @type {Diagnostic[]} */
  const diagnostics = [];
  const bad = (line, message) => {
    diagnostics.push({ line, message });
    return MISSING;
  };

  /** @type {Map<string, any>} */
  const bindings = new Map();
  const lines = String(source ?? '').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const text = raw.trim();
    if (text === '' || text.startsWith('//') || text.startsWith('#')) continue;
    try {
      const statement = parseStatement(text, i + 1);
      if (statement === null) continue;
      if (bindings.has(statement.name)) {
        diagnostics.push({ line: i + 1, message: `"${statement.name}" is defined twice — each name binds one component` });
        continue;
      }
      bindings.set(statement.name, statement.call);
    } catch (error) {
      if (error instanceof SyntaxError) {
        diagnostics.push({ line: error.line, message: error.message });
      } else {
        diagnostics.push({ line: i + 1, message: error instanceof Error ? error.message : String(error) });
      }
    }
  }

  /** @type {Set<string>} */
  const reachable = new Set();
  /** @type {Map<string, any>} */
  const resolvedCache = new Map();
  /** @type {Set<string>} */
  const resolving = new Set();

  /**
   * @param {string} name
   * @param {number} line
   * @returns {any}
   */
  const resolveRef = (name, line) => {
    if (resolvedCache.has(name)) return resolvedCache.get(name);
    const call = bindings.get(name);
    if (call === undefined) {
      return bad(line, `"${name}" is not defined — every reference names a statement on its own line`);
    }
    if (resolving.has(name)) {
      return bad(line, `"${name}" refers to itself through its own children`);
    }
    resolving.add(name);
    reachable.add(name);
    const node = resolveCall(call);
    resolving.delete(name);
    resolvedCache.set(name, node);
    return node;
  };

  /**
   * @param {any} call
   * @returns {any}
   */
  const resolveCall = (call) => {
    const spec = COMPONENTS[call.name];
    if (spec === undefined) {
      const hint = closestComponent(call.name);
      return bad(call.line, `unknown component "${call.name}"${hint !== undefined ? ` — did you mean ${hint}?` : ''}`);
    }
    if (spec.nested === true) {
      return bad(call.line, `${call.name} is only an argument of BarChart, never a child of Stack`);
    }
    if (call.args.length === 0) {
      return bad(call.line, `${call.name} needs arguments: ${signatureOf(call.name)}`);
    }
    const required = spec.params.filter(p => p.required === true).length;
    const max = spec.params.length;
    if (call.args.length < required) {
      return bad(call.line, `${call.name} takes ${required} required argument(s), got ${call.args.length} — ${signatureOf(call.name)}`);
    }
    if (call.args.length > max) {
      return bad(call.line, `${call.name} takes ${max === required ? max : `${required}–${max}`} argument(s), got ${call.args.length} — ${signatureOf(call.name)}`);
    }
    /** @type {any[]} */
    const values = [];
    for (let index = 0; index < call.args.length; index++) {
      const param = spec.params[index];
      const arg = call.args[index];
      if (param.kind === 'children') {
        if (arg.k !== 'arr') {
          return bad(call.line, `${call.name}: argument 1 must be an array of components, found ${kindName(arg)}`);
        }
        /** @type {any[]} */
        const children = [];
        for (const item of arg.items) {
          if (item.k !== 'ref') {
            return bad(call.line, `${call.name}: children must be references to names defined on their own line, found ${kindName(item)}`);
          }
          const child = resolveRef(item.name, call.line);
          if (child === MISSING) return MISSING;
          children.push(child);
        }
        if (children.length === 0) return bad(call.line, `${call.name} needs at least one child`);
        values.push(children);
        continue;
      }
      if (param.kind === 'seriesList') {
        if (arg.k !== 'arr') {
          return bad(call.line, `${call.name}: argument ${index + 1} must be an array of Series(...) references, found ${kindName(arg)}`);
        }
        /** @type {any[]} */
        const series = [];
        for (const item of arg.items) {
          if (item.k !== 'ref') {
            return bad(call.line, `${call.name}: series must be references to Series(...) lines, found ${kindName(item)}`);
          }
          const call2 = bindings.get(item.name);
          if (call2 === undefined) return bad(call.line, `"${item.name}" is not defined`);
          if (call2.name !== 'Series') return bad(call.line, `${call.name}: "${item.name}" is ${call2.name}, but series must be Series(...)`);
          reachable.add(item.name);
          resolving.add(item.name);
          const values2 = [];
          for (let k = 0; k < call2.args.length; k++) {
            const paramSpec = COMPONENTS.Series.params[k];
            const value = resolveKind(paramSpec.kind, call2.args[k], {
              bad, line: call2.line, component: 'Series', index: k, paramName: paramSpec.name,
            }, values2);
            if (value === MISSING) return MISSING;
            values2.push(value);
          }
          if (values2.length < COMPONENTS.Series.params.length) {
            return bad(call2.line, `Series takes 2 arguments, got ${values2.length} — ${signatureOf('Series')}`);
          }
          resolving.delete(item.name);
          series.push({ name: 'Series', args: values2, line: call2.line });
        }
        values.push(series);
        continue;
      }
      const value = resolveKind(param.kind, arg, {
        bad, line: call.line, component: call.name, index, paramName: param.name,
      }, values);
      if (value === MISSING) return MISSING;
      values.push(value);
    }
    return { name: call.name, args: values, line: call.line };
  };

  const rootCall = bindings.get('root');
  let tree = null;
  if (rootCall === undefined) {
    diagnostics.push({ line: 1, message: 'a block needs a `root = Stack([...])` statement' });
  } else {
    reachable.add('root');
    const resolved = resolveCall(rootCall);
    if (resolved !== MISSING) {
      if (resolved.name !== 'Stack') {
        diagnostics.push({ line: rootCall.line, message: `root must be Stack([...]), found ${resolved.name}(...)` });
      } else {
        tree = resolved;
      }
    }
  }

  for (const [name, call] of bindings) {
    if (name === 'root' || reachable.has(name)) continue;
    diagnostics.push({ line: call.line, message: `"${name}" is never used — every name must be reachable from root` });
  }

  const counts = {};
  if (tree !== null) {
    const walk = node => {
      counts[node.name] = (counts[node.name] ?? 0) + 1;
      for (const value of node.args) {
        if (Array.isArray(value)) {
          for (const child of value) {
            if (child !== null && typeof child === 'object' && typeof child.name === 'string' && child.name !== 'Series') walk(child);
          }
        }
      }
    };
    walk(tree);
  }

  diagnostics.sort((a, b) => a.line - b.line);
  return { ok: diagnostics.length === 0 && tree !== null, tree, diagnostics, counts };
}

/**
 * Text the model reads when its program is rejected.
 * @param {Diagnostic[]} diagnostics
 * @returns {string}
 */
export function formatDiagnostics(diagnostics) {
  return diagnostics.map(d => `line ${d.line}: ${d.message}`).join('\n');
}

/**
 * One short line describing what a block draws, for the tool result and the
 * model's own record of what it produced.
 * @param {Record<string, number>} counts
 * @returns {string}
 */
export function describeCounts(counts) {
  const label = {
    Stack: 'stack', Row: 'row', Text: 'text', Callout: 'callout', Stat: 'stat',
    Table: 'table', BarChart: 'bar chart', Steps: 'steps', Series: 'series',
  };
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, n]) => `${n}× ${label[name] ?? name}`)
    .join(', ');
}
