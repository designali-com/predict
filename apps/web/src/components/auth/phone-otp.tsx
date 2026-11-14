"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  sendPhoneOtp,
  verifyPhoneOtp,
  type OtpChannel,
  type PhoneOtpResponse,
} from "@/src/lib/auth/auth-client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp";

/**
 * Sign in with a mobile number: the code goes on WhatsApp, and SMS is there
 * for when WhatsApp does not work.
 *
 * SMS is offered, never switched to. It appears — as one quiet line under
 * the form — only once the WhatsApp attempts are used up or WhatsApp has
 * refused the send outright. Before that it would be a second button most
 * people press out of impatience, and every SMS is a message the clinic
 * pays for. The server enforces the same rule (@workspace/db/otp-policy);
 * this page only reflects what it says.
 */
/**
 * What was typed or pasted, as at most 10 digits. A pasted "+91 98765 43210"
 * or "098765 43210" loses its country code or trunk 0 first, so it lands as
 * the number rather than as its first ten characters.
 */
export function tenDigits(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export default function PhoneOtpForm() {
  const router = useRouter();

  // Exactly the 10 digits after +91 — the prefix is printed beside the field.
  const [phoneInput, setPhoneInput] = useState("");
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [otp, setOtp] = useState("");

  // What the server last said. The page never works out the rules itself.
  const [sent, setSent] = useState<PhoneOtpResponse | null>(null);
  const [channel, setChannel] = useState<OtpChannel>("whatsapp");

  const [loading, setLoading] = useState<"send" | "verify" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  // One ticking number for the resend button. Seeded from the server's
  // cooldown so a reload or a second tab cannot skip it.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const smsUnlocked = Boolean(sent?.smsUnlocked);
  const whatsappLeft = sent?.whatsappLeft ?? 3;
  const smsLeft = sent?.smsLeft ?? 0;

  async function request(nextChannel: OtpChannel) {
    setLoading("send");
    setError("");
    setNotice("");

    try {
      const { data } = await sendPhoneOtp(sent?.phone ?? phoneInput, nextChannel);

      // Whatever happened, keep the latest picture of the limits.
      if (data.whatsappLeft !== undefined) setSent((prev) => ({ ...prev, ...data }));
      if (data.cooldownSeconds) setCooldown(data.cooldownSeconds);
      else if (data.retryAfterSeconds && data.code === "COOLDOWN") setCooldown(data.retryAfterSeconds);

      if (data.error) {
        setError(data.error);
        // Out of WhatsApp attempts: straight to the SMS option rather than a
        // dead end.
        if (data.code === "WHATSAPP_EXHAUSTED") setHelpOpen(true);
        return;
      }

      setChannel(data.channel ?? nextChannel);
      setStep("otp");
      setOtp("");

      if (data.delivered) {
        setNotice(
          `${data.channel === "sms" ? "Code sent by SMS" : "Code sent on WhatsApp"} to ${data.maskedPhone}.`,
        );
      } else {
        // WhatsApp refused it — the SMS line is already unlocked by the
        // server, so open it rather than making them go looking.
        setError(data.message ?? "We couldn't send the code.");
        if (data.channel === "whatsapp") setHelpOpen(true);
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  // Called by the form, and by the code box itself the moment the sixth digit
  // lands — nobody should have to find a button after typing a code.
  async function verify(e?: React.FormEvent, code = otp) {
    e?.preventDefault();
    if (!sent?.phone || code.length !== 6 || loading) return;

    setLoading("verify");
    setError("");

    try {
      const res = await verifyPhoneOtp(sent.phone, code);
      if (res.error) {
        // One message for every way a code can be wrong. Distinguishing
        // "expired" from "never sent" would tell anyone typing numbers in
        // which ones belong to a patient.
        setError("That code is not right, or it has expired. Check it or request a new one.");
        // Cleared, so typing the right code submits it again by itself.
        setOtp("");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  function changeNumber() {
    setStep("phone");
    setSent(null);
    setOtp("");
    setError("");
    setNotice("");
    setCooldown(0);
    setHelpOpen(false);
  }

  return (
    <div className="w-full">
      {error && <p className="mb-4 text-sm text-destructive">{error}</p>}

      {step === "phone" ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            request("whatsapp");
          }}
          className="flex flex-col gap-6"
        >
          <div className="relative">
            <span className="pointer-events-none absolute left-8 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              +91
            </span>
            <Input
 id="mobile"
 type="tel"
 inputMode="numeric"
 autoComplete="tel-national"
 className="h-12 pr-8 pl-[4.5rem]"
 placeholder="Registered mobile number"
 value={phoneInput}
 // No maxLength: it would cut a pasted "+91 98765 43210" to its
 // first ten characters before tenDigits could strip the +91.
 onChange={(e) => setPhoneInput(tenDigits(e.target.value))}
 disabled={loading !== null}
 required
 />
          </div>

          {/* The same purple button as the password form, so the two ways in
              look like one screen, not a primary and a lesser one. */}
          <Button
 type="submit"
 disabled={loading !== null || phoneInput.length !== 10}
 size="xl"
 className="w-full"
 >
            {/* Just "Continue": the first screen asks for a number, nothing
                more. How the code reaches them is said on the next step. */}
            {loading === "send" ? "Please wait..." : "Continue"}
          </Button>
        </form>
      ) : (
        <form onSubmit={verify} className="flex flex-col gap-5">
          <div className="flex w-full flex-col justify-center gap-3">
            <InputOTP
              maxLength={6}
              value={otp}
              onChange={setOtp}
              onComplete={(code: string) => verify(undefined, code)}
              disabled={loading !== null}
              className="w-full"
              autoFocus
            >
              <InputOTPGroup className="w-full">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 flex-1" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          {notice && <p className="text-center text-sm text-muted-foreground">{notice}</p>}

          <Button
 type="submit"
 disabled={loading !== null || otp.length !== 6}
 size="xl"
 className="w-full"
 >
            {loading === "verify" ? "Verifying..." : "Verify & Login"}
          </Button>

          <div className="flex items-center justify-between gap-2 text-sm">
            <Button variant="ghost" size="default"
 type="button"
 onClick={changeNumber}
 disabled={loading !== null}
 className="text-muted-foreground hover:text-foreground disabled:opacity-50"
 >
              Change number
            </Button>

            {/* Resend stays on the channel they are on. WhatsApp resends stop
                at the limit — past that, the only way on is the SMS line. */}
            {channel === "whatsapp" && whatsappLeft > 0 && (
              <Button variant="ghost" size="default"
 type="button"
 onClick={() => request("whatsapp")}
 disabled={loading !== null || cooldown > 0}
 className="text-muted-foreground hover:text-foreground disabled:opacity-50"
 >
                {cooldown > 0
                  ? `Resend in ${cooldown}s`
                  : `Resend on WhatsApp (${whatsappLeft} left)`}
              </Button>
            )}
            {channel === "sms" && smsLeft > 0 && (
              <Button variant="ghost" size="default"
 type="button"
 onClick={() => request("sms")}
 disabled={loading !== null || cooldown > 0}
 className="text-muted-foreground hover:text-foreground disabled:opacity-50"
 >
                {cooldown > 0 ? `Resend in ${cooldown}s` : `Resend SMS (${smsLeft} left)`}
              </Button>
            )}
          </div>
        </form>
      )}

      {/* The fallback. Invisible until WhatsApp has had its three tries or
          has refused outright; then a single light line, and only on a click
          does it become a button — enough to find, not enough to press by
          reflex. */}
      {smsUnlocked && channel === "whatsapp" && (
        <div className="mt-5 text-center">
          {!helpOpen ? (
            <Button variant="ghost" size="default"
 type="button"
 onClick={() => setHelpOpen(true)}
 className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
 >
              Getting issue with OTP?
            </Button>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <p className="text-xs text-muted-foreground">
                Not getting it on WhatsApp? Make sure this is the number you gave the clinic, or get
                the code by SMS.
              </p>
              <Button
 type="button"
 variant="outline"
 size="sm"
 onClick={() => request("sms")}
 disabled={loading !== null || cooldown > 0 || smsLeft === 0}
 >
                {loading === "send"
                  ? "Sending..."
                  : cooldown > 0
                    ? `Get OTP on SMS in ${cooldown}s`
                    : smsLeft === 0
                      ? "SMS limit reached — try later"
                      : "Get OTP on SMS"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
