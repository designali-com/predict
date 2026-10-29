"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"

export function DialogDemo() {
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="outline" />}>
        Edit profile
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit profile</DialogTitle>
          <DialogDescription>
            Reference ranges use your age and sex. Keep them current.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="grid gap-1.5 text-xs font-medium">
            Name
            <Input defaultValue="Alex Morgan" />
          </label>
          <label className="grid gap-1.5 text-xs font-medium">
            Date of birth
            <Input type="date" defaultValue="1994-05-12" />
          </label>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <DialogClose render={<Button />}>Save</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
