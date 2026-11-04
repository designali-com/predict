"use client"

import { CalendarIcon, FileTextIcon, HeartPulseIcon, SettingsIcon } from "lucide-react"

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@workspace/ui/components/navigation-menu"

export function NavigationMenuWithIcon() {
  return (
    <NavigationMenu>
      <NavigationMenuList>
        <NavigationMenuItem>
          <NavigationMenuTrigger>Account</NavigationMenuTrigger>
          <NavigationMenuContent>
            <ul className="grid w-48">
              <li>
                <NavigationMenuLink href="#">
                  <HeartPulseIcon />
                  Biomarkers
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="#">
                  <FileTextIcon />
                  Reports
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="#">
                  <CalendarIcon />
                  Bookings
                </NavigationMenuLink>
              </li>
              <li>
                <NavigationMenuLink href="#">
                  <SettingsIcon />
                  Settings
                </NavigationMenuLink>
              </li>
            </ul>
          </NavigationMenuContent>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  )
}
