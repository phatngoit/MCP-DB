import { describe, expect, it } from 'vitest';
import { formatQueryResult, formatSchemaList, formatTableList, formatTableDescription } from './format.js';

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

describe('listing formatters', () => {
  it('formats schema list as a single-column table', () => {
    const output = formatSchemaList(['public', 'hr', 'finance']);
    expect(output).toContain('| schema |');
    expect(output).toContain('| public |');
    expect(output).toContain('| hr |');
    expect(output).toContain('| finance |');
  });

  it('returns empty message for empty schema list', () => {
    expect(formatSchemaList([])).toBe('_No schemas found._');
  });

  it('formats table list as a multi-column table', () => {
    const output = formatTableList([
      { schema: 'public', name: 'users', type: 'TABLE' },
      { schema: 'public', name: 'orders', type: 'TABLE' },
    ]);
    expect(output).toContain('| schema | name | type |');
    expect(output).toContain('| public | users | TABLE |');
    expect(output).toContain('| public | orders | TABLE |');
  });

  it('returns empty message for empty table list', () => {
    expect(formatTableList([])).toBe('_No tables found._');
  });

  it('formats table description with header and column table', () => {
    const output = formatTableDescription({
      schema: 'public',
      name: 'users',
      columns: [
        { name: 'id', type: 'INT', nullable: false },
        { name: 'email', type: 'VARCHAR(255)', nullable: true },
      ],
    });
    expect(output).toContain('Table: **public.users**');
    expect(output).toContain('| name | type | nullable |');
    expect(output).toContain('| id | INT | false |');
    expect(output).toContain('| email | VARCHAR(255) | true |');
  });

  it('formats table description without schema', () => {
    const output = formatTableDescription({
      name: 'products',
      columns: [{ name: 'sku', type: 'TEXT' }],
    });
    expect(output).toContain('Table: **products**');
    expect(output).toContain('| sku | TEXT |');
  });
});
