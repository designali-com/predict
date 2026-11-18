import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { readableUrl, uploadFile } from "@workspace/storage";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import { appointment, contact, report } from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { canReadAnotherPatient } from "@/src/lib/auth/config";

const REPORT_TYPES = ["initial", "final"] as const;

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });

        if (!session) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            );
        }

        const formData = await req.formData();

        const file = formData.get("file") as File;
        const patientId = formData.get("patientId") as string | null;
        const reportTypeInput = formData.get("reportType") as string | null;
        const appointmentIdInput = (formData.get("appointmentId") as string | null) || null;

        if (!file) {
            return NextResponse.json(
                { error: "No file uploaded" },
                { status: 400 }
            );
        }

        let targetUserId = session.user.id;
        let reportType: (typeof REPORT_TYPES)[number] | null = null;
        // Only trusted on the staff-uploads-for-a-patient path below, and
        // only once verified to actually belong to that patient — a
        // self-upload can never tag a report onto someone else's visit.
        let appointmentId: string | null = null;

        if (patientId) {
            if (!canReadAnotherPatient()) {
                return NextResponse.json(
                    { error: "You are not allowed to upload reports for other users" },
                    { status: 403 }
                );
            }

            if (!reportTypeInput || !REPORT_TYPES.includes(reportTypeInput as any)) {
                return NextResponse.json(
                    { error: "reportType must be 'initial' or 'final'" },
                    { status: 400 }
                );
            }

            targetUserId = patientId;
            reportType = reportTypeInput as (typeof REPORT_TYPES)[number];

            if (appointmentIdInput) {
                const [owningAppointment] = await db
                    .select({ id: appointment.id })
                    .from(appointment)
                    .innerJoin(contact, eq(contact.id, appointment.contactId))
                    .where(and(eq(appointment.id, appointmentIdInput), eq(contact.userId, patientId)))
                    .limit(1);

                if (!owningAppointment) {
                    return NextResponse.json(
                        { error: "That appointment does not belong to this patient" },
                        { status: 400 }
                    );
                }
                appointmentId = appointmentIdInput;
            }
        }

        const bytes = await file.arrayBuffer();

        const buffer = Buffer.from(bytes);

        // Private: a report is only ever opened through a short-lived signed link.
        const upload = await uploadFile({
            visibility: "private",
            folder: `reports/${targetUserId}`,
            fileName: file.name,
            body: buffer,
            contentType: file.type,
        });

        const [savedReport] = await db
            .insert(report)
            .values({
                userId: targetUserId,
                appointmentId,
                fileUrl: upload.url,
                fileName: file.name,
                reportType,
                uploadedBy: session.user.id,
            })
            .returning();

        return NextResponse.json({
            success: true,
            url: await readableUrl(upload.url),
            reportId: savedReport?.id,
        });
    } catch (error) {
        console.error(error);

        return NextResponse.json(
            { success: false },
            { status: 500 }
        );
    }
}