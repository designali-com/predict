"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ExternalLink, MessageCircle, Phone } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@workspace/ui/components/sheet"
import { leadStatusMeta } from "@workspace/db/lead-status"
import { sideForStage } from "@workspace/db/contact-side"
import { PredictSpinner } from "@/src/components/predict-loader"
import { OverviewTab } from "@/src/components/contact-360/overview-tab"
import { LeadForms, type LeadForm } from "@/src/components/contact-360/lead-forms"
import { LeadWork } from "@/src/components/contact-360/lead-work"
import { StatusControl } from "@/src/components/contact-360/status-control"

interface Contact {
  id: string
  name: string | null
  phone: string | null
  email: string | null
  stage: string
  engagement: string | null
  source: string | null
  campaign: string | null
  leadStatus: string | null
  leadStatusAt: string | null
  callbackAt: string | null
  interest: string | null
  city: string | null
  assignedUserId: string | null
  assignedUserName: string | null
  assignedRole: string | null
}

/**
 * The contact's profile beside the chat it was opened from. Going to the full
 * profile page lost the open thread; this keeps both on screen, with what a
 * caller acts on (lead status, follow-up, stage) and the overview. The full
 * page is one link away for the medical and therapy tabs.
 */
export function ContactProfileSheet({
  contactId,
  open,
  onOpenChange,
}: {
  contactId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [contact, setContact] = useState<Contact | null>(null)
  const [leadForms, setLeadForms] = useState<LeadForm[]>([])
  const [canReassign, setCanReassign] = useState(false)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}`)
    const d = await res.json().catch(() => null)
    setFailed(!res.ok || !d?.contact)
    setContact(d?.contact ?? null)
    setLeadForms(d?.leadForms ?? [])
    setCanReassign(!!d?.canReassign)
  }, [contactId])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    load().finally(() => setLoading(false))
  }, [open, load])

  const name =
    contact?.name?.trim() || (contact?.phone ? formatPhone(contact.phone) : contact?.email) || "Contact"
  const isLead = !!contact && sideForStage(contact.stage) === "leads" && contact.stage !== "AUDIENCE"
  const status = isLead ? leadStatusMeta(contact!.leadStatus) : undefined
  const details = contact
    ? [contact.city, [contact.source, contact.campaign].filter(Boolean).join(" · ") || null].filter(Boolean)
    : []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        // The chat stays readable behind the profile: a light dim, no blur.
        overlayClassName="bg-black/20 supports-backdrop-filter:backdrop-blur-none"
        className="w-full gap-0 overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <div className="border-b border-border p-4 pe-12">
          <SheetTitle className="truncate text-lg font-semibold">{name}</SheetTitle>
          <SheetDescription className="sr-only">Contact profile</SheetDescription>
          {contact && (
            <>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                  {contact.stage}
                </span>
                {status && (
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${status.tone}`}>{status.label}</span>
                )}
                {contact.engagement === "DO_NOT_CONTACT" && (
                  <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[11px] font-medium text-red-600 dark:text-red-400">
                    Do not contact
                  </span>
                )}
              </div>
              {contact.phone && (
                <p className="mt-2 flex items-center gap-1.5 text-sm tabular-nums">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  {formatPhone(contact.phone)}
                </p>
              )}
              {details.length > 0 && <p className="mt-1 text-xs text-muted-foreground">{details.join(" · ")}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {contact.phone && (
                  <>
                    <Button size="sm" nativeButton={false} render={<a href={`tel:+${contact.phone}`} />}>
                      <Phone /> Call
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      nativeButton={false}
                      render={<a href={`https://wa.me/${contact.phone}`} target="_blank" rel="noreferrer" />}
                    >
                      <MessageCircle /> WhatsApp
                    </Button>
                  </>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  nativeButton={false}
                  render={<Link href={`/contacts/${contactId}`} />}
                >
                  <ExternalLink /> Full profile
                </Button>
              </div>
            </>
          )}
        </div>

        {loading && !contact ? (
          <div className="flex flex-1 items-center justify-center p-10">
            <PredictSpinner />
          </div>
        ) : failed || !contact ? (
          <p className="p-4 text-sm text-muted-foreground">This profile could not be loaded.</p>
        ) : (
          <div className="space-y-4 p-4">
            {isLead && (
              <LeadWork
                contactId={contactId}
                leadStatus={contact.leadStatus}
                leadStatusAt={contact.leadStatusAt}
                callbackAt={contact.callbackAt}
                interest={contact.interest}
                city={contact.city}
                assignedUserId={contact.assignedUserId}
                assignedUserName={contact.assignedUserName}
                assignedRole={contact.assignedRole}
                canReassign={canReassign}
                onChanged={load}
              />
            )}
            <StatusControl contactId={contactId} stage={contact.stage} engagement={contact.engagement} onChanged={load} />
            <LeadForms forms={leadForms} />
            <OverviewTab contactId={contactId} />
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** 918530355551 → +91 85303 55551. */
function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "")
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`
  return `+${d}`
}
