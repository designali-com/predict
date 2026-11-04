"use client"

import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  navigationMenuTriggerStyle,
} from "@workspace/ui/components/navigation-menu"

const links = ["How it works", "Pricing", "Clinics"]

export function NavigationMenuLinks() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        {links.map((link, index) => (
          <NavigationMenuItem key={link}>
            <NavigationMenuLink
              href="#"
              active={index === 0}
              className={navigationMenuTriggerStyle()}
            >
              {link}
            </NavigationMenuLink>
          </NavigationMenuItem>
        ))}
      </NavigationMenuList>
    </NavigationMenu>
  )
}
