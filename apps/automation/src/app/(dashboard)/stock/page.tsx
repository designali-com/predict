"use client"

import { PredictSpinner } from "@/src/components/predict-loader"

import { useEffect, useRef, useState } from "react"
import { Upload, FileText, PlayCircle, Trash2, Copy, Check } from "lucide-react"
import { toast } from "@workspace/ui/components/sonner"
import { Button } from "@workspace/ui/components/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@workspace/ui/components/dialog"
import { PageHeader } from "@workspace/ui/components/page-header"

interface MediaAsset {
  id: string
  url: string
  fileName: string
  mimeType: string
  assetType: "image" | "video" | "document"
  sizeBytes: number | null
  createdAt: string
}

function formatSize(bytes: number | null): string {
  if (!bytes) return ""
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function StockPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<MediaAsset | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = () => {
    setLoading(true)
    fetch("/api/media")
      .then((res) => res.json())
      .then((data) => setAssets(data.assets ?? []))
      .finally(() => setLoading(false))
  }

  useEffect(load, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await fetch("/api/media", { method: "POST", body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Upload failed")
      toast.success("File uploaded")
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed")
      toast.error(err instanceof Error ? err.message : "Upload failed")
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/media/${id}`, { method: "DELETE" })
    if (res.ok) toast.success("File deleted")
    else {
      const data = await res.json().catch(() => null)
      toast.error(data?.error ?? "Couldn't delete the file")
    }
    setAssets((prev) => prev.filter((a) => a.id !== id))
  }

  const handleCopy = async (asset: MediaAsset) => {
    await navigator.clipboard.writeText(asset.url)
    setCopiedId(asset.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title="Stock"
        description="Images, videos and PDFs available to attach to WhatsApp templates."
        actions={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,application/pdf"
              hidden
              onChange={handleUpload}
            />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              {uploading ? <PredictSpinner className="size-4" /> : <Upload />}
              Upload
            </Button>
          </>
        }
      />

      {error && <p className="text-sm text-red-500">{error}</p>}

      {loading ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : assets.length === 0 ? (
        <p className="rounded-md border border-border p-6 text-center text-sm text-muted-foreground">
          No files uploaded yet. Upload an image, video, or PDF to use in a template.
        </p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10">
          {assets.map((asset) => (
            <div key={asset.id} className="overflow-hidden rounded-md border border-border">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setPreview(asset)}
                className="h-auto w-full rounded-none p-0"
                aria-label={`Preview ${asset.fileName}`}
              >
                <span className="relative flex aspect-square w-full items-center justify-center bg-muted/5">
                  {asset.assetType === "image" ? (
                    <img src={asset.url} alt="" className="h-full w-full object-cover" />
                  ) : asset.assetType === "video" ? (
                    <>
                      <video src={asset.url} className="h-full w-full object-cover" muted preload="metadata" />
                      <PlayCircle className="absolute inset-0 m-auto h-6 w-6 text-white drop-shadow" />
                    </>
                  ) : (
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  )}
                </span>
              </Button>

              <div className="px-1.5 py-1">
                <p className="truncate text-[10px] font-medium" title={asset.fileName}>
                  {asset.fileName}
                </p>
                <div className="mt-0.5 flex items-center justify-between gap-1">
                  <span className="truncate text-[10px] text-muted-foreground">{formatSize(asset.sizeBytes)}</span>
                  <span className="flex shrink-0 items-center">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleCopy(asset)}
                      aria-label="Copy link"
                      title="Copy link"
                    >
                      {copiedId === asset.id ? <Check /> : <Copy />}
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      onClick={() => handleDelete(asset.id)}
                      aria-label="Delete"
                      title="Delete"
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 />
                    </Button>
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{preview?.fileName}</DialogTitle>
          </DialogHeader>
          {preview?.assetType === "image" && (
            <img
              src={preview.url}
              alt={preview.fileName}
              className="max-h-[75vh] w-full rounded-md object-contain"
            />
          )}
          {preview?.assetType === "video" && (
            <video
              key={preview.id}
              src={preview.url}
              controls
              autoPlay
              className="max-h-[75vh] w-full rounded-md bg-black"
            />
          )}
          {preview?.assetType === "document" && (
            <iframe title={preview.fileName} src={preview.url} className="h-[75vh] w-full rounded-md border border-border" />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
