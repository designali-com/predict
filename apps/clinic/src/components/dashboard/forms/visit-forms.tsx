"use client"

import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useCallback, useEffect, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import { Check, ChevronDown, ClipboardList, FileText, Lock, Pencil } from "lucide-react"
import {
  CLINICAL_FORMS,
  isFormReady,
  type FormDefinition,
  type FormOwner,
} from "@workspace/db/clinical-forms"
import { useMe } from "@/src/lib/use-me"
import { FormRenderer } from "./form-renderer"
import type { Consent } from "./consent-block"

/**
 * Unsaved answers, kept while the tab is open.
 *
 * Switching from a half-filled form to look at another one used to throw
 * away everything typed — the panel fetches from the server on open, and the
 * server has never heard of an unsaved answer.
 *
 * sessionStorage, not localStorage: this is half-entered clinical data on a
 * shared machine at a reception desk. It should survive a click across the
 * page and not survive the browser being closed.
 */
interface Stash {
  answers: Answers
  consent: Consent | null
}

interface Submission {
  formKey: string
  status: string
  submittedAt: string | null
}

type Answers = Record<string, unknown>

const OWNER_LABEL: Record<FormOwner, string> = {
  receptionist: "Front desk",
  doctor: "Doctor",
  nutritionist: "Nutritionist",
}

/**
 * The clinic's paper forms, on the visit they belong to.
 *
 * Everything the front desk started at the booking counter carries over as a
 * draft, so FORM-I opens part-filled rather than blank — the questions asked
 * there are asked once. The rest of page 1 (referral, chief complaint, where it
 * hurts) lives here because it is a conversation, not counter work.
 *
 * A doctor has four documents and two hundred questions between them, so those
 * are grouped and listed. The front desk has exactly one — and a list of one,
 * under a heading, inside a card, is three layers of furniture around a single
 * button. So one form renders as that button.
 */
function patientLabel(name: string | null | undefined): string | null {
  const trimmed = name?.trim()
  if (!trimmed || trimmed === "—") return null
  return trimmed
}

/** A blank "Signed by" is the patient. A name already written stays as it is. */
function withPatientName(consent: Consent | null, name: string | null): Consent | null {
  if (!name) return consent
  if (!consent) {
    return {
      text: "",
      given: false,
      signatureDataUrl: null,
      signedName: name,
      signedAt: null,
      signedOn: null,
    }
  }
  if (consent.signedName?.trim()) return consent
  return { ...consent, signedName: name }
}

export function VisitForms({
  appointmentId,
  contactId,
  patientName,
  onChanged,
  formKey: onlyFormKey,
}: {
  /**
   * The visit these answers belong to. Null for the patient's own copy of a
   * form — asked once and kept, not per visit (the Nutrition tab).
   */
  appointmentId: string | null
  contactId: string
  /** Prefilled into Signed by on every form when that box is still empty. */
  patientName?: string | null
  onChanged?: () => void
  /** Render this one form, already open. Each form is its own tab on the visit. */
  formKey?: string
}) {
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Answers>({})
  const [loading, setLoading] = useState(true)
  const [opening, setOpening] = useState(false)
  // A submitted form opens as a read-back. Editing is switched on from the
  // row that opened it, so it is held here rather than inside the renderer.
  const [editing, setEditing] = useState(false)
  const [consent, setConsent] = useState<Consent | null>(null)
  const [restored, setRestored] = useState(false)
  const me = useMe()

  // Keyed by visit as well as form: the same form on two visits is two
  // different sets of answers.
  const stashKey = useCallback(
    (formKey: string) => `optm.form-draft.${appointmentId ?? `patient-${contactId}`}.${formKey}`,
    [appointmentId, contactId],
  )

  // Every one of these is wrapped: sessionStorage throws outright in some
  // privacy modes, and losing a stash must never take the form down with it.
  const readStash = useCallback(
    (formKey: string): Stash | null => {
      try {
        const raw = sessionStorage.getItem(stashKey(formKey))
        return raw ? (JSON.parse(raw) as Stash) : null
      } catch {
        return null
      }
    },
    [stashKey],
  )

  const writeStash = useCallback(
    (formKey: string, stash: Stash) => {
      try {
        sessionStorage.setItem(stashKey(formKey), JSON.stringify(stash))
      } catch {
        // Out of quota or blocked. The form still works; only the safety net
        // is gone, and saying so on every keystroke would be worse.
      }
    },
    [stashKey],
  )

  const clearStash = useCallback(
    (formKey: string) => {
      try {
        sessionStorage.removeItem(stashKey(formKey))
      } catch {
        /* nothing to do */
      }
    },
    [stashKey],
  )

  const load = useCallback(async () => {
    if (!appointmentId) {
      // The patient's own copy: only this one form's state.
      if (!onlyFormKey) return setSubmissions([])
      const res = await fetch(`/api/staff/forms?formKey=${onlyFormKey}&contactId=${contactId}`)
      const data = await res.json().catch(() => null)
      const sub = data?.submission
      setSubmissions(
        sub ? [{ formKey: onlyFormKey, status: sub.status, submittedAt: sub.submittedAt ?? null }] : [],
      )
      return
    }
    const res = await fetch(`/api/staff/appointments/${appointmentId}`)
    const data = await res.json().catch(() => null)
    setSubmissions(data?.forms ?? [])
  }, [appointmentId, contactId, onlyFormKey])

  useEffect(() => {
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [load])

  // ?form=<key> opens that form straight away, so a queue row that says
  // "fill the form" lands on the form rather than on the page it lives in.
  // Once only: re-opening it every render would fight anybody who closed it.
  const params = useSearchParams()
  const wanted = params.get("form")
  const jumped = useRef(false)

  useEffect(() => {
    if (jumped.current || !wanted) return
    const form = CLINICAL_FORMS.find((f) => f.key === wanted)
    if (!form || !isFormReady(form)) return
    jumped.current = true
    // A link that says "fill the form" means fill it: open straight into the boxes.
    void open(form).then(() => setEditing(true))
    // open is stable enough for this one-shot; adding it would re-run on every
    // answer typed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted])

  const toggle = async (form: FormDefinition) => {
    setEditing(false)
    if (openKey === form.key) {
      setOpenKey(null)
      return
    }
    await open(form)
    // From the list, Complete / Continue are a request to fill it in; View
    // (already submitted) opens the read-back.
    setEditing(submissions.find((s) => s.formKey === form.key)?.status !== "submitted")
  }

  const open = async (form: FormDefinition) => {
    setOpening(true)
    try {
      const res = await fetch(
        // contactId always: a visit's empty nutrition form starts from the
        // patient's last answers (see CARRY_FORWARD in form-service).
        `/api/staff/forms?formKey=${form.key}&contactId=${contactId}${appointmentId ? `&appointmentId=${appointmentId}` : ""}`,
      )
      const data = await res.json().catch(() => null)
      // What was typed and not saved wins over what the server last heard.
      const stash = readStash(form.key)
      setAnswers(stash?.answers ?? data?.answers ?? {})
      setConsent(withPatientName(stash?.consent ?? data?.consent ?? null, patientLabel(patientName)))
      setRestored(Boolean(stash))
      setOpenKey(form.key)
    } finally {
      setOpening(false)
    }
  }

  // A tab hands us one form. Open it once; switching tabs remounts this panel.
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!onlyFormKey || openedFor.current === onlyFormKey) return
    const form = CLINICAL_FORMS.find((f) => f.key === onlyFormKey)
    if (!form || !isFormReady(form)) return
    openedFor.current = onlyFormKey
    void open(form)
    // open reads the latest stash helpers; listing it would reopen on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyFormKey])

  const post = async (values: Answers, submit: boolean): Promise<string | null> => {
    const res = await fetch("/api/staff/forms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      // The consent travels with the answers, in one request. Saved apart,
      // a signature could land on a submission whose answers never did.
      body: JSON.stringify({
        contactId,
        appointmentId,
        formKey: openKey,
        answers: values,
        consent,
        submit,
      }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok) return data?.error ?? "Could not save this form"

    if (openKey) clearStash(openKey)
    setRestored(false)

    await load()
    // Submitting a form can move the visit on — the header above shows the
    // stage, so the page around this has to hear about it.
    if (submit) {
      setEditing(false)
      if (onlyFormKey) {
        // One form on its own tab: show what was just saved, read back from
        // the server. Closing it here left the tab waiting for a form that
        // nothing would reopen — the spinner turned for good.
        const form = CLINICAL_FORMS.find((f) => f.key === onlyFormKey)
        if (form) await open(form)
      } else {
        // In the list it closes. A submitted form left open reads as still
        // being filled in, and the useful thing to see next is what the visit
        // moved on to, not the page that moved it.
        setOpenKey(null)
      }
      onChanged?.()
    }
    return null
  }

  if (loading) {
    return (
      <div className="flex justify-center rounded-md border border-black/18 py-8 dark:border-white/10">
        <PredictSpinner className="size-5" />
      </div>
    )
  }

  const openForm = openKey ? CLINICAL_FORMS.find((f) => f.key === openKey) : null

  // The form itself, rendered where it was opened from rather than on a
  // screen of its own.
  // Throw away what was kept and take the server's copy again.
  const discardStash = async () => {
    if (!openForm) return
    clearStash(openForm.key)
    setRestored(false)
    await open(openForm)
  }

  const body = openForm ? (
    <>
      {/* Said out loud. Answers appearing that nobody typed on this screen is
          alarming unless the screen explains itself. */}
      {restored && (
        <p className="mb-3 flex flex-wrap items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-200">
          <span>Unsaved answers from earlier were put back.</span>
          <Button variant="link" size="default" className="underline" onClick={discardStash} >
            Discard them
          </Button>
        </p>
      )}
    <FormRenderer
      definition={openForm}
      initialAnswers={answers}
      submitted={submissions.find((s) => s.formKey === openForm.key)?.status === "submitted"}
      onSave={(values) => post(values, false)}
      onSubmit={(values) => post(values, true)}
      editing={editing}
      onEditingChange={setEditing}
      // One form on its own tab already has its title and status in the card header.
      hideTitle={Boolean(onlyFormKey)}
      onAnswersChange={(next) => {
        setAnswers(next)
        if (openForm) writeStash(openForm.key, { answers: next, consent })
      }}
      consent={
        consent ?? {
          text: "",
          given: false,
          signatureDataUrl: null,
          signedName: patientLabel(patientName),
          signedAt: null,
          signedOn: null,
        }
      }
      onConsentChange={(next) => {
        setConsent(next)
        if (openForm) writeStash(openForm.key, { answers, consent: next })
      }}
    />
    </>
  ) : null

  const statusOf = (form: FormDefinition) => {
    const submission = submissions.find((s) => s.formKey === form.key)
    if (!isFormReady(form)) return { ready: false, done: false, label: "Waiting on the clinic's document" }
    if (submission?.status === "submitted") {
      return {
        ready: true,
        done: true as const,
        verb: "View",
        label: submission.submittedAt
          ? `Submitted ${new Date(submission.submittedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
          : "Submitted",
      }
    }
    if (submission) return { ready: true, done: false, verb: "Continue", label: "Draft saved — not submitted" }
    return { ready: true, done: false, verb: "Complete", label: "Not started" }
  }

  // One form, already chosen by the tab around this. No list of the others.
  if (onlyFormKey) {
    const form = CLINICAL_FORMS.find((f) => f.key === onlyFormKey) ?? null
    if (!form || !isFormReady(form)) {
      return (
        <p className="rounded-md border border-black/18 p-4 text-sm text-black/60 dark:border-white/10 dark:text-white/40">
          This form is not ready yet.
        </p>
      )
    }
    if (loading || opening || openKey !== onlyFormKey) {
      return (
        <div className="flex justify-center rounded-md border border-black/18 py-12 dark:border-white/10">
          <PredictSpinner className="size-5" />
        </div>
      )
    }
    const state = statusOf(form)
    return (
      <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">{form.title}</p>
            <p className="mt-0.5 text-xs text-black/60 dark:text-white/45">{state.label}</p>
          </div>
          {/* Read-back first, boxes on request — for a draft or an empty form
              too, not only a submitted one. */}
          {!editing && (
            <Button variant={state.done ? "outline" : "default"} size="sm"
 onClick={() => setEditing(true)}

 >
              {state.done ? "Edit" : submissions.some((s) => s.formKey === form.key) ? "Continue" : "Fill in"}
            </Button>
          )}
        </div>
        {body}
      </div>
    )
  }

  // Only the forms this account fills in. A receptionist was being shown
  // FORM-II, FORM-III and the provisional diagnosis, which are not hers to
  // fill and which the server would refuse anyway.
  const mine = new Set(me?.formOwners ?? [])
  const byOwner = (["receptionist", "doctor", "nutritionist"] as FormOwner[])
    .filter((owner) => mine.has(owner))
    .map((owner) => ({
      owner,
      forms: CLINICAL_FORMS.filter((f) => f.owner === owner),
    }))

  // Exactly one form to fill: it is a button, and it says what it does.
  const only = byOwner.length === 1 && byOwner[0]!.forms.length === 1 ? byOwner[0]!.forms[0]! : null

  if (only) {
    const state = statusOf(only)
    const isOpen = openKey === only.key
    return (
      <div className="rounded-md border border-black/18 bg-white shadow-sm dark:border-white/10 dark:bg-black">
        <div className="flex items-center gap-3 p-4">
        <Button variant="ghost" size="default"
          onClick={() => state.ready && toggle(only)}
          disabled={!state.ready || opening}
          aria-expanded={isOpen}
          className={`h-auto justify-start whitespace-normal text-left flex min-w-0 flex-1 items-center gap-3 text-left transition ${
 state.ready ?"":"cursor-not-allowed opacity-60"
 }`}
        >
          <span className="shrink-0">
            {!state.ready ? (
              <Lock className="h-5 w-5 text-black/30 dark:text-white/30" />
            ) : state.done ? (
              <Check className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            ) : (
              <FileText className="h-5 w-5 text-black/65 dark:text-white/40" />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">
              {state.ready ? `${state.verb} the ${only.title.toLowerCase()} form` : only.title}
            </span>
            <span className="block text-xs text-black/60 dark:text-white/45">{state.label}</span>
          </span>
          {opening ? (
            <PredictSpinner className="size-4" />
          ) : (
            <ChevronDown
              className={`h-4 w-4 shrink-0 text-black/60 transition dark:text-white/40 ${isOpen ? "rotate-180" : ""}`}
            />
          )}
        </Button>

        {isOpen && state.done && !editing && (
            <Button variant="outline" size="default" className="text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
 onClick={() => setEditing(true)}
 aria-label="Edit this form"
 title="Edit"

 >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {isOpen && (
          <div className="border-t border-black/12 p-4 dark:border-white/5">{body}</div>
        )}
      </div>
    )
  }

  return (
    <div className="rounded-md border border-black/18 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-black">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/45">
        <ClipboardList className="h-3.5 w-3.5" />
        Forms
      </div>

      <div className="flex flex-col gap-4">
        {byOwner.map(({ owner, forms }) => (
          <div key={owner}>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-black/65 dark:text-white/35">
              {OWNER_LABEL[owner]}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {forms.map((form) => {
                const submission = submissions.find((s) => s.formKey === form.key)
                const ready = isFormReady(form)
                return (
                  <Button variant="ghost" size="default"
                    key={form.key}
                    onClick={() => ready && toggle(form)}
                    aria-expanded={openKey === form.key}
                    disabled={!ready || opening}
                    className={`h-auto justify-start whitespace-normal text-left flex items-start gap-3 border p-3 text-left transition ${
 ready
 ?"border-black/18 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
 :"cursor-not-allowed border-dashed border-black/18 opacity-60 dark:border-white/10"
 }`}
                  >
                    <span className="mt-0.5 shrink-0">
                      {!ready ? (
                        <Lock className="h-4 w-4 text-black/30 dark:text-white/30" />
                      ) : submission?.status === "submitted" ? (
                        <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <FileText className="h-4 w-4 text-black/65 dark:text-white/40" />
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{form.title}</span>
                      <span className="mt-1 block text-xs text-black/60 dark:text-white/45">
                        {!ready
                          ? "Waiting on the clinic's document"
                          : submission?.status === "submitted"
                            ? "Submitted"
                            : submission
                              ? "Draft saved — not submitted"
                              : "Not started"}
                      </span>
                    </span>
                    <ChevronDown
                      className={`ml-auto h-4 w-4 shrink-0 self-center text-black/60 transition dark:text-white/40 ${
                        openKey === form.key ? "rotate-180" : ""
                      }`}
                    />
                  </Button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Under the list rather than in place of it: which form is open is
          worth keeping on screen next to the three that are not. */}
      {body && (
        <div className="mt-4 border-t border-black/12 pt-4 dark:border-white/5">
          {openForm && statusOf(openForm).done && !editing && (
            <Button variant="outline" size="default" className="float-right text-black/60 hover:text-black dark:text-white/40 dark:hover:text-white"
 onClick={() => setEditing(true)}
 aria-label="Edit this form"
 title="Edit"

 >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          )}
          {body}
        </div>
      )}
    </div>
  )
}
