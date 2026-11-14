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
}

export default nextConfig
