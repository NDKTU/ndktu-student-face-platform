/**
 * Выгрузка таблицы в CSV.
 *
 * CSV, а не xlsx: `xlsx` — самый тяжёлый пакет в старом фронтенде, а из всего
 * его API здесь нужен один лист без формул и объединённых ячеек. Excel открывает
 * такой файл сам, если поставить BOM.
 */

/** Кавычки удваиваются; поле берётся в кавычки, если внутри есть разделитель. */
function cell(value: string): string {
  const escaped = value.replace(/"/g, '""');
  return /[",;\r\n]/.test(value) ? `"${escaped}"` : escaped;
}

export function toCsv(rows: string[][]): string {
  // Точка с запятой, а не запятая: Excel с локалью, где десятичный разделитель
  // запятая, иначе разложит «4,70» на две колонки.
  return rows.map((row) => row.map(cell).join(';')).join('\r\n');
}

export function downloadCsv(filename: string, rows: string[][]): void {
  // BOM обязателен: без него Excel читает файл как cp1251 и ломает «ў» и «’».
  const blob = new Blob(['﻿', toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
}
