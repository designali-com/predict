"use client"

import { Button } from "@workspace/ui/components/button"

import { useState, useEffect, useRef } from "react"
import { X, CheckCircle2, AlertCircle, Trash2 } from "lucide-react"
import { PredictSpinner } from "@/src/components/predict-loader"

interface DeleteUserModalProps {
  open: boolean
  userId: string | null
  userName: string | null
  onClose: () => void
  onSuccess: () => void
}

type Status = "idle" | "loading" | "success" | "error"

const CONFIRM_TEXT = "DELETE"

export function DeleteUserModal({
  open,
  userId,
  userName,
  onClose,
  onSuccess,
}: DeleteUserModalProps) {
  const [confirmText, setConfirmText] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setConfirmText("")
      setStatus("idle")
      setErrorMsg("")
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open, userId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open || !userId) return null

  async function handleDelete() {
    setStatus("loading")
    setErrorMsg("")

    try {
      const res = await fetch(`/api/superadmin/users/${userId}`, {
        method: "DELETE",
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to delete user")
      }

      setStatus("success")
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 800)
    } catch (err: any) {
      setStatus("error")
      setErrorMsg(err.message || "Something went wrong")
    }
  }

  const canDelete = confirmText === CONFIRM_TEXT && status !== "loading" && status !== "success"

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-md overflow-hidden rounded-md border border-black/22 bg-white text-black dark:border-white/15 dark:bg-black dark:text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-center justify-between border-b border-black/18 px-6 py-5 dark:border-white/10">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10 text-red-500">
                <Trash2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-black dark:text-white">
                  Delete User
                </h2>
                <p className="mt-0.5 text-xs text-black/65 dark:text-white/45">
                  This cannot be undone
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon-sm"
 onClick={onClose}

 >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="relative flex flex-col gap-4 p-6">
            <p className="text-sm text-black/70 dark:text-white/60">
              You&apos;re about to permanently delete{" "}
              <span className="font-semibold text-black dark:text-white">{userName}</span>
              &apos;s account and all associated data. Type{" "}
              <span className="font-mono font-semibold">{CONFIRM_TEXT}</span> to confirm.
            </p>

            <div className="flex flex-col gap-1.5">
              <input
                ref={inputRef}
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={CONFIRM_TEXT}
                className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 font-mono text-sm text-black placeholder-black/25 outline-none transition focus:border-red-500/50 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder-white/25 dark:focus:border-red-500/50"
              />
            </div>

            {status === "error" && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {status === "success" && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                User deleted
              </div>
            )}

            <div className="mt-2 flex gap-2">
              <Button variant="outline" size="lg" className="flex-1 text-black hover:bg-black/5 dark:text-white dark:hover:bg-white/5"
 type="button"
 onClick={onClose}

 >
                Cancel
              </Button>
              <Button variant="destructive" size="lg" className="flex-1 text-white"
 type="button"
 onClick={handleDelete}
 disabled={!canDelete}

 >
                {status === "loading" ? (
                  <>
                    <PredictSpinner className="size-4" />
                    Deleting…
                  </>
                ) : status === "success" ? (
                  <>
                    <CheckCircle2 className="h-4 w-4" />
                    Deleted
                  </>
                ) : (
                  "Delete User"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
