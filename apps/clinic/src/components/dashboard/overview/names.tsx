import { db } from "@workspace/db/client"
import { contact as contactTable, user as userTable } from "@workspace/db/schema"
import { inArray } from "@workspace/db"
import { displayName } from "@/src/lib/display-name"

/**
 * Appointments and tasks carry a contactId; the name a person actually goes by
 * lives either on the contact or on the user account behind it.
 *
 * Shared because three blocks need the same two-hop lookup, and doing it
 * per-row would be a query per appointment.
 */
async function namesByContactId(contactIds: string[]) {
  const contacts = await db.query.contact.findMany({
    where: inArray(contactTable.id, [...new Set(contactIds)]),
  })

  const userIds = [...new Set(contacts.map((c) => c.userId).filter((v): v is string => !!v))]
  const users = userIds.length
    ? await db.query.user.findMany({ where: inArray(userTable.id, userIds) })
    : []
  const nameByUserId = new Map(users.map((u) => [u.id, u.name]))

  return new Map(
    contacts.map((c) => [
      c.id,
      // One way of writing it, however it was typed — "ANKIT GAUR" shows as "Ankit Gaur".
      displayName((c.userId ? nameByUserId.get(c.userId) : null) ?? c.name ?? "Unknown Patient"),
    ]),
  )
}

type WithContact = { contactId: string }

export async function withPatientNames<T extends WithContact>(rows: T[]) {
  if (!rows.length) return [] as (T & { patientName: string })[]
  const names = await namesByContactId(rows.map((r) => r.contactId))
  return rows.map((r) => ({ ...r, patientName: names.get(r.contactId) ?? "Unknown Patient" }))
}

export async function withTaskPatientNames<T extends WithContact>(rows: T[]) {
  return withPatientNames(rows)
}
