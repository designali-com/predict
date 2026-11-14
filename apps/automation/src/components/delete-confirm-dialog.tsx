"use client"
import { Button } from "@workspace/ui/components/button"

import { useEffect, useState } from "react"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { toast } from "@workspace/ui/components/sonner"
import { PredictSpinner } from "@/src/components/predict-loader"

interface DeleteConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => Promise<void>
}

const CONFIRM_WORD = "DELETE"

/** Type-to-confirm destructive-action dialog — used anywhere a delete
 * shouldn't be a single accidental click away. */
export function DeleteConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: DeleteConfirmDialogProps) {
  const [confirmText, setConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setConfirmText("")
      setError(null)
      setDeleting(false)
    }
  }, [open])

  const handleConfirm = async () => {
    setDeleting(true)
    setError(null)
    try {
      await onConfirm()
      toast.success("Deleted")
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete"
      setError(message)
      toast.error(message)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Type <span className="font-mono font-semibold text-foreground">{CONFIRM_WORD}</span> to confirm.
          </p>
          <input
            autoFocus
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={CONFIRM_WORD}
            onKeyDown={(e) => {
              if (e.key === "Enter" && confirmText === CONFIRM_WORD) handleConfirm()
            }}
            className="w-full rounded-md border border-border px-3 py-2 text-sm focus:border-red-400 focus:outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <DialogFooter>
          <Button
            type="button"
            onClick={() => onOpenChange(false)} variant="outline">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            disabled={confirmText !== CONFIRM_WORD || deleting} variant="destructive">
            {deleting && <PredictSpinner className="size-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
