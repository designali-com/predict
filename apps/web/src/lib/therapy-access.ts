import { db } from "@workspace/db/client"
import { contact } from "@workspace/db/schema"
import { eq } from "@workspace/db"
import { hasPurchasedCourse } from "@workspace/db/enrollment-service"

/**
 * Whether this signed-in patient has a therapy course they bought — prescribed
 * at a consult and paid for. Decides whether "My Therapy" is in the menu and
 * whether the page opens at all.
 *
 * Found by contact, like the therapy API: a patient registered at the counter
 * has their course before they ever have a login.
 */
export async function patientHasTherapy(userId: string): Promise<boolean> {
  try {
    const [row] = await db.select({ id: contact.id }).from(contact).where(eq(contact.userId, userId)).limit(1)
    return row ? await hasPurchasedCourse(db, row.id) : false
  } catch (error) {
    // The menu should still draw if this check fails; the page itself checks again.
    console.error("[therapy-access] could not check for a course:", error)
    return false
  }
}
