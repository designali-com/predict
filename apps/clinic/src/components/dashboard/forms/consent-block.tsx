"use client"

import { Button } from "@workspace/ui/components/button"

import { useEffect, useRef, useState } from "react"
import SignatureCanvas from "react-signature-canvas"
import { Check, PenLine, RotateCcw, X } from "lucide-react"

export interface Consent {
  text: string
  given: boolean
  /** A PNG data URL from the pad. */
  signatureDataUrl: string | null
  signedName: string | null
  signedAt: string | null
  /** The date written on the consent, YYYY-MM-DD. */
  signedOn?: string | null
}

const INPUT =
  "w-full rounded-md border border-border bg-background px-2.5 py-2 text-sm focus:border-ring focus:outline-none"

const LABEL =
  "mb-1 block text-[11px] font-semibold tracking-widest text-muted-foreground uppercase"

/** Today in the clinic's own zone, so it does not flip at 5:30am. */
function today(): string {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/**
 * Consent and a signature, at the foot of every form.
 *
 * The paper forms end this way and the screen did not, so a submitted form
 * recorded what was asked and not that anybody agreed to it. A consent that
 * exists only because somebody remembers taking it is not one that can be
 * produced later.
 *
 * The wording is the clinic's, not this file's — a form with printed wording of
 * its own uses that, everything else uses the clinic-wide text, and whichever
 * was on screen is copied onto the submission. Rewording it next year must not
 * rewrite what people signed last year.
 */
export function ConsentBlock({
  value,
  onChange,
  readOnly,
}: {
  value: Consent
  onChange: (consent: Consent) => void
  readOnly: boolean
}) {
  const [padOpen, setPadOpen] = useState(false)

  // The date is prefilled rather than asked. It is today unless somebody says
  // otherwise, and typing today's date into every consent is work nobody needs.
  const signedOn = value.signedOn ?? value.signedAt?.slice(0, 10) ?? today()

  useEffect(() => {
    if (!value.signedOn) onChange({ ...value, signedOn })
    // Runs once to seed the date; re-running on every change would fight the
    // person editing it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (readOnly) {
    if (!value.signatureDataUrl) return null
    return (
      <section className="rounded-md border border-border p-4">
        <h3 className="mb-2 text-sm font-semibold">Consent</h3>
        <p className="mb-3 text-xs whitespace-pre-wrap text-muted-foreground">{value.text}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={value.signatureDataUrl}
          alt="Signature"
          className="h-24 rounded-md border border-border bg-white object-contain p-1"
        />
        <p className="mt-2 text-xs text-muted-foreground">
          {[
            value.signedName,
            value.signedAt &&
              new Date(value.signedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </section>
    )
  }

  return (
    <section className="rounded-md border border-border p-4">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <PenLine className="h-4 w-4" />
        Consent
      </h3>

      <p className="mt-2 text-xs whitespace-pre-wrap text-muted-foreground">{value.text}</p>

      <label className="mt-3 flex items-start gap-2">
        <input
          type="checkbox"
          checked={value.given}
          onChange={(e) => onChange({ ...value, given: e.target.checked })}
          className="mt-0.5"
        />
        <span className="text-sm">Read to the patient, and they agree.</span>
      </label>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label>
          <span className={LABEL}>Signed by</span>
          <input
            value={value.signedName ?? ""}
            onChange={(e) => onChange({ ...value, signedName: e.target.value })}
            placeholder="Patient, or who signed for them"
            className={INPUT}
          />
        </label>

        <label>
          <span className={LABEL}>Date</span>
          <input
            type="date"
            value={signedOn}
            onChange={(e) => onChange({ ...value, signedOn: e.target.value })}
            className={INPUT}
          />
        </label>

        <div>
          <span className={LABEL}>Signature</span>
          {value.signatureDataUrl ? (
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={value.signatureDataUrl}
                alt="Signature"
                className="h-10 flex-1 rounded-md border border-border bg-white object-contain p-0.5"
              />
              <Button variant="outline" size="sm"
 type="button"
 onClick={() => setPadOpen(true)}

 >
                Redo
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="default" className="w-full"
 type="button"
 onClick={() => setPadOpen(true)}
 // The pad is only worth opening once they have agreed — signing
 // is the act of agreeing, and the order on paper is the same.
 disabled={!value.given}
 title={value.given ? undefined : "Tick the consent first"}

 >
              <PenLine className="h-3.5 w-3.5" />
              Take signature
            </Button>
          )}
        </div>
      </div>

      {padOpen && (
        <SignaturePad
          name={value.signedName}
          onCancel={() => setPadOpen(false)}
          onConfirm={(dataUrl) => {
            onChange({ ...value, signatureDataUrl: dataUrl })
            setPadOpen(false)
          }}
        />
      )}
    </section>
  )
}

/**
 * The pad, on its own.
 *
 * Full screen and white, because this is the one moment the screen is turned
 * around and handed to the patient — and a signature strip wedged between two
 * form fields is not something anybody can sign on a tablet. Nothing is written
 * back to the form until Confirm, so an abandoned attempt leaves no mark.
 */
export function SignaturePad({
  name,
  onCancel,
  onConfirm,
}: {
  name: string | null
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}) {
  const pad = useRef<SignatureCanvas | null>(null)
  const box = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [empty, setEmpty] = useState(true)

  // The canvas is sized in real pixels, so it has to be measured after layout
  // or a signature comes out stretched.
  useEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel()
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onCancel])

  const reset = () => {
    pad.current?.clear()
    setEmpty(true)
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white p-4 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-black">Please sign below</h2>
          <p className="text-xs text-neutral-600">
            {name ? `Signing as ${name}` : "Sign inside the box"}
          </p>
        </div>
        <Button variant="outline" size="default" className="border-neutral-300 text-neutral-600 hover:text-black"
 type="button"
 onClick={onCancel}
 aria-label="Close without signing"

 >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div
        ref={box}
        className="mt-4 min-h-0 flex-1 overflow-hidden rounded-md border-2 border-dashed border-neutral-300 bg-white"
      >
        {size && (
          <SignatureCanvas
            ref={pad}
            penColor="#111111"
            onEnd={() => setEmpty(pad.current?.isEmpty() ?? true)}
            canvasProps={{
              width: size.w,
              height: size.h,
              // Touch scrolling has to be off or a finger drags the page
              // instead of drawing on it.
              style: { touchAction: "none", display: "block" },
            }}
          />
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="simple" size="lg"
 type="button"
 onClick={() => {
 const canvas = pad.current
 if (!canvas || canvas.isEmpty()) return
 onConfirm(canvas.toDataURL("image/png"))
 }}
 disabled={empty}

 >
          <Check className="h-4 w-4" />
          Confirm
        </Button>
        <Button variant="outline" size="lg" className="border-neutral-300 text-neutral-700 hover:bg-neutral-50"
 type="button"
 onClick={reset}

 >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </Button>
        {empty && <span className="text-xs text-neutral-500">Nothing drawn yet.</span>}
      </div>
    </div>
  )
}
