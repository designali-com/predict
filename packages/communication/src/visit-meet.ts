import { db } from "@workspace/db/client";
import { appointment, clinic, practitionerGoogleCalendar, user } from "@workspace/db/schema";
import { eq } from "@workspace/db";
import { sendMail } from "./mailer";

const MEET_MINUTES = 30;

/**
 * A Meet URL is not something we can invent. Google issues one only when a
 * Calendar event is created with a conference request (hangoutsMeet). That
 * call needs a refresh token for a Google account that owns the meetings —
 * the same job Cal.com used to do with its own Google connection.
 *
 * The token lives on practitioner_google_calendar, written once when that
 * doctor or nutritionist connects Calendar from Availability. The front desk
 * does not connect anything. GOOGLE_CALENDAR_REFRESH_TOKEN is only a fallback
 * when that person has not connected yet.
 */
export async function calendarIsConnected(userId: string | null): Promise<boolean> {
  return (await refreshTokenFor(userId)) !== null;
}

async function refreshTokenFor(userId: string | null): Promise<string | null> {
  if (userId) {
    const [row] = await db
      .select({ token: practitionerGoogleCalendar.refreshToken })
      .from(practitionerGoogleCalendar)
      .where(eq(practitionerGoogleCalendar.userId, userId))
      .limit(1);
    if (row?.token) return row.token;
  }
  return process.env.GOOGLE_CALENDAR_REFRESH_TOKEN?.trim() || null;
}

async function accessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Google OAuth client is not configured");
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const json = (await res.json().catch(() => null)) as { access_token?: string; error?: string } | null;
  if (!res.ok || !json?.access_token) {
    throw new Error(json?.error || `Google token refresh failed (${res.status})`);
  }
  return json.access_token;
}

export async function createVisitMeetLink(input: {
  practitionerUserId: string | null;
  summary: string;
  start: Date;
  attendeeEmail?: string | null;
}): Promise<string | null> {
  const refresh = await refreshTokenFor(input.practitionerUserId);
  if (!refresh) return null;

  const token = await accessToken(refresh);
  const end = new Date(input.start.getTime() + MEET_MINUTES * 60 * 1000);
  const res = await fetch(
    "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=none",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        summary: input.summary,
        start: { dateTime: input.start.toISOString() },
        end: { dateTime: end.toISOString() },
        ...(input.attendeeEmail ? { attendees: [{ email: input.attendeeEmail }] } : {}),
        conferenceData: {
          createRequest: {
            requestId: crypto.randomUUID(),
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      }),
    },
  );
  const json = (await res.json().catch(() => null)) as {
    hangoutLink?: string;
    error?: { message?: string };
  } | null;
  if (!res.ok || !json?.hangoutLink) {
    throw new Error(json?.error?.message || `Google Calendar did not return a Meet link (${res.status})`);
  }
  return json.hangoutLink;
}

function whenLabel(start: Date): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(start);
}

/**
 * After the visit row exists: a Meet link for a virtual visit, then a
 * confirmation from EMAIL_FROM (info@predict.fit). Neither failure unbooks
 * the visit — the desk already has the row.
 *
 * Returns the location that should be on the row (Meet URL, clinic address,
 * or null when Calendar is not connected yet).
 */
export async function notifyBookedVisit(input: {
  appointmentId: string;
  clinicId: string | null;
  channel: "virtual" | "in_clinic";
  start: Date;
  meetingLocation: string | null;
  attendeeName: string;
  attendeeEmail: string | null;
  doctorUserId: string | null;
}): Promise<string | null> {
  let location = input.meetingLocation;

  if (input.channel === "virtual") {
    try {
      const link = await createVisitMeetLink({
        practitionerUserId: input.doctorUserId,
        summary: `Consultation — ${input.attendeeName}`,
        start: input.start,
        attendeeEmail: input.attendeeEmail,
      });
      if (link) {
        location = link;
        await db
          .update(appointment)
          .set({ meetingLocation: link, updatedAt: new Date() })
          .where(eq(appointment.id, input.appointmentId));
      }
    } catch (error) {
      console.error(
        `[appointments] booking ${input.appointmentId} saved, but the Meet link was not created:`,
        error instanceof Error ? error.message : error,
      );
    }
  }

  let hostName: string | null = null;
  let hostEmail: string | null = null;
  let hostRole = "doctor";
  if (input.doctorUserId) {
    const [host] = await db
      .select({ name: user.name, email: user.email, role: user.role })
      .from(user)
      .where(eq(user.id, input.doctorUserId))
      .limit(1);
    hostName = host?.name ?? null;
    hostEmail = host?.email ?? null;
    hostRole = host?.role ?? "doctor";
  }
  const hostTitle = hostRole === "nutritionist" ? "Nutritionist" : "Doctor";

  // The visit is the clinic's, so the email is too: OPTM's patient hears from
  // OPTM, not Predict.
  const [owner] = await db
    .select({ name: clinic.name, shortName: clinic.shortName })
    .from(appointment)
    .innerJoin(clinic, eq(clinic.id, appointment.clinicId))
    .where(eq(appointment.id, input.appointmentId))
    .limit(1);
  const clinicName = owner?.name || owner?.shortName || "the clinic";

  const patientEmail = input.attendeeEmail?.trim();
  if (patientEmail) {
    const lines = [
      `Hi ${input.attendeeName},`,
      ``,
      `Your appointment at ${clinicName} is booked.`,
      ``,
      `When: ${whenLabel(input.start)} (IST)`,
      hostName ? `${hostTitle}: ${hostName}` : null,
      input.channel === "virtual" ? `Where: Google Meet` : `Where: Clinic`,
      location ? (input.channel === "virtual" ? `Link: ${location}` : `Address: ${location}`) : null,
      input.channel === "virtual" && !location
        ? `The Meet link is not ready yet. ${hostName ?? "Your clinician"} connects Google Calendar once, and the link is sent after that.`
        : null,
      ``,
      `— ${clinicName}`,
    ].filter((line): line is string => line !== null);

    const mail = await sendMail({
      to: patientEmail,
      subject: `Your ${clinicName} appointment is booked`,
      text: lines.join("\n"),
    });
    if (!mail.ok) {
      console.error(`[appointments] booking ${input.appointmentId} saved, but the confirmation email failed:`, mail.error);
    }
  }

  const clinicianEmail = hostEmail?.trim();
  if (input.channel === "virtual" && location && clinicianEmail && clinicianEmail !== patientEmail) {
    const mail = await sendMail({
      to: clinicianEmail,
      subject: `Virtual consultation — ${input.attendeeName}`,
      text: [
        `Hi ${hostName ?? hostTitle},`,
        ``,
        `A virtual consultation is booked with you.`,
        ``,
        `Patient: ${input.attendeeName}`,
        `When: ${whenLabel(input.start)} (IST)`,
        `Meet link: ${location}`,
        ``,
        `— ${clinicName}`,
      ].join("\n"),
    });
    if (!mail.ok) {
      console.error(
        `[appointments] booking ${input.appointmentId} saved, but the clinician's Meet email failed:`,
        mail.error,
      );
    }
  }

  return location;
}
