// Who gets into this console, and how far.
//
// Two gates, not one. The panel stopped being an admin-only flow builder the
// moment health coaches started working leads in it: a coach's day crosses
// the LEAD/PATIENT line constantly (the same person WhatsApps before and
// after they convert), so they need the whole Work section — but they have no
// business editing a published flow or submitting a WhatsApp template to Meta.
//
// Roles are stored as free text on user.role and are shared with apps/web, so
// they are normalized the same way here: a role mistyped once in the database
// should not silently lose someone their access.

import { Role, hasRole, isAdminRole, resolveRole } from "@workspace/db/roles";

export { isAdminRole, resolveRole };

/**
 * Can open the console at all: Home, Inbox, People, Tasks, Schedule and the
 * contact 360 view. Health coaches work both fresh leads and patients who hit
 * a problem; receptionists take inbound calls and book from the front desk.
 */
export function canAccessOperations(role?: string | null): boolean {
  return isAdminRole(role) || hasRole(role, [Role.HEALTH_COACH, Role.RECEPTIONIST]);
}

/**
 * Can change the machine itself — flows, templates, media, audiences,
 * availability, and the global run log. Deliberately narrower than
 * canAccessOperations: an edit here changes what every future contact
 * receives, not what one person is told today.
 */
export function canManageAutomation(role?: string | null): boolean {
  return isAdminRole(role);
}
