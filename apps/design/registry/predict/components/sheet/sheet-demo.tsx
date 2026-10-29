"use client"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
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

export function SheetDemo() {
  return (
    <Sheet>
      <SheetTrigger render={<Button variant="outline" />}>Add a note</SheetTrigger>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Add a note</SheetTitle>
          <SheetDescription>
            Notes stay with this panel and show up in your report.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 px-6">
          <label className="grid gap-1.5 text-xs font-medium">
            Note
            <Input placeholder="Slept 5 hours before the draw" />
          </label>
        </div>
        <SheetFooter>
          <SheetClose render={<Button size="sm" />}>Save note</SheetClose>
          <SheetClose render={<Button variant="outline" size="sm" />}>Cancel</SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
