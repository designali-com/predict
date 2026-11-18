"use client"

import { Button } from "@workspace/ui/components/button"

import { Printer, TriangleAlert } from "lucide-react"
import Link from "next/link"
import { amountInWords, rupees } from "@workspace/db/receipt"

interface ReceiptLine {
  label: string
  detail: string | null
  amountInPaise: number
}

interface Receipt {
  receiptNo: string
  collectedAt: string
  voidedAt: string | null
  voidReason: string | null
  clinic: {
    name: string
    legalName: string | null
    addressLine1: string | null
    addressLine2: string | null
    city: string | null
    state: string | null
    pincode: string | null
    phone: string | null
    email: string | null
    website: string | null
    gstin: string | null
    registrationNo: string | null
    footerNote: string | null
    logoUrl?: string | null
    iconUrl?: string | null
  }
  missing: string[]
  patient: {
    name: string
    phone: string | null
    email: string | null
    patientCode: string | null
    contactId: string
  }
  lines: ReceiptLine[]
  amountInPaise: number
  methodLabel: string
  reference: string | null
  note: string | null
  kindLabel: string
  collectedBy: string | null
  visitAt: string | null
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    timeZone: "Asia/Calcutta",
    dateStyle: "medium",
    timeStyle: "short",
  })
}

/**
 * The receipt itself.
 *
 * Printing is the browser's own dialog rather than a generated PDF: it is the
 * one route that reaches every printer the clinic owns, gives "Save as PDF"
 * for free on every platform, and keeps the text selectable and searchable
 * instead of flattening the amount into an image.
 *
 * Everything the desk needs on screen is marked no-print, so what comes out of
 * the printer is the receipt and nothing else.
 */
export function ReceiptView({ receipt: r }: { receipt: Receipt }) {
  const address = [
    r.clinic.addressLine1,
    r.clinic.addressLine2,
    [r.clinic.city, r.clinic.state].filter(Boolean).join(", "),
    r.clinic.pincode,
  ]
    .filter(Boolean)
    .join(", ")

  const contactLine = [
    r.clinic.phone && `Ph ${r.clinic.phone}`,
    r.clinic.email,
    r.clinic.website,
  ]
    .filter(Boolean)
    .join("  ·  ")

  return (
    <div className="min-h-screen bg-black/[0.04] py-6 print:bg-white print:py-0">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 14mm; }
          html, body { background: #fff !important; }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3 px-4">
        <Button variant="default" size="default"
 onClick={() => window.print()}

 >
          <Printer className="h-4 w-4" />
          Print / Save as PDF
        </Button>
      </div>

      {/* Only on screen: a receipt that already printed with a blank address
          cannot be fixed, so this is said before it is handed over. */}
      {r.missing.length > 0 && (
        <div className="no-print mx-auto mb-4 flex max-w-[210mm] items-start gap-2 rounded-md border border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The clinic&apos;s {r.missing.join(", ")} {r.missing.length === 1 ? "is" : "are"} not
            filled in, so {r.missing.length === 1 ? "it will" : "they will"} print blank. Add{" "}
            {r.missing.length === 1 ? "it" : "them"} under{" "}
            <Link href="/settings" className="font-semibold underline">
              Settings → Clinic details
            </Link>
            .
          </span>
        </div>
      )}

      <div className="mx-auto max-w-[210mm] bg-white p-8 text-black shadow-sm print:p-0 print:shadow-none">
        {/* Header — who took the money */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-black pb-4">
          <div>
            {/* The round mark beside the name, the way the clinic signs its sheets. */}
            <div className="flex items-center gap-3">
              {(r.clinic.iconUrl || r.clinic.logoUrl) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={(r.clinic.iconUrl || r.clinic.logoUrl)!} alt="" className="h-11 w-11 shrink-0 object-contain" />
              )}
              <h1 className="text-2xl font-bold tracking-tight">{r.clinic.name}</h1>
            </div>
            {r.clinic.legalName && r.clinic.legalName !== r.clinic.name && (
              <p className="text-sm text-black/70">{r.clinic.legalName}</p>
            )}
            {address && <p className="mt-1 max-w-md text-xs leading-relaxed text-black/70">{address}</p>}
            {contactLine && <p className="mt-0.5 text-xs text-black/70">{contactLine}</p>}
            {/* Printed only when set — an empty tax field on a bill invites the
                question of whether it was forgotten. */}
            {(r.clinic.gstin || r.clinic.registrationNo) && (
              <p className="mt-1 text-xs text-black/70">
                {r.clinic.gstin && `GSTIN: ${r.clinic.gstin}`}
                {r.clinic.gstin && r.clinic.registrationNo && "  ·  "}
                {r.clinic.registrationNo && `Reg. No: ${r.clinic.registrationNo}`}
              </p>
            )}
          </div>

          <div className="text-right">
            <p className="text-[11px] font-semibold tracking-widest text-black/60 uppercase">
              Receipt
            </p>
            <p className="mt-0.5 font-mono text-base font-bold">{r.receiptNo}</p>
            <p className="mt-1 text-xs text-black/70">{when(r.collectedAt)}</p>
          </div>
        </div>

        {/* A voided receipt still prints, and says so across the top. It exists
            because somebody was handed one; hiding it does not take it back. */}
        {r.voidedAt && (
          <div className="mt-4 border-2 border-red-600 px-4 py-2 text-center">
            <p className="text-lg font-bold tracking-widest text-red-700 uppercase">Cancelled</p>
            <p className="text-xs text-red-700">
              {r.voidReason ? `${r.voidReason} · ` : ""}
              {when(r.voidedAt)}
            </p>
          </div>
        )}

        {/* Who paid */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-black/60 uppercase">
              Received from
            </p>
            <p className="mt-1 text-base font-semibold">{r.patient.name}</p>
            {r.patient.patientCode && (
              <p className="text-xs text-black/70">Patient ID: {r.patient.patientCode}</p>
            )}
            {r.patient.phone && <p className="text-xs text-black/70">{r.patient.phone}</p>}
            {r.patient.email && <p className="text-xs text-black/70">{r.patient.email}</p>}
          </div>
          <div className="sm:text-right">
            <p className="text-[11px] font-semibold tracking-widest text-black/60 uppercase">
              Towards
            </p>
            <p className="mt-1 text-base font-semibold">{r.kindLabel}</p>
            {r.visitAt && <p className="text-xs text-black/70">Visit: {when(r.visitAt)}</p>}
          </div>
        </div>

        {/* What it was for */}
        <table className="mt-5 w-full border-collapse text-sm">
          <thead>
            <tr className="border-y border-black/25 text-left text-[11px] tracking-widest text-black/60 uppercase">
              <th className="py-2 font-semibold">Particulars</th>
              <th className="py-2 text-right font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {r.lines.map((line, i) => (
              <tr key={i} className="border-b border-black/12">
                <td className="py-2.5">
                  <span className="font-medium">{line.label}</span>
                  {line.detail && (
                    <span className="block text-xs text-black/65">{line.detail}</span>
                  )}
                </td>
                <td className="py-2.5 text-right tabular-nums">{rupees(line.amountInPaise)}</td>
              </tr>
            ))}
            <tr className="border-b-2 border-black">
              <td className="py-2.5 text-right text-sm font-bold">Total received</td>
              <td className="py-2.5 text-right text-base font-bold tabular-nums">
                {rupees(r.amountInPaise)}
              </td>
            </tr>
          </tbody>
        </table>

        {/* E&OE — errors and omissions excepted. It sits under the figures
            because that is what it qualifies: the clinic is not bound by an
            arithmetic slip on the slip itself. Standard on an Indian bill, and
            its absence is what a bookkeeper notices. */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          {/* The words are here so the figure cannot be altered afterwards. */}
          <p className="mt-3 text-sm">
            <span className="text-black/60">In words: </span>
            <span className="font-medium italic">{amountInWords(r.amountInPaise)}</span>
          </p>
          <p className="mt-3 shrink-0 text-xs font-semibold tracking-wide text-black/70">E&amp;OE</p>
        </div>

        <div className="mt-4 grid gap-1 text-xs text-black/75">
          <p>
            <span className="text-black/60">Paid by: </span>
            {r.methodLabel}
            {r.reference && ` · Ref ${r.reference}`}
          </p>
          {r.note && (
            <p>
              <span className="text-black/60">Note: </span>
              {r.note}
            </p>
          )}
        </div>

        <div className="mt-10 flex items-end justify-between gap-6">
          <div className="max-w-sm text-[11px] leading-relaxed text-black/60">
            {r.clinic.footerNote ? (
              <p>{r.clinic.footerNote}</p>
            ) : (
              <p>This is a computer-generated receipt for the amount stated above.</p>
            )}
          </div>
          <div className="text-center">
            <div className="h-12 w-48 border-b border-black/40" />
            {/* Signed for the clinic, not by whoever was at the desk — who took it stays in the records. */}
            <p className="mt-1 text-[11px] text-black/70">For {r.clinic.name}</p>
            <p className="text-[11px] font-medium text-black/80">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  )
}
