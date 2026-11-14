import { headers } from "next/headers";
import { auth } from "@/src/lib/auth/auth";
import { isAdminRole } from "@/src/lib/auth/config";

export async function requireAdmin() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || !isAdminRole(session.user.role)) {
    return null;
  }
  return session;
}
