"use client"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@workspace/ui/components/navigation-menu"

const tests = [
  { title: "Full panel", href: "#", description: "40 biomarkers across every body system." },
  { title: "Heart health", href: "#", description: "Lipids, inflammation and blood pressure." },
  { title: "Hormones", href: "#", description: "Thyroid, cortisol and sex hormones." },
  { title: "Metabolic", href: "#", description: "Glucose, insulin and HbA1c." },
]

const guides = [
  { title: "Preparing for a test", href: "#", description: "Fasting, hydration and what to bring." },
  { title: "Reading your results", href: "#", description: "What healthy ranges mean for you." },
  { title: "Retesting", href: "#", description: "How often to test and why it matters." },
]

export function NavigationMenuDemo() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Tests</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-80 grid-cols-2 gap-1">
              {tests.map((item) => (
                <ListItem key={item.title} {...item} />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Guides</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-60 gap-1">
              {guides.map((item) => (
                <ListItem key={item.title} {...item} />
              ))}
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink href="#" className={navigationMenuTriggerStyle()}>
            Pricing
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}

function ListItem({
  title,
  href,
  description,
}: {
  title: string
  href: string
  description: string
}) {
  return (
    <li>
      <NavigationMenuLink href={href} className="flex-col items-start gap-1">
        <span className="font-medium">{title}</span>
        <span className="line-clamp-2 text-muted-foreground">{description}</span>
      </NavigationMenuLink>
    </li>
  )
}
