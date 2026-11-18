import * as React from "react"
import { cn } from "cn"

interface AppGreetingProps extends React.ComponentProps<"header"> {
  greeting?: string
  name: string
  avatarSrc?: string
}

/** "Good Morning, Arjun Vaidya" header with the profile avatar on the right. */
function AppGreeting({
  greeting = "Good Morning,",
  name,
  avatarSrc,
  className,
  ...props
}: AppGreetingProps) {
  return (
    <header
      data-slot="app-greeting"
      className={cn("flex items-start justify-between px-[47px] pt-[51px]", className)}
      {...props}
    >
      <div className="text-app-foreground">
        <p className="text-base leading-[17px]">{greeting}</p>
        <h1 className="font-display text-[32px] leading-[38px] font-normal">{name}</h1>
      </div>
      <div className="size-[60px] shrink-0 overflow-hidden rounded-full border border-app-foreground bg-app-pill">
        {avatarSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarSrc} alt={name} className="size-full object-cover object-top" />
        ) : null}
      </div>
    </header>
  )
}

export { AppGreeting }
