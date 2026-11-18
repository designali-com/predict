"use client";

import { z } from "zod";
import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { Input } from "@workspace/ui/components/input"; 
import React, { useId, useState } from "react";
import { Button } from "@workspace/ui/components/button";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginUser } from "@/src/app/auth/login/action";
import { FormSuccess, FormError } from "./form-messages";

/** The number without "+91", a trunk 0 or spaces — exactly as typed otherwise, so a wrong length fails. */
function tenDigitsOrNot(value: string): string {
  let digits = value.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

// Email OR mobile number: many patients are registered by phone and have no
// email they use. Which one it is gets worked out on the server.
const schema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, { message: "Enter your mobile number or email" })
    // A mobile number is exactly 10 digits (spaces, "+91" or a leading 0 allowed).
    .refine((v) => (v.includes("@") ? z.string().email().safeParse(v).success : /^\d{10}$/.test(tenDigitsOrNot(v))), {
      message: "Enter a 10-digit mobile number or a valid email",
    }),
  password: z.string().min(1, { message: "Password is required" }),
});

type FormData = z.infer<typeof schema>;

const LoginForm = () => {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { identifier: "", password: "" },
  });

  const [isVisible, setIsVisible] = useState(false);
  const [formState, setFormState] = useState<{
    success?: string;
    error?: string;
  }>({});

  const id = useId();
  const router = useRouter();

  const toggleVisibility = () => setIsVisible((prev) => !prev);

  const onSubmit = async (data: FormData) => {
    setFormState({});
    const result = await loginUser(data);
    if (result.success) {
      setFormState({ success: result.success.reason });
      router.push("/dashboard");
    } else if (result.error) {
      setFormState({ error: result.error.reason });
    }
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex w-full flex-col gap-6"
    >
      <FormSuccess message={formState.success || ""} />
      <FormError message={formState.error || ""} />
      <div className="flex flex-col gap-2">
        <Input
 id="identifier"
 type="text"
 inputMode="email"
 className="h-12 px-8"
 placeholder="Mobile number or email"
 autoComplete="username"
 {...register("identifier")}
 />
        {errors.identifier && (
          <span className="text-xs text-red-500">{errors.identifier.message}</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Input
 id={id}
 type={isVisible ? "text" : "password"}
 placeholder="Password"
 autoComplete="current-password"
 className=" h-12 px-8"
 {...register("password")}
 />
          <Button variant="ghost" size="default"
 className="text-muted-foreground/80 mr-3 hover:text-foreground focus-visible:border-ring focus-visible:ring-ring/50 absolute inset-y-0 end-0 flex h-full w-9 items-center justify-center transition-[color,box-shadow] outline-none focus:z-10 focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
 type="button"
 onClick={toggleVisibility}
 aria-label={isVisible ? "Hide password" : "Show password"}
 aria-pressed={isVisible}
 aria-controls="password"
 >
            {isVisible ? (
              <EyeOffIcon size={16} aria-hidden="true" />
            ) : (
              <EyeIcon size={16} aria-hidden="true" />
            )}
          </Button>
        </div>
        {errors.password && (
          <span className="text-xs text-red-500">
            {errors.password.message}
          </span>
        )}
      </div>
      <Button size={"xl"} type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Signing in..." : "Sign in with password"}
      </Button>
    </form>
  );
};

export default LoginForm;