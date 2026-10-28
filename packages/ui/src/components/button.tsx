import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-xs/relaxed whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-2 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80 shadow-[inset_0_4px_6px_rgba(255,255,255,0.4),inset_0_-1px_8px_rgba(255,255,255,0.2)]",
        outline:
          "border-border hover:bg-border/20 hover:dark:bg-border/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground",
        outlineglass:
          "border-border hover:bg-border/20 hover:dark:bg-border/50 hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:shadow-[inset_0_-1px_8px_rgba(255,255,255,0.2)] shadow-[inset_0_-1px_8px_rgba(0,0,0,0.1)]",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground dark:shadow-[inset_0_-1px_8px_rgba(255,255,255,0.2)] shadow-[inset_0_-1px_8px_rgba(0,0,0,0.1)]",
        ghost:
          "hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground hover:bg-border/50 hover:dark:shadow-[inset_0_-1px_8px_rgba(255,255,255,0.2)] hover:shadow-[inset_0_-1px_8px_rgba(0,0,0,0.1)]",
        destructive:
          "bg-destructive text-primary-foreground hover:bg-destructive/80 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 shadow-[inset_0_4px_6px_rgba(255,255,255,0.2),inset_0_-1px_8px_rgba(255,255,255,0.2)]",
        link: "text-foreground underline-offset-4 hover:underline",
        invert: "bg-foreground text-background hover:bg-foreground/80 shadow-[inset_0_4px_6px_rgba(255,255,255,0.4),inset_0_-1px_8px_rgba(255,255,255,0.2)] dark:shadow-[inset_0_4px_6px_rgba(0,0,0,0.4),inset_0_-1px_8px_rgba(0,0,0,0.2)]",
      },
      size: {
        sm: "h-8 gap-1 px-5 text-xs has-data-[icon=inline-end]:pe-4 has-data-[icon=inline-start]:ps-4 [&_svg:not([class*='size-'])]:size-3",
        default:
          "h-10 gap-1 px-6 text-sm has-data-[icon=inline-end]:pe-5 has-data-[icon=inline-start]:ps-5 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-12 gap-2 px-7 text-md has-data-[icon=inline-end]:pe-6 has-data-[icon=inline-start]:ps-6 [&_svg:not([class*='size-'])]:size-5",
        "icon-sm": "size-8 [&_svg:not([class*='size-'])]:size-3",
        icon: "size-10 [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-12 [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
