import { NextResponse } from "next/server";
import { captureLead } from "@/src/lib/contact";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);

  const name = typeof body?.name === "string" ? body.name.trim() : undefined;
  const phone = typeof body?.phone === "string" ? body.phone.trim() : undefined;
  const email = typeof body?.email === "string" ? body.email.trim() : undefined;

  if (!phone && !email) {
    return NextResponse.json({ error: "phone or email is required" }, { status: 400 });
  }

  try {
    await captureLead({
      name,
      phone,
      email,
      source: typeof body?.source === "string" ? body.source : "PREDICT",
      sourcePlatform: typeof body?.sourcePlatform === "string" ? body.sourcePlatform : undefined,
      campaign: typeof body?.campaign === "string" ? body.campaign : undefined,
      campaignId: typeof body?.campaignId === "string" ? body.campaignId : undefined,
      referralCode: typeof body?.referralCode === "string" ? body.referralCode : undefined,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Failed to capture lead" }, { status: 500 });
  }
}
