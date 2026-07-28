import { strToU8, zipSync } from "fflate";

export type ExcelValue = string | number | null | undefined;

export type ExcelSheet = {
  name: string;
  columns: string[];
  rows: ExcelValue[][];
};

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export function createXlsxWorkbook(sheets: ExcelSheet[]): Uint8Array {
  if (!sheets.length) throw new Error("Excel 시트가 필요합니다.");
  const names = uniqueSheetNames(sheets.map((sheet) => sheet.name));
  const files: Record<string, Uint8Array> = {
    "[Content_Types].xml": xmlFile(contentTypesXml(sheets.length)),
    "_rels/.rels": xmlFile(rootRelationshipsXml()),
    "xl/workbook.xml": xmlFile(workbookXml(names)),
    "xl/_rels/workbook.xml.rels": xmlFile(workbookRelationshipsXml(sheets.length)),
    "xl/styles.xml": xmlFile(stylesXml()),
  };
  sheets.forEach((sheet, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = xmlFile(worksheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}

export function xlsxResponse(filename: string, sheets: ExcelSheet[]): Response {
  const bytes = createXlsxWorkbook(sheets);
  const body = new Uint8Array(bytes.byteLength);
  body.set(bytes);
  const safeFilename = filename.toLowerCase().endsWith(".xlsx") ? filename : `${filename}.xlsx`;
  return new Response(body.buffer, {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="thecup-edu-export.xlsx"; filename*=UTF-8''${encodeURIComponent(safeFilename)}`,
      "content-length": String(bytes.byteLength),
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export function koreanDateStamp(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function worksheetXml(sheet: ExcelSheet): string {
  const rows = [sheet.columns, ...sheet.rows];
  const columnCount = Math.max(1, sheet.columns.length);
  const rowCount = Math.max(1, rows.length);
  const widths = sheet.columns.map((column, columnIndex) => {
    const longest = rows.reduce(
      (length, row) => Math.max(length, String(row[columnIndex] ?? "").length),
      column.length,
    );
    return Math.min(42, Math.max(10, longest + 2));
  });
  const cells = rows.map((row, rowIndex) => {
    const rowNumber = rowIndex + 1;
    const values = Array.from({ length: columnCount }, (_, columnIndex) => {
      const reference = `${columnLetter(columnIndex + 1)}${rowNumber}`;
      return cellXml(reference, row[columnIndex], rowIndex === 0 ? 1 : 0);
    }).join("");
    return `<row r="${rowNumber}">${values}</row>`;
  }).join("");
  const columns = widths.map((width, index) => (
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`
  )).join("");
  const range = `A1:${columnLetter(columnCount)}${rowCount}`;
  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${range}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${columns}</cols><sheetData>${cells}</sheetData><autoFilter ref="${range}"/></worksheet>`;
}

function cellXml(reference: string, value: ExcelValue, style: number): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  }
  const text = value == null ? "" : String(value);
  return `<c r="${reference}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(text)}</t></is></c>`;
}

function workbookXml(names: string[]): string {
  const sheets = names.map((name, index) => (
    `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`
  )).join("");
  return `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets}</sheets><calcPr calcId="191029"/></workbook>`;
}

function workbookRelationshipsXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) => (
    `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`
  )).join("");
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets}<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function rootRelationshipsXml(): string {
  return `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
}

function contentTypesXml(sheetCount: number): string {
  const sheets = Array.from({ length: sheetCount }, (_, index) => (
    `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  )).join("");
  return `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets}</Types>`;
}

function stylesXml(): string {
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Pretendard"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Pretendard"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF111111"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
}

function uniqueSheetNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name, index) => {
    const base = (name.replace(/[\\/*?:\[\]]/g, " ").trim() || `시트 ${index + 1}`).slice(0, 31);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      const tail = ` ${suffix}`;
      candidate = `${base.slice(0, 31 - tail.length)}${tail}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

function columnLetter(index: number): string {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function xmlFile(value: string): Uint8Array {
  return strToU8(value);
}
