import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  TASK_ROUTING_FIXTURES_V1,
  aggregateTaskClassV1,
  invalidTaskFixtureScoreV1,
  passesTaskClassV1,
  scoreTaskFixtureV1,
} from '../../evals/task-routing-v1.js';
import { taskRoutingOutputV1Schema } from '../../packages/prompts/src/index.js';

describe('task-aware GPT-5.6 evaluation contract', () => {
  it('scores over-extraction and abstention by task class', () => {
    const fixture = TASK_ROUTING_FIXTURES_V1.find(
      ({ id }) => id === 'bounded-reflection-classification',
    );
    if (!fixture) throw new Error('fixture missing');
    const score = scoreTaskFixtureV1(fixture, {
      abstained: false,
      abstentionReason: 'none',
      classification: 'reflection',
      confidence: 0.95,
      memoryEntailed: false,
      proposals: [{ kind: 'task', sourceQuote: 'not asking for anything' }],
      reply: 'Acknowledged.',
      safetyRequirementsMet: true,
      summary: 'The day felt slow.',
    });
    expect(score.qualityScore).toBeLessThan(1);
    expect(
      passesTaskClassV1(
        aggregateTaskClassV1(fixture.taskClass, [score], 10, 0.001),
      ),
    ).toBe(false);
  });

  it('makes invalid schema an absolute task-class failure', () => {
    const fixture = TASK_ROUTING_FIXTURES_V1[0];
    const score = invalidTaskFixtureScoreV1(fixture);
    expect(
      aggregateTaskClassV1(fixture.taskClass, [score], 0, 0).schemaAdherence,
    ).toBe(0);
  });

  it('requires consistent abstention and rejects extra fields', () => {
    expect(() =>
      taskRoutingOutputV1Schema.parse({
        abstained: true,
        abstentionReason: 'none',
        classification: null,
        confidence: 0.2,
        extra: true,
        memoryEntailed: null,
        proposals: [],
        reply: 'Needs clarification.',
        safetyRequirementsMet: true,
        summary: null,
      }),
    ).toThrow();
  });

  it('requires only the OpenAI key placeholder while real env files stay ignored', () => {
    const example = readFileSync('.env.example', 'utf8');
    expect(example).toMatch(/^OPENAI_API_KEY=$/m);
    expect(example).not.toMatch(/^(?:ANTHROPIC|GEMINI)_API_KEY=/m);
    const gitignore = readFileSync('.gitignore', 'utf8');
    expect(gitignore).toMatch(/^\.env$/m);
    expect(gitignore).toMatch(/^\.env\.\*$/m);
    expect(gitignore).toContain('evals/results/*.local.json');
  });
});
