/**
 * Host half: registers the `render_ui` tool and the guidance that teaches it.
 *
 * The tool's job is narrow on purpose — parse, validate, report. What the block
 * looks like is decided entirely in the browser from the call's own arguments,
 * so a block survives reload, replay and fork with no store of its own, and the
 * model's failure feedback is the same diagnostics the user would have seen.
 */

import { defineTool } from '@deepseek-ai/dsh-tools';
import { describeCounts, formatDiagnostics, parseProgram } from './src/parse.js';
import { buildGuidance } from './src/guidance.js';

/** Largest program accepted, in characters. Well above a full screen of UI. */
const MAX_PROGRAM = 20_000;

export const name = 'openui-blocks';

export const inject = ['tools', 'systemPrompt'];

/**
 * The projection's state and its client view share one shape: the turn being
 * folded and the blocks counted for it so far.
 * @param {string} subject - the name a rejection reports.
 * @returns {{ parse: (value: unknown) => { turn: number, blocks: unknown[] } }}
 */
function blocksSchema(subject) {
  return {
    parse(value) {
      if (value === null || typeof value !== 'object' || !Array.isArray(value.blocks)) {
        throw new Error(`${subject}: expected { turn: number, blocks: Block[] }`);
      }
      return value;
    },
  };
}

/**
 * The program and title a `render_ui` call carried, or null when its arguments
 * are not the JSON object the tool declared. The projection folds this straight
 * out of the tool call, so the block needs no event of its own.
 * @param {unknown} raw
 * @returns {{ program: string, title?: string } | null}
 */
function parseCallArgs(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  if (typeof value.program !== 'string' || value.program === '') return null;
  return {
    program: value.program,
    ...(typeof value.title === 'string' && value.title !== '' ? { title: value.title } : {}),
  };
}

/**
 * Whether this process's client-module graph carries the browser half. A
 * plugin installed into a running app gets its host rows live but its client
 * bundle only on the next start, and a block that draws nothing is baffling
 * without that distinction — so the tool reports it once, in its result.
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @returns {string | undefined} a diagnostic clause, or undefined when loaded.
 */
function clientModuleState(ctx) {
  let modules;
  try {
    modules = ctx.get('clientModules');
  } catch {
    return undefined;
  }
  if (modules === undefined || typeof modules.clientPath !== 'function') return undefined;
  try {
    return modules.clientPath('@fstack/dsh-openui-blocks') === undefined
      ? 'client bundle not in this process — restart DSH to load it'
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {import('@deepseek-ai/cordis').Context} ctx
 * @param {{ prompt?: boolean, maxProgramBytes?: number }} [config]
 */
export function apply(ctx, config = {}) {
  const prompt = config.prompt !== false;
  const limit = typeof config.maxProgramBytes === 'number' ? config.maxProgramBytes : MAX_PROGRAM;

  if (prompt) {
    ctx.systemPrompt.section({
      name: 'tool:render_ui',
      // Tool guidance band, after the shipped tools' own sections.
      order: 130,
      text: buildGuidance(),
    });
  }

  // The host folds the blocks the model emits into one projection keyed by the
  // turn each landed in. The client's turn-tail entry reads it.
  //
  // The fold reads the `render_ui` tool call — its arguments are already in the
  // log — instead of writing a block event of its own. A harness owns the
  // durable event vocabulary: a stored type it does not know makes the whole
  // session unreadable unless the writer marked it `ignorable`, and a plugin
  // cannot set that marker through `session.append`. Deriving the block from the
  // call keeps replay, fork and old sessions identical with no new event type.
  ctx.inject(['sessionProjections'], (projectionCtx) => {
    projectionCtx.sessionProjections.register({
      key: 'openuiBlocks',
      stateSchema: blocksSchema('openuiBlocks'),
      init: () => ({ turn: 0, blocks: [] }),
      apply: (state, event) => {
        if (event.type === 'turn/start') return { turn: event.data.turn, blocks: state.blocks };
        if (event.type === 'tool/call' && event.data?.name === 'render_ui') {
          const args = parseCallArgs(event.data.arguments);
          if (args === null) return state;
          return {
            turn: state.turn,
            blocks: [...state.blocks, {
              turn: event.data.turn,
              seq: event.seq,
              callId: String(event.data.callId ?? ''),
              program: args.program,
              ...(args.title === undefined ? {} : { title: args.title }),
            }],
          };
        }
        if (event.type === 'tool/result' && event.data?.message?.isError === true) {
          // A call the tool refused drew nothing, and the model already has the
          // diagnostics — so the failed call leaves no block behind.
          const callId = String(event.data.message.source?.callId ?? '');
          if (callId === '' || !state.blocks.some(block => block.callId === callId)) return state;
          return { turn: state.turn, blocks: state.blocks.filter(block => block.callId !== callId) };
        }
        return state;
      },
      // `wire` is what makes the unit client-visible: a projection without it
      // stays host-only, `useProjection('openuiBlocks')` reads undefined, and
      // the turn-tail entry has nothing to draw.
      wire: {
        viewSchema: blocksSchema('openuiBlocks view'),
        view: (state) => state,
        // A turn's blocks belong to an opened session, not to its list row.
        summary: false,
      },
      // Fold semantics changed: version 1 read a `openui/block` event.
      stateVersion: 2,
    });
  });

  ctx.tools.register(defineTool({
    name: 'render_ui',
    description: 'Draw part of your answer as native UI: a block of stats, a table, a ranked bar chart, a flow of steps or a callout. Write a short openui-lang program; the chat renders it with the harness design system. Use it when the answer is data or a structure the reader would otherwise picture — not for a few numbers or a short list, and never instead of the prose that explains it.',
    parameters: {
      program: {
        type: 'string',
        required: true,
        description: 'The openui-lang program: one statement per line, starting with `root = Stack([...])`.',
      },
      title: {
        type: 'string',
        description: 'Optional short heading for the block, e.g. "Q4 revenue".',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          summary: { type: 'string', required: true },
          components: { type: 'array', required: true, items: { type: 'string' } },
        },
      },
      render: (_args, value) => [{ type: 'text', text: value.summary }],
    },
    execute(args, exec) {
      const program = String(args.program ?? '');
      if (program.length > limit) {
        throw new Error(`render_ui: program is ${program.length} characters, the limit is ${limit}`);
      }
      const parsed = parseProgram(program);
      if (!parsed.ok || parsed.tree === null) {
        // The message IS the model's next move: name the line, the component,
        // the argument and the signature it should have matched.
        throw new Error(`render_ui: the program was rejected and nothing was drawn.\n${formatDiagnostics(parsed.diagnostics)}\n\nCompare with the signatures above and send a corrected program.`);
      }
      // The call's arguments are the block: the client draws it from the same
      // log the model wrote them to, and the projection above only groups them
      // by turn for the turn-tail entry. Nothing is appended here.
      const client = clientModuleState(ctx);
      return {
        summary: `Drew a UI block: ${describeCounts(parsed.counts)}.${client === undefined ? '' : ` (${client})`}`,
        components: Object.keys(parsed.counts),
      };
    },
  }));
}
