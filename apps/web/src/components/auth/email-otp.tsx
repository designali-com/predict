"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { sendOTP, verifyOTP } from "@/src/lib/auth/auth-client";

import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
} from "@workspace/ui/components/input-otp";

export default function EmailOtpForm() {
    const [email, setEmail] = useState("");
    const [otp, setOtp] = useState("");
    const [step, setStep] = useState<"email" | "otp">("email");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const router = useRouter();

    // Send OTP
    const handleSendOtp = async (e: React.FormEvent) => {
        e.preventDefault();

        setLoading(true);
        setError("");

        try {
            const res = await sendOTP(email);

            if (res.error) {
                setError(res.error.message || "Failed to send OTP");
                return;
            }

            setStep("otp");
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    // Verify OTP
    // Also fired by the code box when the sixth digit is typed or pasted.
    const handleVerifyOtp = async (e?: React.FormEvent, code = otp) => {
        e?.preventDefault();
        if (code.length !== 6 || loading) return;

        setLoading(true);
        setError("");

        try {
            const res = await verifyOTP(email, code);

            if (res.error) {
                setError(res.error.message || "Invalid OTP");
                return;
            }

            router.push("/dashboard");
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="w-full">
            {/* Error */}
            {error && (
                <p className="mb-4 text-sm text-destructive">
                    {error}
                </p>
            )}

            {step === "email" ? (
                <form onSubmit={handleSendOtp} className="flex flex-col gap-6">
                    <div className="flex flex-col gap-2">
                        <Input
 id="email"
 type="email"
 className="h-12 px-8"
 placeholder="Enter your registered email"
 value={email}
 onChange={(e) => setEmail(e.target.value)}
 disabled={loading}
 required
 />
                    </div>

                    <Button
 type="submit"
 disabled={loading}
 size="xl"
 className="w-full"
 >
                        {loading ? "Please wait..." : "Continue"}
                    </Button>
                </form>
            ) : (
                <form onSubmit={handleVerifyOtp} className="flex flex-col gap-5">
                    <div className="flex flex-col justify-center w-full gap-3">
                        <InputOTP
                            maxLength={6}
                            value={otp}
                            onChange={setOtp}
                            onComplete={(code: string) => handleVerifyOtp(undefined, code)}
                            disabled={loading}
                            className="w-full"
                        >
                            <InputOTPGroup className="w-full">
                                <InputOTPSlot index={0} className="h-12 flex-1" />
                                <InputOTPSlot index={1} className="h-12 flex-1" />
                                <InputOTPSlot index={2} className="h-12 flex-1" />
                                <InputOTPSlot index={3} className="h-12 flex-1" />
                                <InputOTPSlot index={4} className="h-12 flex-1" />
                                <InputOTPSlot index={5} className="h-12 flex-1" />
                            </InputOTPGroup>
                        </InputOTP>
                    </div>
                    <div className=" text-center">
                        <p className="text-sm text-muted-foreground">
                            OTP sent to
                        </p>
                        <p className="font-medium">{email}</p>
                    </div>

                    <Button
 type="submit"
 disabled={loading || otp.length !== 6}
 size="xl"
 className="w-full"
 >
                        {loading ? "Verifying..." : "Verify & Login"}
                    </Button>

                    <Button
 type="button"
 size={"xl"}
 variant="ghost"
 className="w-full"
 onClick={() => {
 setStep("email");
 setOtp("");
 setError("");
 }}
 disabled={loading}
 >
                        Change Email
                    </Button>
                </form>
            )}
        </div>
    );
}