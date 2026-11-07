import assert from 'node:assert/strict';
import test from 'node:test';
import { parseProgram } from '../src/parse.js';

const wrap = (...lines) => ['root = Stack([x])', ...lines].join('\n');

test('a valid program resolves and counts its components', () => {
  const program = [
    'root = Stack([a, b])',
    'a = Stat("Revenue", "¥412k", "+12.4%")',
    'b = BarChart(["Q1", "Q2"], [s], "k", true)',
    's = Series("Revenue", [98, null])',
  ].join('\n');
  const parsed = parseProgram(program);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.counts, { Stack: 1, Stat: 1, BarChart: 1 });
  assert.equal(parsed.tree.args[0][1].args[1][0].args[1][1], null);
});

test('an unknown component is reported with the closest name', () => {
  const parsed = parseProgram(wrap('x = BarChat(["a"], [])'));
  assert.equal(parsed.ok, false);
  assert.match(parsed.diagnostics[0].message, /unknown component "BarChat"/);
  assert.match(parsed.diagnostics[0].message, /did you mean/);
});

test('arity is checked against the signature', () => {
  const parsed = parseProgram(wrap('x = Text("a", "b")'));
  assert.equal(parsed.ok, false);
  assert.match(parsed.diagnostics[0].message, /Text takes 1 argument/);
  assert.match(parsed.diagnostics[0].message, /Text\(text\)/);
});

test('an undefined reference names the line', () => {
  const parsed = parseProgram('root = Stack([missing])');
  assert.equal(parsed.diagnostics[0].line, 1);
  assert.match(parsed.diagnostics[0].message, /"missing" is not defined/);
});

test('an unreachable name is rejected instead of silently ignored', () => {
  const parsed = parseProgram(wrap('x = Text("hello")', 'orphan = Text("nobody reads me")'));
  assert.equal(parsed.ok, false);
  assert.ok(parsed.diagnostics.some(d => /"orphan" is never used/.test(d.message)));
});

test('root must be a Stack', () => {
  const parsed = parseProgram('root = Text("hi")');
  assert.equal(parsed.ok, false);
  assert.match(parsed.diagnostics[0].message, /root must be Stack/);
});

test('every table row carries one cell per column', () => {
  const parsed = parseProgram(wrap('x = Table(["a", "b"], [["1"]])'));
  assert.equal(parsed.ok, false);
  assert.match(parsed.diagnostics[0].message, /has 1 cell\(s\) but there are 2 column\(s\)/);
});

test('Series is only valid as a BarChart argument', () => {
  const asChild = parseProgram(wrap('x = Series("v", [1])'));
  assert.equal(asChild.ok, false);
  assert.match(asChild.diagnostics[0].message, /only an argument of BarChart/);

  const asChart = parseProgram(wrap('x = BarChart(["a"], [t])', 't = Text("not a series")'));
  assert.match(asChart.diagnostics[0].message, /Series\(\.\.\.\)/);
});

test('tone and direction accept only their vocabulary', () => {
  const tone = parseProgram(wrap('x = Callout("a", "danger")'));
  assert.match(tone.diagnostics[0].message, /neutral \| info \| success \| warning \| error/);

  const direction = parseProgram(wrap('x = Steps([{title: "a"}], "diagonal")'));
  assert.match(direction.diagnostics[0].message, /"row" or "column"/);
});

test('one statement per line: a wrapped call is a syntax error with its line', () => {
  const parsed = parseProgram(['root = Stack([a])', 'a = Callout(', '  "wrapped",', '  "info")'].join('\n'));
  assert.equal(parsed.ok, false);
  // The reference fails first and the wrapped line fails on its own; both name
  // their line rather than blaming the root.
  assert.ok(parsed.diagnostics.some(d => d.line === 2 && /expected a value/.test(d.message)));
});

test('escapes and inline markup survive to the renderer', () => {
  const parsed = parseProgram(wrap('x = Text("line one\\n**bold** and `code`")'));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.tree.args[0][0].args[0], 'line one\n**bold** and `code`');
});

test('an empty program says what to write', () => {
  const parsed = parseProgram('');
  assert.equal(parsed.ok, false);
  assert.match(parsed.diagnostics[0].message, /root = Stack/);
});
