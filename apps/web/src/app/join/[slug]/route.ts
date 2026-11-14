import { NextResponse, type NextRequest } from "next/server";

/**
 * Community join links: /join/<slug> sends the visitor straight to the
 * WhatsApp community invite.
 *
 * Meta refuses a WhatsApp link (chat.whatsapp.com, wa.me) in a template
 * button — "Direct links to WhatsApp aren't allowed for buttons" — so the
 * button carries this address on our own domain instead. When an invite link
 * is reset, change it here; the approved template keeps working.
 */
const INVITES: Record<string, string> = {
  // OPTM Joint Health Community.
  "joint-health": "https://chat.whatsapp.com/C4oJx8X87Tp58tPH1G8NmJ",
};

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const invite = INVITES[slug.toLowerCase()];
  if (!invite) return NextResponse.redirect("https://predict.fit/", { status: 302 });
  return NextResponse.redirect(invite, { status: 302, headers: { "cache-control": "no-store" } });
}
