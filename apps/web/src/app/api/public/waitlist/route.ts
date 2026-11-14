import { NextResponse } from "next/server";
import { resend } from "@/src/lib/resend";

export async function POST(req: Request) {
  try {
    const { email, firstName } = await req.json();

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      );
    }

    const { data, error } = await resend.contacts.create({
      email: email.trim(),
      firstName: firstName?.trim() || undefined,
      unsubscribed: false,
    });

    if (error) {
      console.error("Resend create contact error:", error);

      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "🎉 You're on the waitlist!",
      contact: data,
    });
  } catch (error) {
    console.error("Waitlist API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Internal Server Error",
      },
      { status: 500 }
    );
  }
}