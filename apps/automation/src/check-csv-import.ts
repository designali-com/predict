import { parseCsv, mapHeaders, toLeadRows } from "./lib/parse-csv"
import { normalizePhone } from "./lib/normalize-phone"

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  const ok = a === e
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`)
  if (!ok) console.log(`      expected ${e}\n      actual   ${a}`)
}

// A name containing a comma is the case a naive split() gets wrong.
const quoted = parseCsv('Name,Phone\n"Sharma, Anita",9876543210\n')
check("quoted comma keeps one field", quoted.rows[0], ["Sharma, Anita", "9876543210"])

// Excel writes a BOM; it must not become part of the first header.
const bom = parseCsv('﻿Name,Phone\nRavi,9876543210\n')
check("BOM stripped from header", bom.headers, ["Name", "Phone"])

// CRLF endings and a blank separator line.
const crlf = parseCsv('Name,Phone\r\nRavi,9876543210\r\n\r\nMeera,9812345678\r\n')
check("CRLF + blank line", crlf.rows.length, 2)

// Escaped quotes inside a quoted field.
const escaped = parseCsv('Name,Phone\n"Ravi ""Bunty"" K",9876543210\n')
check("doubled quote unescaped", escaped.rows[0]?.[0], 'Ravi "Bunty" K')

// Header aliases, case and punctuation insensitive.
check(
  "header aliases",
  [...mapHeaders(["Full Name", "Mobile Number", "E-Mail", "Nonsense"]).entries()],
  [[0, "name"], [1, "phone"], [2, "email"]],
)

// A duplicate phone column must not overwrite the first one.
const dupe = mapHeaders(["Phone", "Mobile"])
check("duplicate column claimed once", [...dupe.entries()], [[0, "phone"]])

// End-to-end row mapping with an unmapped extra column present.
const mapped = toLeadRows(parseCsv('Name,Phone,Notes\nRavi,98765 43210,ignore me\n'))
check("row mapping ignores extra columns", mapped[0], { name: "Ravi", phone: "98765 43210" })

// Phone shapes the importer has to survive.
check("10-digit gets country code", normalizePhone("98765 43210").phone, "919876543210")
check("trunk prefix stripped", normalizePhone("098765 43210").phone, "919876543210")
check("already E.164 kept", normalizePhone("+91 98765 43210").phone, "919876543210")
check("too short rejected", normalizePhone("12345").ok, false)

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
