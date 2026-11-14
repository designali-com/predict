import { NextRequest, NextResponse } from "next/server"
import { headers } from "next/headers"
import { auth } from "@/src/lib/auth/auth"
import { db } from "@workspace/db/client"
import { account } from "@workspace/db/schema"
import { eq, and } from "@workspace/db"
import { z } from "zod"

const passwordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters long"),
})

export async function GET() {
  try {
    const reqHeaders = await headers()
    const session = await auth.api.getSession({
      headers: reqHeaders,
    })

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const credentialAccount = await db.query.account.findFirst({
      where: and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "credential")
      ),
    })

    return NextResponse.json({
      hasPassword: !!credentialAccount,
    })
  } catch (error) {
    console.error("Error checking password status:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const reqHeaders = await headers()
    const session = await auth.api.getSession({
      headers: reqHeaders,
    })

    if (!session || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json()
    const validation = passwordSchema.safeParse(body)

    if (!validation.success) {
      return NextResponse.json(
        //@ts-ignore
        { error: validation.error.errors[0]?.message ?? "Invalid input parameters" },
        { status: 400 }
      )
    }

    const { currentPassword, newPassword } = validation.data

    // Check DB for existing password account
    const existingCredentialAccount = await db.query.account.findFirst({
      where: and(
        eq(account.userId, session.user.id),
        eq(account.providerId, "credential")
      ),
    })

    const hasPassword = !!existingCredentialAccount

    if (hasPassword) {
      if (!currentPassword) {
        return NextResponse.json(
          { error: "Current password is required to update your password." },
          { status: 400 }
        )
      }

      // UPDATE EXISTING PASSWORD
      await auth.api.changePassword({
        headers: reqHeaders,
        body: {
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        },
      })

      return NextResponse.json({
        message: "Password updated successfully",
      })
    } else {
      // CREATE FIRST TIME PASSWORD
      if (typeof (auth.api as any).setPassword === "function") {
        await (auth.api as any).setPassword({
          headers: reqHeaders,
          body: { newPassword },
        })
      } else {
        await auth.api.changePassword({
          headers: reqHeaders,
          //@ts-ignore
          body: { newPassword },
        })
      }

      return NextResponse.json({
        message: "Password created successfully",
      })
    }
  } catch (error: any) {
    console.error("Password Route Error:", error)

    const errorMessage =
      error?.body?.message ||
      error?.message ||
      error?.statusText ||
      "Failed to update password. Please verify your current password."

    return NextResponse.json(
      { error: errorMessage },
      { status: error?.status || 400 }
    )
  }
}