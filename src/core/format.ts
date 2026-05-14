import type { QueryResult } from '../types.js';

const MAX_CELL_LENGTH = 120;

export function formatQueryResult(result: QueryResult): string {
  const lines = [
    `Rows: ${result.rowCount}${result.truncated ? ' (truncated)' : ''}`,
    '',
    rowsToMarkdownTable(result.rows),
  ];

  return lines.join('\n');
}

function rowsToMarkdownTable(rows: unknown[]): string {
  if (rows.length === 0) {
    return '_No rows returned._';
  }

  const objectRows = rows.map((row) =>
    row && typeof row === 'object' && !Array.isArray(row)
      ? (row as Record<string, unknown>)
      : { value: row },
  );
  const columns = collectColumns(objectRows);
  if (columns.length === 0) {
    return '_No columns returned._';
  }

  return [
    `| ${columns.map(escapeMarkdownCell).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...objectRows.map(
      (row) => `| ${columns.map((column) => formatCell(row[column])).join(' | ')} |`,
    ),
  ].join('\n');
}

function collectColumns(rows: Array<Record<string, unknown>>): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    for (const column of Object.keys(row)) {
      if (!seen.has(column)) {
        seen.add(column);
        columns.push(column);
      }
    }
  }

  return columns;
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const text =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? String(value)
      : stringifyComplexValue(value);

  return escapeMarkdownCell(truncate(text ?? ''));
}

function stringifyComplexValue(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }

  try {
    return JSON.stringify(value, circularReferenceReplacer()) ?? String(value);
  } catch {
    return String(value);
  }
}

function circularReferenceReplacer(): (key: string, value: unknown) => unknown {
  const seen = new WeakSet<object>();

  return (_key: string, value: unknown) => {
    if (typeof value !== 'object' || value === null) {
      return value;
    }

    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    return value;
  };
}

function truncate(value: string): string {
  if (value.length <= MAX_CELL_LENGTH) {
    return value;
  }

  return `${value.slice(0, MAX_CELL_LENGTH - 3)}...`;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|');
}
