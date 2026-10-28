"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"

export function SheetNoCloseButton() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>Review consent</SheetTrigger>
      <SheetContent side="bottom" showCloseButton={false}>
        <SheetHeader>
          <SheetTitle>Share data for research?</SheetTitle>
          <SheetDescription>
            Your results are anonymised before they leave PREDICT. You can opt out at
            any time.
          </SheetDescription>
        </SheetHeader>
        <SheetFooter>
          <SheetClose render={<Button size="sm" />}>Agree</SheetClose>
          <SheetClose render={<Button variant="outline" size="sm" />}>Not now</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
