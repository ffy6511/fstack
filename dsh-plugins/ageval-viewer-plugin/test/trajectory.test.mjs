import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyStep,
  filterItems,
  formatElapsedMs,
  groupInvokes,
  inheritedCut,
  outlineText,
  parseTrajectory,
  stepBody,
  stepIconName,
  visibleSteps,
} from '../src/trajectory.js';

test('classifies the viewer majors and hides batch auto-approve', () => {
  const raw = [
    JSON.stringify({ role: 'user', content: 'fix the test', turn_index: 0 }),
    JSON.stringify({ role: 'assistant', part: 'thought', content: 'look at the assertion', turn_index: 1 }),
    JSON.stringify({ role: 'assistant', content: 'I will read the file', turn_index: 1 }),
    JSON.stringify({ type: 'tool_call', function_name: 'bash', kind: 'execute', args: { command: 'ls' }, status: 'completed', elapsed_ms: 1500, turn_index: 1 }),
    JSON.stringify({ type: 'observation', raw_output: 'a.ts\n', status: 'ok', turn_index: 1 }),
    JSON.stringify({ type: 'permission_decision', policy: 'batch_auto_approve', outcome: 'allow' }),
    JSON.stringify({ type: 'permission_decision', policy: 'ask', outcome: 'allow', option_id: 'once' }),
    JSON.stringify({ type: 'terminal', ok: false, stop_reason: 'max_tokens', metadata: { executor_kind: 'local' } }),
    'not json',
  ].join('\n');
  const steps = visibleSteps(parseTrajectory(raw));
  assert.equal(steps.length, 8);
  assert.deepEqual(steps.map(step => classifyStep(step).major), [
    'user', 'thought', 'agent', 'tool_call', 'observation', 'permission', 'terminal', 'message',
  ]);
  assert.equal(stepIconName(steps[3]), 'terminal');
  assert.equal(stepBody(steps[3]).kind, 'json');
  assert.match(stepBody(steps[3]).text, /"command": "ls"/);
  assert.equal(stepBody(steps[4]).text, 'a.ts\n');
  assert.match(stepBody(steps[5]).text, /policy=ask/);
  assert.match(stepBody(steps[6]).text, /not ok/);
  assert.match(stepBody(steps[6]).text, /executor_kind=local/);
  assert.equal(formatElapsedMs(stepBody(steps[3]) && 1500), '1.5s');
  assert.equal(outlineText(steps[0]), 'fix the test');
  assert.equal(outlineText(steps[3]), 'bash');
  const items = filterItems(steps);
  assert.equal(items[0].id, 'all');
  assert.ok(items.some(item => item.id === 'tool_call' && item.label === '工具'));
  assert.equal(filterItems([steps[0]]).length, 0);
});

test('groups invokes by turn and marks the inherited cut', () => {
  const steps = [
    { role: 'user', content: 'a', turn_index: 0, profile_id: 'solver', inherited: true },
    { role: 'assistant', content: 'b', turn_index: 1, profile_id: 'solver', inherited: true },
    { type: 'tool_call', function_name: 'read', turn_index: 1, profile_id: 'solver', inherited: true },
    { role: 'assistant', content: 'c', turn_index: 2, profile_id: 'reviewer' },
  ];
  const blocks = groupInvokes(steps);
  assert.equal(blocks.length, 3);
  assert.equal(blocks[1].steps.length, 2);
  assert.equal(blocks[1].profileId, 'solver');
  assert.equal(inheritedCut(steps), 2);
  assert.equal(stepBody({ type: 'tool_call', function_name: 'noop', args: {} }).text, '');
  assert.equal(formatElapsedMs(400), '400ms');
  assert.equal(formatElapsedMs(125000), '2m 05s');
});
