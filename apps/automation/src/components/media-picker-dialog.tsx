"use client"
import { Button } from "@workspace/ui/components/button"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useState } from "react"
import Link from "next/link"
import { FileText, PlayCircle } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"

export interface MediaAsset {
  id: string
  url: string
  fileName: string
  mimeType: string
  assetType: "image" | "video" | "document"
  sizeBytes: number | null
  createdAt: string
}

interface MediaPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelect: (asset: MediaAsset) => void
}

/** Popup used by the Templates form's "Choose from Stock" button — picking
 * an asset returns its URL to use as the WhatsApp template header media. */
export function MediaPickerDialog({ open, onOpenChange, onSelect }: MediaPickerDialogProps) {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch("/api/media")
      .then((res) => res.json())
      .then((data) => setAssets(data.assets ?? []))
      .finally(() => setLoading(false))
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Choose from Stock</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <PredictSpinner />
          </div>
        ) : assets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No files uploaded yet.{" "}
            <Link href="/stock" className="underline">
              Upload one in Stock
            </Link>
            .
          </p>
        ) : (
          <div className="grid max-h-96 grid-cols-3 gap-3 overflow-y-auto sm:grid-cols-4">
            {assets.map((asset) => (
              <Button
                key={asset.id}
                type="button"
                onClick={() => {
                  onSelect(asset)
                  onOpenChange(false)
                }} variant="outline" className="h-auto w-full justify-start whitespace-normal text-left group overflow-hidden text-left">
                <div className="flex aspect-square items-center justify-center bg-muted/5">
                  {asset.assetType === "image" ? (
                    <img src={asset.url} alt={asset.fileName} className="h-full w-full object-cover" />
                  ) : asset.assetType === "video" ? (
                    <div className="relative h-full w-full">
                      <video src={asset.url} className="h-full w-full object-cover" muted />
                      <PlayCircle className="absolute inset-0 m-auto h-6 w-6 text-primary-foreground drop-shadow" />
                    </div>
                  ) : (
                    <FileText className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <p className="truncate p-1.5 text-[11px]" title={asset.fileName}>
                  {asset.fileName}
                </p>
              </Button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
