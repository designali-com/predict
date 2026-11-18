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

const schema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
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
    defaultValues: { email: "", password: "" },
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
      // "/" resolves server-side to wherever this person actually belongs,
      // which may be another app entirely. A client form cannot know that —
      // it would have to read permissions to find out, and hard-coding a
      // destination is how this ended up pushing to /dashboard, a route that
      // only exists in the patient app.
      router.push("/");
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
          id="email"
          type="email"
          className="h-12 px-8"
          placeholder="contact@predict.fit"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email && (
          <span className="text-xs text-red-500">{errors.email.message}</span>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Input
            id={id}
            type={isVisible ? "text" : "password"}
            placeholder="password"
            autoComplete="current-password"
            className=" h-12 px-8"
            {...register("password")}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute inset-y-0 end-0 mr-1"
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
        {isSubmitting ? "Logging in..." : "Login"}
      </Button>
    </form>
  );
};

export default LoginForm;