"use client"

import { LogOut } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import { PredictMark } from "@workspace/ui/components/predict-loader"
import { authClient } from "@/src/lib/auth/auth-client"

export function FieldHeader({ userName }: { userName: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-black/12 bg-white/95 backdrop-blur dark:border-white/10 dark:bg-black/90">
      <div className="mx-auto flex h-14 w-full max-w-xl items-center gap-2 px-3">
        <PredictMark className="size-7" />
        <div className="min-w-0">
          <p className="text-sm font-bold leading-tight">Predict · My visits</p>
          <p className="truncate text-[11px] text-muted-foreground">{userName}</p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          onClick={async () => {
            await authClient.signOut()
            window.location.href = "/auth/login"
          }}
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </header>
  )
}
