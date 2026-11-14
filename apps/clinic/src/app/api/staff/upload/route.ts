import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { readableUrl, uploadFile } from "@workspace/storage";
import { auth } from "@/src/lib/auth/auth";
import { db } from "@workspace/db/client";
import {
    appointment,
    bloodTestOrder,
    contact,
    patientRecord,
    report,
} from "@workspace/db/schema";
import { and, eq } from "@workspace/db";
import { mayFilePatientReport } from "@/src/lib/auth/clinic";
import { describeError } from "@/src/lib/api-error";
import { guardDiagnosis } from "@/src/lib/auth/patient-scope";

const REPORT_TYPES = ["initial", "final"] as const;

export async function POST(req: Request) {
    try {
        const session = await auth.api.getSession({ headers: await headers() });

        if (!session) {
            // Named rather than "Unauthorized": this is the only thing that
            // can produce a 401 here, and a signed-out session looks
            // identical to a permission problem when the word is that vague.
            return NextResponse.json(
                { error: "Not signed in — your session has expired. Sign in again and retry." },
                { status: 401 }
            );
        }

        const formData = await req.formData();

        const file = formData.get("file") as File;
        const patientId = formData.get("patientId") as string | null;
        // The chart, for a patient with no app account. Most walk-ins have one
        // and never sign up, and their lab printouts still have to be filed.
        const chartIdInput = (formData.get("chartId") as string | null) || null;
        {
          const blocked = await guardDiagnosis(chartIdInput ?? patientId);
          if (blocked) return blocked;
        }
        const reportTypeInput = formData.get("reportType") as string | null;
        const appointmentIdInput = (formData.get("appointmentId") as string | null) || null;
    // Which blood test this sheet answers, when the clinic ordered it here.
    // Verified below against the chart, so a mistyped id cannot file one
    // patient's report under another's test.
    const bloodTestOrderIdInput = (formData.get("bloodTestOrderId") as string | null) || null;

        if (!file) {
            return NextResponse.json(
                { error: "No file uploaded" },
                { status: 400 }
            );
        }

        let targetUserId: string | null = session.user.id;
        // Which chart the report is filed on. Resolved from the account when
        // there is one, or given directly for a patient with no login.
        let targetChartId: string | null = null;
        let reportType: (typeof REPORT_TYPES)[number] | null = null;
        // Only trusted on the staff-uploads-for-a-patient path below, and
        // only once verified to actually belong to that patient — a
        // self-upload can never tag a report onto someone else's visit.
        let appointmentId: string | null = null;

        if (patientId) {
            if (!(await mayFilePatientReport(session.user.role))) {
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

            // File it on their chart too, so the clinic can find it by patient
            // rather than only by account.
            const [chart] = await db
                .select({ id: patientRecord.id })
                .from(patientRecord)
                .where(eq(patientRecord.userId, patientId))
                .limit(1);
            targetChartId = chart?.id ?? null;
        } else if (chartIdInput) {
            // A patient with no login. Staff only, same rule as above — a
            // self-upload has an account by definition and never takes this path.
            if (!(await mayFilePatientReport(session.user.role))) {
                return NextResponse.json(
                    { error: "You are not allowed to upload reports for other patients" },
                    { status: 403 }
                );
            }

            if (!reportTypeInput || !REPORT_TYPES.includes(reportTypeInput as any)) {
                return NextResponse.json(
                    { error: "reportType must be 'initial' or 'final'" },
                    { status: 400 }
                );
            }

            const [chart] = await db
                .select({ id: patientRecord.id, userId: patientRecord.userId })
                .from(patientRecord)
                .where(eq(patientRecord.id, chartIdInput))
                .limit(1);

            if (!chart) {
                return NextResponse.json({ error: "No such patient" }, { status: 404 });
            }

            targetChartId = chart.id;
            // Null unless that chart has since been linked to an account. The
            // row is legal either way now; the account only decides whether the
            // patient can see it in their own app.
            targetUserId = chart.userId;
            reportType = reportTypeInput as (typeof REPORT_TYPES)[number];
        }

        // Checked against the chart the report is being filed on, so a stale or
        // mistyped id cannot attach one patient's results to another patient's
        // blood test. Silently dropped rather than refused: the report itself is
        // still worth keeping.
        let bloodTestOrderId: string | null = null;
        if (bloodTestOrderIdInput && targetChartId) {
            const [owningOrder] = await db
                .select({ id: bloodTestOrder.id })
                .from(bloodTestOrder)
                .where(
                    and(
                        eq(bloodTestOrder.id, bloodTestOrderIdInput),
                        eq(bloodTestOrder.patientId, targetChartId)
                    )
                )
                .limit(1);
            bloodTestOrderId = owningOrder?.id ?? null;
        }

        const bytes = await file.arrayBuffer();

        const buffer = Buffer.from(bytes);

        // Named separately from the database write below. The two fail for
        // completely different reasons — a file the store rejects versus a row
        // the database rejects — and "Could not save this report" for both
        // leaves nobody any wiser about which one to go and fix.
        // Private: a report is only ever opened through a short-lived signed link.
        const upload = await uploadFile({
            visibility: "private",
            folder: `reports/${targetUserId ?? targetChartId ?? "unfiled"}`,
            fileName: file.name,
            body: buffer,
            contentType: file.type,
        }).catch((error: unknown) => {
            const size = (buffer.length / (1024 * 1024)).toFixed(1);
            throw new Error(
                `File storage refused the upload (${file.name}, ${size} MB): ` +
                    describeError(error, "no reason given"),
            );
        });

        const [savedReport] = await db
            .insert(report)
            .values({
                userId: targetUserId,
                patientId: targetChartId,
                appointmentId,
                bloodTestOrderId,
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
        // `{ success: false }` and nothing else was all this used to answer
        // with. Two very different failures — the file store refusing the
        // upload and the database refusing the row — arrived at the desk as
        // the same blank 500, and the only copy of the reason was in a server
        // log nobody standing at the counter can read.
        console.error("[staff/upload] failed", error);

        return NextResponse.json(
            { success: false, error: describeError(error, "Could not save this report") },
            { status: 500 }
        );
    }
}