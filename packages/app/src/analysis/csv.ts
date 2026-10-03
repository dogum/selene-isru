export type CsvValue = string | number | boolean | null | undefined;

export interface CsvColumn<Row> {
  header: string;
  value: (row: Row) => CsvValue;
}

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    // Full precision: a CSV is for analysis, not display.
    return Number.isFinite(value) ? String(value) : "";
  }
  const text = String(value);
  return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV: one header row, quoted only where needed, numbers unformatted. */
export function toCsv<Row>(columns: CsvColumn<Row>[], rows: readonly Row[]): string {
  return [
    columns.map((column) => cell(column.header)).join(","),
    ...rows.map((row) => columns.map((column) => cell(column.value(row))).join(","))
  ].join("\n");
}
