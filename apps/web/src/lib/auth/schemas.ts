import { z } from "zod";

export type ActionResult<T = unknown> = {
  success: { reason: string } | null;
  error: { reason: string } | null;
  data?: T;
};

export const registerSchema = z.object({
  email: z.string().email({ message: "Invalid email address" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters" })
    .regex(/[0-9]/, { message: "Password must contain at least one number" })
    .regex(/[a-z]/, {
      message: "Password must contain at least one lowercase letter",
    })
    .regex(/[A-Z]/, {
      message: "Password must contain at least one uppercase letter",
    }),
  name: z.string().min(2).max(100),
});

export type RegisterSchema = z.infer<typeof registerSchema>;