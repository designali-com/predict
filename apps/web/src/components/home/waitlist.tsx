"use client";

import { useState } from "react";
import { cn } from "@workspace/ui/lib/utils";
import { Button } from "@workspace/ui/components/button";
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { Alert, AlertDescription } from "@workspace/ui/components/alert";
import { Loader2, MailIcon, SparklesIcon } from "lucide-react";
import { Warp } from "@paper-design/shaders-react";

const waitlistInfo = [
  {
    icon: <MailIcon />,
    label: "Questions?",
    value: "support@predict.fit",
  },
  {
    icon: <SparklesIcon />,
    label: "Access",
    value: "Early invitation to launch features",
  },
];

export function WaitlistSection() {
  return (
    /* 1. Added 'relative overflow-hidden' to the parent section so absolute canvas stays contained */
    <section id="waitlist" className="relative  w-full h-full border-y border-dashed overflow-hidden">
      <Warp
         
        className="absolute inset-0 h-full w-full z-0" 
        colors={["#00000000", "#8606fe"]}
        proportion={0.45}
        softness={2}
        distortion={0.25}
        swirl={0.8}
        swirlIterations={10}
        shape="checks"
        shapeScale={0.1}
        speed={1}
      />
      <div className="relative mx-auto shadow-xl grid h-full w-full max-w-4xl border-x border-dashed bg-background/80 md:grid-cols-2 backdrop-blur-xs">
        {/* Left Column: Details */}
        <div className="col-span-1 flex flex-col space-y-4 p-8 lg:p-10">
          <span className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Early Access
          </span>
          <h1 className="font-medium text-2xl tracking-wide md:text-3xl">
            Join the Waitlist
          </h1>
          <p className="max-w-md text-muted-foreground text-sm leading-relaxed md:text-base">
            Be among the first to experience our platform before everyone else.
          </p>
          <p className="max-w-md text-muted-foreground text-xs leading-relaxed md:text-sm">
            No spam. Early access only.
          </p>
          <div className="grid gap-2 pt-4">
            {waitlistInfo.map((info) => (
              <InfoItem key={info.label} {...info} />
            ))}
          </div>
        </div>

        {/* Right Column: Form */}
        <div className="col-span-1 flex items-center border-t border-dashed p-8 md:border-t-0 md:border-l">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}

function WaitlistForm() {
  const [form, setForm] = useState({
    firstName: "",
    email: "",
  });

  const [loading, setLoading] = useState(false);

  const [status, setStatus] = useState<{
    type: "success" | "error" | "";
    message: string;
  }>({
    type: "",
    message: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
  
    setLoading(true);
    setStatus({
      type: "",
      message: "",
    });
  
    try {
      const response = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          firstName: form.firstName,
          email: form.email,
        }),
      });
  
      const contentType = response.headers.get("content-type");
  
      let data;
  
      if (contentType?.includes("application/json")) {
        data = await response.json();
      } else {
        const text = await response.text();
        throw new Error(
          text || `Request failed with status ${response.status}`
        );
      }
  
      if (!response.ok) {
        throw new Error(data?.error || "Something went wrong.");
      }
  
      setStatus({
        type: "success",
        message:
          data?.message ||
          "🎉 You're on the waitlist! We'll notify you when we launch.",
      });
  
      setForm({
        firstName: "",
        email: "",
      });
    } catch (error) {
      console.error("Waitlist error:", error);
  
      setStatus({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-6">
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
 id="name"
 className="h-12 pl-6"
 placeholder="Arjun Vaidya"
 value={form.firstName}
 onChange={(e) =>
 setForm({
 ...form,
 firstName: e.target.value,
 })
 }
 />
        </Field>

        <Field>
          <FieldLabel htmlFor="email">Email Address</FieldLabel>
          <Input
 id="email"
 type="email"
 required
 className="h-12 pl-6"
 placeholder="contact@predict.fit"
 value={form.email}
 onChange={(e) =>
 setForm({
 ...form,
 email: e.target.value,
 })
 }
 />
        </Field>
      </FieldGroup>

      <Button nativeButton={false} type="submit" disabled={loading} size={"xl"} className="w-full">
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Joining...
          </>
        ) : (
          "Join Waitlist"
        )}
      </Button>

      {status.message && (
        <Alert
          className={
            status.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }
        >
          <AlertDescription>{status.message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}

type InfoItemProps = React.ComponentProps<"div"> & {
  icon: React.ReactNode;
  label: string;
  value: string;
};

function InfoItem({ icon, label, value, className, ...props }: InfoItemProps) {
  return (
    <div className={cn("flex items-center gap-3 py-3", className)} {...props}>
      <div className="rounded-full border bg-card p-3 [&_svg]:size-5">
        {icon}
      </div>
      <div>
        <p className="font-medium text-sm">{label}</p>
        <p className="text-muted-foreground text-xs">{value}</p>
      </div>
    </div>
  );
}