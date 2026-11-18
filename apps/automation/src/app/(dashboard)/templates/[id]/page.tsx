"use client"

import { PredictSpinner } from "@/src/components/predict-loader"
import { PageHeader } from "@workspace/ui/components/page-header"

import { use, useEffect, useState } from "react"

import { TemplateBuilder, type TemplateFormState } from "@/src/components/template-builder"

interface TemplateRow {
  key: string
  name: string
  channel: string
  category: string
  providerTemplateName: string | null
  wabaCategory: string | null
  language: string | null
  headerType: string | null
  headerText: string | null
  headerMediaUrl: string | null
  headerMediaType: string | null
  bodyText: string | null
  bodyExamples: unknown
  footerText: string | null
  ctaButtons: unknown
  submissionStatus: string
  rejectionReason: string | null
}

export default function EditTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [loading, setLoading] = useState(true)
  const [initial, setInitial] = useState<TemplateFormState | null>(null)
  const [status, setStatus] = useState<{ submissionStatus: string; rejectionReason: string | null } | null>(null)

  useEffect(() => {
    fetch(`/api/templates/${id}`)
      .then((res) => res.json())
      .then((data) => {
        const t: TemplateRow = data.template
        setInitial({
          key: t.key,
          name: t.name,
          channel: t.channel,
          category: t.category,
          providerTemplateName: t.providerTemplateName ?? "",
          wabaCategory: (t.wabaCategory as TemplateFormState["wabaCategory"]) ?? "UTILITY",
          language: t.language ?? "en_US",
          headerType: (t.headerType as TemplateFormState["headerType"]) ?? "NONE",
          headerText: t.headerText ?? "",
          headerMediaUrl: t.headerMediaUrl ?? "",
          headerMediaType: t.headerMediaType ?? "",
          bodyText: t.bodyText ?? "",
          bodyExamples: Array.isArray(t.bodyExamples) ? (t.bodyExamples as string[]) : [],
          footerText: t.footerText ?? "",
          ctaButtons: Array.isArray(t.ctaButtons) ? (t.ctaButtons as TemplateFormState["ctaButtons"]) : [],
        })
        setStatus({ submissionStatus: t.submissionStatus, rejectionReason: t.rejectionReason })
      })
      .finally(() => setLoading(false))
  }, [id])

  return (
    <div className="space-y-4">
      <PageHeader title="Edit Template" />

      {loading || !initial ? (
        <div className="flex justify-center py-16">
          <PredictSpinner />
        </div>
      ) : (
        <TemplateBuilder
          templateId={id}
          initial={initial}
          submissionStatus={status?.submissionStatus}
          rejectionReason={status?.rejectionReason}
        />
      )}
    </div>
  )
}
