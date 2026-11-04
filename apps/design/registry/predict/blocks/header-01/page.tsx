"use client"

import { MenuIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@workspace/ui/components/navigation-menu"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Logo } from "@workspace/ui/predict/logo"

const tests = [
  { title: "Full panel", href: "#", description: "40 biomarkers across every body system." },
  { title: "Heart health", href: "#", description: "Lipids, inflammation and blood pressure." },
  { title: "Hormones", href: "#", description: "Thyroid, cortisol and sex hormones." },
  { title: "Metabolic", href: "#", description: "Glucose, insulin and HbA1c." },
]

const links = [
  { title: "How it works", href: "#" },
  { title: "Pricing", href: "#" },
  { title: "Clinics", href: "#" },
]

export default function Page() {
  return (
    <div className="min-h-svh">
      <header className="sticky top-2 z-40 max-w-6xl mx-auto rounded-full border bg-background/40 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-2">
          <a href="#" className="shrink-0 pl-4">
            <Logo role="img" aria-label="PREDICT" className="h-5 size-24" />
          </a>

          <NavigationMenu className="hidden md:flex">
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger>Tests</NavigationMenuTrigger>
                <NavigationMenuContent>
                  <ul className="grid w-[480px] grid-cols-2 gap-1">
                    {tests.map((test) => (
                      <li key={test.title}>
                        <NavigationMenuLink
                          href={test.href}
                          className="flex-col items-start gap-1"
                        >
                          <span className="font-medium">{test.title}</span>
                          <span className="line-clamp-2 text-muted-foreground">
                            {test.description}
                          </span>
                        </NavigationMenuLink>
                      </li>
                    ))}
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
              {links.map((link) => (
                <NavigationMenuItem key={link.title}>
                  <NavigationMenuLink
                    href={link.href}
                    className={navigationMenuTriggerStyle()}
                  >
                    {link.title}
                  </NavigationMenuLink>
                </NavigationMenuItem>
              ))}
            </NavigationMenuList>
          </NavigationMenu>

          <div className="ms-auto hidden items-center gap-1 md:flex">
            <Button variant="ghost" size="sm" render={<a href="#" />}>
              Sign in
            </Button>
            <Button size="sm" render={<a href="#" />}>
              Book a test
            </Button>
          </div>

          <Sheet>
            <SheetTrigger
              render={<Button variant="ghost" size="icon-sm" className="ms-auto md:hidden" />}
            >
              <MenuIcon />
              <span className="sr-only">Open menu</span>
            </SheetTrigger>
            <SheetContent side="right">
              <SheetHeader>
                <SheetTitle>
                  <Logo role="img" aria-label="PREDICT" className="h-5 size-24" />
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1 px-6">
                <p className="pb-1 text-muted-foreground">Tests</p>
                {tests.map((test) => (
                  <a key={test.title} href={test.href} className="py-1.5 text-sm">
                    {test.title}
                  </a>
                ))}
                <Separator className="my-3" />
                {links.map((link) => (
                  <a key={link.title} href={link.href} className="py-1.5 text-sm">
                    {link.title}
                  </a>
                ))}
              </nav>
              <SheetFooter>
                <Button render={<a href="#" />}>Book a test</Button>
                <Button variant="outline" render={<a href="#" />}>
                  Sign in
                </Button>
              </SheetFooter>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="mx-auto flex h-screen max-w-6xl flex-col items-center gap-4 px-6 py-24 text-center">
        <h1 className="text-3xl font-medium tracking-tight">Understand your biology</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          40 biomarkers, read against healthy ranges and explained in plain words.
        </p>
      </main>
      <main className="mx-auto flex h-screen max-w-6xl flex-col items-center gap-4 px-6 py-24 text-center">
        <h1 className="text-3xl font-medium tracking-tight">Understand your biology</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          40 biomarkers, read against healthy ranges and explained in plain words.
        </p>
      </main>
    </div>
  )
}
