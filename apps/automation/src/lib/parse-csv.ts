// CSV import for leads. Deliberately hand-rolled rather than pulling in a
// parser dependency: the shape we accept is narrow (a header row plus flat
// text columns), and the only hard requirement is that quoted fields keep
// their commas — an exported contact list routinely has "Sharma, Anita" in
// the name column, and a naive split() turns that into a phantom column and
// shifts every value after it.

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

/** RFC4180-ish: quoted fields, "" as a literal quote, CRLF or LF endings. */
export function parseCsv(text: string): ParsedCsv {
  // Excel writes a UTF-8 BOM, which would otherwise become part of the first
  // header name and stop it matching any alias.
  const input = text.replace(/^﻿/, "");

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  const endField = () => {
    row.push(field.trim());
    field = "";
  };
  const endRow = () => {
    endField();
    // A trailing newline produces one empty row; so does a blank separator
    // line mid-file. Neither is a record.
    if (row.some((cell) => cell !== "")) rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const char = input[i]!;

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += char;
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (char === ",") {
      endField();
      i += 1;
      continue;
    }
    if (char === "\r") {
      // Swallow CR; the LF that follows ends the row.
      i += 1;
      continue;
    }
    if (char === "\n") {
      endRow();
      i += 1;
      continue;
    }

    field += char;
    i += 1;
  }
  endRow();

  const headers = rows.shift() ?? [];
  return { headers, rows };
}

/** Contact columns an import is allowed to populate. */
export type LeadField =
  | "name"
  | "phone"
  | "email"
  | "source"
  | "sourcePlatform"
  | "campaign"
  | "referralCode";

// Whatever the spreadsheet happened to call the column. Compared after
// lowercasing and stripping everything that isn't a letter or digit, so
// "Phone Number", "phone_number" and "PhoneNumber" all collapse to the same
// key and don't each need their own entry.
const HEADER_ALIASES: Record<LeadField, string[]> = {
  name: ["name", "fullname", "contactname", "leadname", "firstname", "person"],
  phone: ["phone", "phonenumber", "mobile", "mobilenumber", "number", "contact", "whatsapp", "whatsappnumber"],
  email: ["email", "emailaddress", "mail", "emailid"],
  source: ["source", "leadsource", "channel"],
  sourcePlatform: ["sourceplatform", "platform", "medium"],
  campaign: ["campaign", "campaignname", "utmcampaign", "ad"],
  referralCode: ["referralcode", "referral", "refcode", "code"],
};

function canonical(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Column index → contact field. Unrecognised columns are simply absent, so
 * an export with extra columns imports fine instead of being rejected.
 * The first matching column wins — a duplicate "Phone" column is ignored
 * rather than overwriting the one we already read.
 */
export function mapHeaders(headers: string[]): Map<number, LeadField> {
  const mapping = new Map<number, LeadField>();
  const claimed = new Set<LeadField>();

  headers.forEach((header, index) => {
    const key = canonical(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES) as [LeadField, string[]][]) {
      if (claimed.has(field)) continue;
      if (aliases.includes(key)) {
        mapping.set(index, field);
        claimed.add(field);
        return;
      }
    }
  });

  return mapping;
}

export type LeadRow = Partial<Record<LeadField, string>>;

/** Applies the header mapping to every data row. */
export function toLeadRows(parsed: ParsedCsv): LeadRow[] {
  const mapping = mapHeaders(parsed.headers);
  return parsed.rows.map((cells) => {
    const lead: LeadRow = {};
    mapping.forEach((field, index) => {
      const value = cells[index]?.trim();
      if (value) lead[field] = value;
    });
    return lead;
  });
}
