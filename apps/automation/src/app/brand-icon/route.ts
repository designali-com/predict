import { NextResponse } from "next/server";
import { clinicContext } from "@/src/lib/auth/clinic";

/**
 * The tab icon, as the clinic panel's: the signed-in clinic's own, or its
 * first letter in its colour. Signed out, the plain Operations mark. Never
 * another clinic's logo.
 */
export async function GET(req: Request) {
  const context = await clinicContext().catch(() => null);
  const c = context?.clinic;
  if (c?.iconUrl) return NextResponse.redirect(c.iconUrl);
  if (!c) return NextResponse.redirect(new URL("/predict-icon.svg", req.url));

  const letter = (c.shortName || c.name).trim().charAt(0).toUpperCase() || "C";
  const color = c.brandColor || "#4f46e5";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${color}"/><text x="32" y="44" font-family="Arial, sans-serif" font-size="36" font-weight="700" fill="#fff" text-anchor="middle">${letter.replace(/[<&>"]/g, "")}</text></svg>`;
  return new NextResponse(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "private, max-age=300" } });
}
