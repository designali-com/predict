import { NextResponse } from "next/server";
import { db } from "@workspace/db/client";
import { getValdTestType, parseValdTestTypeInput, updateValdTestType } from "@workspace/db/vald-test-types";
import { requireApiAnyPermission } from "@/src/lib/auth/permissions";
import { denyPartner } from "@/src/lib/auth/patient-scope";

/** Edit one test: switch it on or off, put it first, change its steps or video. */
export async function PATCH(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const blocked = await denyPartner();
  if (blocked) return blocked;
  const session = await requireApiAnyPermission(["clinic.care_plan_library", "clinic.settings"]);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { key } = await ctx.params;
  const current = await getValdTestType(db, key);
  if (!current) return NextResponse.json({ error: "No such test" }, { status: 404 });
  const body = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  if (body.videoUrl !== undefined && body.videoUrl !== null && body.videoUrl !== "" && parseValdTestTypeInput({ videoUrl: body.videoUrl }).videoUrl === undefined) {
    return NextResponse.json({ error: "The video link must start with https://" }, { status: 400 });
  }
  const test = await updateValdTestType(db, key, parseValdTestTypeInput(body), current.videoUrl);
  if (!test) return NextResponse.json({ error: "This test is not in the catalogue yet." }, { status: 404 });
  return NextResponse.json({ test });
}
