import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { AppGlow } from "@workspace/ui/predict/app/app-glow"
import { PredictMark } from "@workspace/ui/predict/logo"

import { Screen } from "../screen"

export const title = "Create account"

const fields = [
  { name: "name", placeholder: "Name", type: "text", autoComplete: "name" },
  { name: "email", placeholder: "Email", type: "email", autoComplete: "email" },
  { name: "phone", placeholder: "Phone number", type: "tel", autoComplete: "tel" },
  { name: "password", placeholder: "Password", type: "password", autoComplete: "new-password" },
]

// Figma: iPhone 18 Pro - 123 (1733:1964)
export default function Auth07() {
  return (
    <Screen className="items-center">
      <AppGlow variant="blob" />

      <PredictMark className="relative mt-[82px] h-[72px] w-16 text-app-accent" />

      <h1 className="relative mt-[74px] font-display text-[40px] leading-[52px] font-normal">
        Get started
      </h1>
      <p className="relative text-base leading-[19px]">Your journey starts with here</p>

      <form className="relative mt-14 flex w-[290px] flex-col gap-2">
        {fields.map((field) => (
          <Input
            key={field.name}
            size="lg"
            aria-label={field.placeholder}
            {...field}
            className="border-app-border bg-transparent text-app-foreground placeholder:text-app-foreground/40"
          />
        ))}
        <Button type="button" variant="app" size="lg" className="w-full text-base">
          Create account
        </Button>
      </form>

      <p className="relative mt-[95px] flex gap-1.5 text-base leading-[19px] text-white">
        Already have an account?
        <a href="#" className="underline">
          login
        </a>
      </p>

      <p className="relative mt-[54px] w-[290px] text-center text-base leading-[19px] text-white">
        By continuing, you agree to our
        <br />
        <a href="#" className="underline">
          Terms of Service
        </a>{" "}
        and{" "}
        <a href="#" className="underline">
          Privacy Policy.
        </a>
      </p>
    </Screen>
  )
}
