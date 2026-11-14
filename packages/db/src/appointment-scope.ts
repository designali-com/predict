import { and, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import { appointment } from "./schema";

/**
 * Appointments that belong on this clinic's list.
 *
 * New bookings are stamped with clinic_id. The clinic panel used to insert
 * without it, and the list filters by clinic, so a visit that had just been
 * created never appeared. Those unstamped rows still belong here when the
 * doctor works at this clinic, the patient is already on its books, or this
 * is the only clinic.
 */
export function appointmentInClinic(clinicId: string): SQL {
  return or(
    eq(appointment.clinicId, clinicId),
    and(
      isNull(appointment.clinicId),
      or(
        sql`exists (select 1 from "clinic_member" where "clinic_id" = ${clinicId} and "user_id" = ${appointment.doctorUserId})`,
        sql`exists (select 1 from "doctor_availability" where "clinic_id" = ${clinicId} and "doctor_user_id" = ${appointment.doctorUserId})`,
        sql`exists (select 1 from "contact" where "id" = ${appointment.contactId} and "clinic_id" = ${clinicId})`,
        sql`(select count(*) from "clinic") = 1`,
      ),
    ),
  )!;
}
