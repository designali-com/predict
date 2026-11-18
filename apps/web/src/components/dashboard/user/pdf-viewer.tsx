"use client"

import { useState } from "react"
import { PredictSpinner } from "@/src/components/predict-loader"
import { Document, Page, pdfjs } from "react-pdf"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"

// Must be set in the same module that renders <Document>/<Page> — react-pdf
// bundles its own pdfjs-dist version, so the worker is loaded from a CDN
// pinned to that exact version to avoid a mismatch with the app's own
// top-level pdfjs-dist (used elsewhere for PDF text extraction).
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface PdfViewerProps {
  fileUrl: string
}

export function PdfViewer({ fileUrl }: PdfViewerProps) {
  const [numPages, setNumPages] = useState(0)
  const [error, setError] = useState<string | null>(null)

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="w-full overflow-x-auto">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages }) => setNumPages(numPages)}
          onLoadError={(err) => setError(err.message)}
          loading={
            <div className="flex items-center gap-2 py-16 text-sm text-dashboard-subheading">
              <PredictSpinner className="size-5" />
              Loading PDF…
            </div>
          }
          error={<p className="py-16 text-center text-sm text-red-500">Failed to load PDF.</p>}
          className="mx-auto flex w-fit flex-col gap-3"
        >
          {Array.from({ length: numPages }, (_, i) => (
            <Page
              key={i + 1}
              pageNumber={i + 1}
              width={720}
              className="overflow-hidden rounded-2xl border border-dashboard-card-border shadow-sm"
            />
          ))}
        </Document>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}