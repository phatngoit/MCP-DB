import { describe, expect, it } from 'vitest';
import { formatQueryResult } from './format.js';

describe('query result formatting', () => {
  it('formats rows as a markdown table', () => {
    const output = formatQueryResult({
      rows: [
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' },
      ],
      rowCount: 2,
      truncated: false,
    });

    expect(output).toContain('| id | name |');
    expect(output).toContain('| 1 | Alice |');
    expect(output).toContain('| 2 | Bob |');
  });

  it('escapes markdown separators and marks truncated results', () => {
    const output = formatQueryResult({
      rows: [{ name: 'A|B', note: 'line 1\nline 2' }],
      rowCount: 1,
      truncated: true,
    });

    expect(output).toContain('Rows: 1 (truncated)');
    expect(output).toContain('A\\|B');
    expect(output).toContain('line 1 line 2');
  });

  it('formats circular object cells without throwing', () => {
    const value: Record<string, unknown> = { name: 'oracle-object' };
    value.self = value;

    const output = formatQueryResult({
      rows: [{ id: 1, payload: value }],
      rowCount: 1,
      truncated: false,
    });

    expect(output).toContain('| id | payload |');
    expect(output).toContain('oracle-object');
    expect(output).toContain('[Circular]');
  });
});
