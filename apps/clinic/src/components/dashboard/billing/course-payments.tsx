"use client"

import { useCallback, useEffect, useState } from "react"
import { Package } from "lucide-react"
import { RecordSection } from "@/src/components/dashboard/patients/record-ui"
import { useMe } from "@/src/lib/use-me"
import { PlanPayment } from "./plan-payment"
import { duesChanged } from "./patient-dues"

interface CourseRow {
  enrollment: { id: string; planName: string; status: string; isPerSession?: boolean }
}

/**
 * Money on the patient's courses, where the desk takes money: the visit's
 * Billing tab. The same payment box as on the course itself, one per course
 * that is prescribed or running — so a course started without its advance, or
 * part paid, is in front of whoever is collecting, not only on Treatment.
 */
export function CoursePayments({ contactId, onChanged }: { contactId: string; onChanged?: () => void }) {
  const me = useMe()
  const canCollect = me?.permissions.includes("clinic.billing") ?? false
  const [courses, setCourses] = useState<CourseRow[]>([])

  const load = useCallback(async () => {
    const res = await fetch(`/api/staff/enrollments?contactId=${contactId}`)
    const data = await res.json().catch(() => null)
    setCourses(
      ((data?.enrollments ?? []) as CourseRow[]).filter(
        (c) => !c.enrollment.isPerSession && (c.enrollment.status === "active" || c.enrollment.status === "prescribed"),
      ),
    )
  }, [contactId])

  useEffect(() => {
    void load()
  }, [load])

  if (!canCollect || courses.length === 0) return null

  return (
    <>
      {courses.map((c) => (
        <RecordSection key={c.enrollment.id} title={c.enrollment.planName} icon={Package}>
          <PlanPayment
            enrollmentId={c.enrollment.id}
            contactId={contactId}
            status={c.enrollment.status}
            onChanged={() => {
              void load()
              duesChanged()
              onChanged?.()
            }}
          />
        </RecordSection>
      ))}
    </>
  )
}

/** Said, rather than an empty tab, to somebody who cannot take money. */
export function BillingAccessNote() {
  const me = useMe()
  if (!me || me.permissions.includes("clinic.billing")) return null
  return (
    <p className="rounded-md border border-black/10 px-3 py-2.5 text-sm text-black/60 dark:border-white/10 dark:text-white/45">
      Fees and course payments are collected by the front desk or an admin — your account does not take payments.
    </p>
  )
}
