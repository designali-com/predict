"use client"

import { Button } from "@workspace/ui/components/button"
import { VisitForms } from "@/src/components/dashboard/forms/visit-forms"
import Link from "next/link"
import { useEffect, useState } from "react"
import { RecordEmpty, RecordSegments } from "./record-ui"

interface Visit {
  id: string
  scheduledAt: string
  type: string
  status: string
}

const SECTIONS = [
  { id: "registration_front_desk", label: "Registration" },
  { id: "registration_clinical", label: "History" },
  { id: "questionnaire", label: "Questionnaires" },
  { id: "measurements", label: "Measurements" },
  { id: "provisional_diagnosis", label: "Diagnosis" },
  // Nutrition is not here: it is the patient's, asked once, and lives on the
  // Nutrition tab with the diet plan written from it.
] as const

type SectionId = (typeof SECTIONS)[number]["id"]

function visitWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Calcutta",
  })
}

/**
 * The forms filled on a visit, read back on the patient.
 *
 * Billing, documents, notes and the diet plan already have their own place on
 * this page, so they are not repeated here. The diet plan is the patient's,
 * not one visit's — it has its own tab rather than sitting under every
 * nutrition consult.
 */
export function PatientConsult({
  contactId,
  patientName,
  visits,
  onStartVisit,
  visitId: chosenVisitId,
}: {
  contactId: string
  patientName: string
  visits: Visit[]
  onStartVisit?: () => void
  /**
   * Set when the page chooses the visit (the Visits list above). The picker is
   * then left out — two controls for one choice is one too many.
   */
  visitId?: string
}) {
  const controlled = chosenVisitId !== undefined
  const [ownVisitId, setVisitId] = useState(visits[0]?.id ?? "")
  const visitId = controlled ? chosenVisitId : ownVisitId
  const [section, setSection] = useState<SectionId>("registration_front_desk")

  useEffect(() => {
    if (!controlled && !visits.some((visit) => visit.id === ownVisitId)) {
      setVisitId(visits[0]?.id ?? "")
    }
  }, [visits, ownVisitId, controlled])

  const visit = visits.find((item) => item.id === visitId) ?? null
  const label = SECTIONS.find((item) => item.id === section)?.label

  const form = visit ? (
    <VisitForms
      key={`${visit.id}-${section}`}
      formKey={section}
      appointmentId={visit.id}
      contactId={contactId}
      patientName={patientName}
    />
  ) : (
    <RecordEmpty>{visits.length ? `${label} is not filled.` : "No visit yet — the forms are filled on a visit."}</RecordEmpty>
  )

  return (
    <div className="flex flex-col gap-3">
      {!controlled && <div className="flex flex-wrap items-center gap-2">
        {visits.length > 0 ? (
          <>
            <label className="text-[11px] font-semibold uppercase tracking-widest text-black/55 dark:text-white/40">
              Visit
            </label>
            <select
              value={visitId}
              onChange={(event) => setVisitId(event.target.value)}
              className="h-8 max-w-full rounded-md border border-black/18 bg-white px-2 text-xs dark:border-white/10 dark:bg-black"
            >
              {visits.map((item) => (
                <option key={item.id} value={item.id}>
                  {visitWhen(item.scheduledAt)} · {item.type.replaceAll("_", " ")} · {item.status}
                </option>
              ))}
            </select>
            {visit && (
              <Link href={`/appointments/${visit.id}`} className="text-xs underline">
                Open appointment
              </Link>
            )}
          </>
        ) : (
          <p className="text-sm text-black/60 dark:text-white/40">
            No visit yet. The forms stay here, empty, until one is booked.
          </p>
        )}
        {visits.length === 0 && onStartVisit && (
          <Button type="button" size="sm" variant="default" onClick={onStartVisit}>
            Start a visit
          </Button>
        )}
      </div>}

      <RecordSegments
        segments={SECTIONS.map((item) => ({ key: item.id, label: item.label }))}
        active={section}
        onChange={setSection}
      />

      {form}
    </div>
  )
}
