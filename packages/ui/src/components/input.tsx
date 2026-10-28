
import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "cn"

type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "sm" | "default" | "lg"
}

function Input({
  className,
  type,
  size = "default",
  ...props
}: InputProps) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "w-full min-w-0 rounded-full border border-input bg-input/20 px-6 py-2 text-sm transition-colors outline-none file:inline-flex file:border-0 file:bg-transparent file:text-xs/relaxed file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        size === "sm"
          ? "h-8 px-4 text-xs"
          : size === "lg"
            ? "h-12 px-6 text-sm"
            : "h-10 px-5 text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Input }
