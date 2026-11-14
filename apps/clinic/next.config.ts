import type { NextConfig } from "next"
import { networkInterfaces } from "node:os"

/**
 * Hosts allowed to pull dev resources.
 *
 * Next 16 blocks /_next/* for any origin but the one the server started on, so
 * opening this app on a phone or tablet over the LAN renders the page and then
 * never hydrates it — every control is dead and a tap only draws the browser's
 * own focus ring. It reads as a broken button rather than a blocked request.
 *
 * Addresses are detected rather than listed, so this keeps working on whatever
 * network the machine joins. NEXT_DEV_ORIGINS adds anything unusual. This has
 * no effect on `next build` or `next start`.
 */
function devOrigins(): string[] {
  const own: string[] = []
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      const isV4 = address.family === "IPv4" || (address.family as unknown as number) === 4
      if (isV4 && !address.internal) own.push(address.address)
    }
  }
  return [
    ...(process.env.NEXT_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? []),
    ...own,
    "192.168.0.*",
    "192.168.1.*",
    "192.168.29.*",
    "10.0.0.*",
    "172.20.10.*",
  ]
}


/**
 * The clinic panel's routes used to start with a role — /doctor/patient,
 * /superadmin/team — which stopped being true the moment a clinic could invent
 * a role of its own: a therapist granted the patient list would open a page
 * addressed to a doctor. They are named for the work now.
 *
 * These redirects are not only for bookmarks. Appointment confirmations, task
 * emails and anything a person pasted into a chat still carry the old paths,
 * and a 404 there reads as data loss.
 */
/**
 * Zero-config demo: the addresses the browser needs, written into the build.
 * The server fills its own defaults (packages/db/src/demo-env.ts); the browser
 * cannot see those, so the ones it uses go here. A real variable still wins.
 */
const DEMO_PUBLIC_ENV = {
  NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE ?? "1",
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "https://predictfitdemo.vercel.app",
  NEXT_PUBLIC_PATIENT_URL: process.env.NEXT_PUBLIC_PATIENT_URL ?? "https://predictfitdemo.vercel.app",
  NEXT_PUBLIC_OPERATIONS_URL: process.env.NEXT_PUBLIC_OPERATIONS_URL ?? "https://predictfitdemo-ops.vercel.app",
  NEXT_PUBLIC_CLINIC_URL: process.env.NEXT_PUBLIC_CLINIC_URL ?? "https://predictfitdemo-clinic.vercel.app",
}

const nextConfig: NextConfig = {
  env: DEMO_PUBLIC_ENV,
  allowedDevOrigins: devOrigins(),
  transpilePackages: ["@workspace/ui"],
  // Headless Chrome for the exercise plan PDF (src/lib/exercise-plan-send.ts) — not bundled.
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium"],
  async redirects() {
    return [
      // Area dashboards — all four were the same screen with different queries.
      { source: "/doctor", destination: "/dashboard", permanent: false },
      { source: "/nutritionist", destination: "/dashboard", permanent: false },
      { source: "/admin", destination: "/dashboard", permanent: false },
      { source: "/superadmin", destination: "/dashboard", permanent: false },

      // Patients: three copies of one list.
      { source: "/doctor/patient", destination: "/patients", permanent: false },
      { source: "/admin/patients", destination: "/patients", permanent: false },
      { source: "/superadmin/patients", destination: "/patients", permanent: false },

      // Appointments: two copies.
      { source: "/doctor/appointments/:path*", destination: "/appointments/:path*", permanent: false },
      { source: "/nutritionist/appointments/:path*", destination: "/appointments/:path*", permanent: false },
      { source: "/doctor/appointments", destination: "/appointments", permanent: false },
      { source: "/nutritionist/appointments", destination: "/appointments", permanent: false },

      // The colleague directory is gone. These redirects exist to rescue old
      // bookmarked links, so they have to land somewhere that exists — they
      // pointed at /directory, which 404s.
      { source: "/doctor/team/:path*", destination: "/dashboard", permanent: false },
      { source: "/nutritionist/team/:path*", destination: "/dashboard", permanent: false },

      // Staff administration.
      { source: "/admin/team", destination: "/team", permanent: false },
      { source: "/superadmin/team", destination: "/team", permanent: false },
      { source: "/superadmin/admin", destination: "/team", permanent: false },
      { source: "/admin/doctors", destination: "/team", permanent: false },
      { source: "/admin/health-coach", destination: "/team", permanent: false },
      { source: "/admin/nutritionist", destination: "/team", permanent: false },
      { source: "/superadmin/doctors", destination: "/team", permanent: false },
      { source: "/superadmin/health-coach", destination: "/team", permanent: false },
      { source: "/superadmin/nutritionist", destination: "/team", permanent: false },

      // Everything else that moved out of a role's folder.
      { source: "/superadmin/roles", destination: "/roles", permanent: false },
      { source: "/superadmin/permissions", destination: "/roles", permanent: false },
      { source: "/superadmin/biomarker-config/:path*", destination: "/biomarkers/:path*", permanent: false },
      { source: "/superadmin/biomarker-config", destination: "/biomarkers", permanent: false },
      { source: "/superadmin/ai-config", destination: "/ai", permanent: false },

      // One person's page, whichever area you happened to reach it from.
      { source: "/doctor/users/:path*", destination: "/people/:path*", permanent: false },
      { source: "/admin/users/:path*", destination: "/people/:path*", permanent: false },
      { source: "/superadmin/users/:path*", destination: "/people/:path*", permanent: false },
    ]
  },
}

export default nextConfig
