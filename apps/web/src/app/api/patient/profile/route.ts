import { visibleEmail } from "@workspace/db/placeholder-email";
import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/src/lib/auth/auth";
import { syncContactPhoneForUser } from "@/src/lib/contact";
import { getPatientByUserId, upsertPatient, upsertHomeAddress, getHomeAddress } from "@/src/lib/patients";

const profileSchema = z.object({
  gender: z.string().optional().nullable(),
  dateOfBirth: z.string().optional().nullable(),
  mobileNumber: z.string().optional().nullable(),
  bloodGroup: z.string().optional().nullable(),
  alternateMobile: z.string().optional().nullable(),
  maritalStatus: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  language: z.string().optional().nullable(),
  addressLine1: z.string().optional().nullable(),
  addressLine2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  pincode: z.string().optional().nullable(),
});

async function requireSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function GET() {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const patient = await getPatientByUserId(session.user.id);
  const addressRow = patient ? await getHomeAddress(patient.id) : null;

  return NextResponse.json({
    name: session.user.name,
    email: visibleEmail(session.user.email),
    image: session.user.image,
    patientCode: patient?.patientCode ?? null,
    gender: patient?.gender ?? null,
    dateOfBirth: patient?.dateOfBirth ?? null,
    mobileNumber: patient?.mobileNumber ?? null,
    bloodGroup: patient?.bloodGroup ?? null,
    alternateMobile: patient?.alternateMobile ?? null,
    maritalStatus: patient?.maritalStatus ?? null,
    nationality: patient?.nationality ?? null,
    language: patient?.language ?? null,
    addressLine1: addressRow?.line1 ?? null,
    addressLine2: addressRow?.line2 ?? null,
    city: addressRow?.city ?? null,
    state: addressRow?.state ?? null,
    country: addressRow?.country ?? null,
    pincode: addressRow?.pincode ?? null,
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = profileSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid profile data", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const userId = session.user.id;

  // The patients row requires gender/dateOfBirth/mobileNumber — only
  // create/update it once all three are actually present in this save.
  // (Upsert-on-first-save: the row appears the first time it is filled in.)
  let patient = await getPatientByUserId(userId);
  if (data.gender && data.dateOfBirth && data.mobileNumber) {
    patient = await upsertPatient({
      userId,
      fallbackFullName: session.user.name,
      gender: data.gender,
      dateOfBirth: data.dateOfBirth,
      mobileNumber: data.mobileNumber,
      bloodGroup: data.bloodGroup,
      alternateMobile: data.alternateMobile,
      email: visibleEmail(session.user.email),
      maritalStatus: data.maritalStatus,
      nationality: data.nationality,
      language: data.language,
    });

    await syncContactPhoneForUser(userId, data.mobileNumber);
  } else if (!patient) {
    return NextResponse.json(
      { error: "Gender, date of birth, and mobile number are required to save your profile." },
      { status: 400 },
    );
  }

  if (patient && data.addressLine1 && data.city && data.state && data.pincode) {
    await upsertHomeAddress({
      patientId: patient.id,
      line1: data.addressLine1,
      line2: data.addressLine2,
      city: data.city,
      state: data.state,
      country: data.country ?? "India",
      pincode: data.pincode,
    });
  }

  return NextResponse.json({ success: true });
}
