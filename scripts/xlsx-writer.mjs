/**
 * Minimal, dependency-free XLSX writer.
 *
 * Exists so `pnpm arch:xlsx` can regenerate the architecture workbook on any
 * machine with Node >= 22 and nothing installed — adding `exceljs` to the
 * monorepo just to emit one spreadsheet was not worth the dependency.
 *
 * Produces a real OOXML workbook: a ZIP (deflate, via node:zlib) containing
 * the SpreadsheetML parts. Strings are written inline (`t="inlineStr"`) so
 * there is no sharedStrings table to keep in sync.
 */

import { deflateRawSync, crc32 } from "node:zlib";
import { writeFileSync } from "node:fs";

const COL_LETTERS = (index) => {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
};

const escapeXml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Control chars are illegal in XML 1.0 and Excel refuses the whole file.
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "");

// ---------------------------------------------------------------------------
// ZIP container
// ---------------------------------------------------------------------------

function buildZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const data = Buffer.from(file.data, "utf8");
    const compressed = deflateRawSync(data, { level: 9 });
    const crc = crc32(data) >>> 0;

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4); // version needed
    localHeader.writeUInt16LE(0, 6); // flags
    localHeader.writeUInt16LE(8, 8); // method: deflate
    localHeader.writeUInt16LE(0, 10); // mod time
    localHeader.writeUInt16LE(0x21, 12); // mod date (1996-01-01, fixed => reproducible output)
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);

    chunks.push(localHeader, nameBuf, compressed);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4); // version made by
    centralHeader.writeUInt16LE(20, 6); // version needed
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x21, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    central.push(Buffer.concat([centralHeader, nameBuf]));
    offset += localHeader.length + nameBuf.length + compressed.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...chunks, centralBuf, end]);
}

// ---------------------------------------------------------------------------
// SpreadsheetML parts
// ---------------------------------------------------------------------------

/**
 * Style ids referenced by cell `s=` below. Kept as a hand-written table
 * because there are only four: body, header, section title, and wrapped body.
 */
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="4">
<font><sz val="11"/><color theme="1"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>
<font><b/><sz val="14"/><color rgb="FF0F172A"/><name val="Calibri"/></font>
<font><sz val="11"/><color rgb="FF475569"/><name val="Calibri"/><i/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
</styleSheet>`;

const STYLE = { BODY: 0, HEADER: 1, TITLE: 2, NOTE: 3, BANDED: 4 };

function sheetXml(sheet) {
  const { columns, rows, title, note } = sheet;
  const cols = columns
    .map((c, i) => `<col min="${i + 1}" max="${i + 1}" width="${c.width}" customWidth="1"/>`)
    .join("");

  const out = [];
  let rowIndex = 1;

  const pushRow = (values, styleId, height) => {
    const cells = values
      .map((value, colIndex) => {
        if (value === "" || value === null || value === undefined) {
          return `<c r="${COL_LETTERS(colIndex)}${rowIndex}" s="${styleId}"/>`;
        }
        return `<c r="${COL_LETTERS(colIndex)}${rowIndex}" s="${styleId}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
      })
      .join("");
    out.push(
      `<row r="${rowIndex}"${height ? ` ht="${height}" customHeight="1"` : ""}>${cells}</row>`,
    );
    rowIndex += 1;
  };

  pushRow([title], STYLE.TITLE, 24);
  if (note) pushRow([note], STYLE.NOTE, 18);
  pushRow([], STYLE.BODY);

  const headerRowIndex = rowIndex;
  pushRow(columns.map((c) => c.header), STYLE.HEADER, 22);
  rows.forEach((row, i) => {
    pushRow(
      columns.map((_, colIndex) => row[colIndex]),
      i % 2 === 1 ? STYLE.BANDED : STYLE.BODY,
    );
  });

  const lastCol = COL_LETTERS(columns.length - 1);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><outlinePr summaryBelow="1" summaryRight="1"/></sheetPr>
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRowIndex}" topLeftCell="A${headerRowIndex + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="15"/>
<cols>${cols}</cols>
<sheetData>${out.join("")}</sheetData>
<autoFilter ref="A${headerRowIndex}:${lastCol}${headerRowIndex}"/>
<pageMargins left="0.5" right="0.5" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>
</worksheet>`;
}

/**
 * @param {{name: string, title: string, note?: string, columns: {header: string, width: number}[], rows: (string|number)[][]}[]} sheets
 * @param {string} outPath
 */
export function writeXlsx(sheets, outPath) {
  const files = [];

  files.push({
    name: "[Content_Types].xml",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`,
  });

  files.push({
    name: "_rels/.rels",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`,
  });

  files.push({
    name: "xl/workbook.xml",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>
${sheets.map((s, i) => `<sheet name="${escapeXml(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("\n")}
</sheets>
</workbook>`,
  });

  files.push({
    name: "xl/_rels/workbook.xml.rels",
    data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
  });

  files.push({ name: "xl/styles.xml", data: STYLES_XML });

  sheets.forEach((sheet, i) => {
    files.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sheet) });
  });

  writeFileSync(outPath, buildZip(files));
  return outPath;
}
