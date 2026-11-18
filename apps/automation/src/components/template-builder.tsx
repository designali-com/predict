"use client"
import { Button } from "@workspace/ui/components/button"

import { useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Save,
  Plus,
  Trash2,
  ImagePlus,
  X,
  FileText,
  PlayCircle,
  ExternalLink,
  Phone,
  Reply,
  CheckCircle2,
  Clock,
  XCircle,
  Bold,
  Italic,
  Smile,
  ChevronLeft,
  Video,
  MoreVertical,
  Mic,
  Camera,
  Paperclip,
} from "lucide-react"
import { MediaPickerDialog, type MediaAsset } from "@/src/components/media-picker-dialog"
import { toast } from "@workspace/ui/components/sonner"
import {
  slugifyTemplateName,
  extractPlaceholders,
  type WabaCategory,
  type HeaderType,
  type ButtonType,
  type TemplateButton,
} from "@/src/lib/whatsapp-templates"
import { PredictSpinner } from "@/src/components/predict-loader"

const LANGUAGES = [
  { code: "en_US", label: "English (US)" },
  { code: "en_GB", label: "English (UK)" },
  { code: "hi", label: "Hindi" },
  { code: "es", label: "Spanish" },
  { code: "pt_BR", label: "Portuguese (BR)" },
  { code: "ar", label: "Arabic" },
  { code: "fr", label: "French" },
]

const MAX_BUTTONS = 3
const HEADER_TEXT_LIMIT = 60
const FOOTER_TEXT_LIMIT = 60
const BODY_TEXT_LIMIT = 1024
const BUTTON_TEXT_LIMIT = 25

export interface TemplateFormState {
  key: string
  name: string
  channel: string
  category: string
  providerTemplateName: string
  wabaCategory: WabaCategory
  language: string
  headerType: HeaderType
  headerText: string
  headerMediaUrl: string
  headerMediaType: string
  bodyText: string
  bodyExamples: string[]
  footerText: string
  ctaButtons: TemplateButton[]
}

export const EMPTY_TEMPLATE_FORM: TemplateFormState = {
  key: "",
  name: "",
  channel: "whatsapp",
  category: "transactional",
  providerTemplateName: "",
  wabaCategory: "UTILITY",
  language: "en_US",
  headerType: "NONE",
  headerText: "",
  headerMediaUrl: "",
  headerMediaType: "",
  bodyText: "",
  bodyExamples: [],
  footerText: "",
  ctaButtons: [],
}

interface TemplateBuilderProps {
  templateId?: string
  initial?: TemplateFormState
  submissionStatus?: string
  rejectionReason?: string | null
}

export function TemplateBuilder({ templateId, initial, submissionStatus, rejectionReason }: TemplateBuilderProps) {
  const router = useRouter()
  const [form, setForm] = useState<TemplateFormState>(initial ?? EMPTY_TEMPLATE_FORM)
  const [nameManuallyEdited, setNameManuallyEdited] = useState(Boolean(initial?.providerTemplateName))
  const [pickerOpen, setPickerOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [emojiPickerOpen, setEmojiPickerOpen] = useState(false)
  const bodyRef = useRef<HTMLTextAreaElement>(null)

  const placeholders = useMemo(() => extractPlaceholders(form.bodyText), [form.bodyText])

  useEffect(() => {
    // Keep bodyExamples array in sync with the number of {{n}} placeholders.
    setForm((prev) => {
      const next = placeholders.map((_, i) => prev.bodyExamples[i] ?? "")
      if (next.length === prev.bodyExamples.length && next.every((v, i) => v === prev.bodyExamples[i])) {
        return prev
      }
      return { ...prev, bodyExamples: next }
    })
  }, [placeholders])

  const set = <K extends keyof TemplateFormState>(key: K, value: TemplateFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleNameChange = (value: string) => {
    set("name", value)
    if (!nameManuallyEdited) set("providerTemplateName", slugifyTemplateName(value))
  }

  const addButton = () => {
    if (form.ctaButtons.length >= MAX_BUTTONS) return
    set("ctaButtons", [...form.ctaButtons, { type: "QUICK_REPLY", text: "" }])
  }

  const updateButton = (index: number, patch: Partial<TemplateButton>) => {
    set(
      "ctaButtons",
      form.ctaButtons.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    )
  }

  const removeButton = (index: number) => {
    set("ctaButtons", form.ctaButtons.filter((_, i) => i !== index))
  }

  const handleSelectMedia = (asset: MediaAsset) => {
    setForm((prev) => ({ ...prev, headerMediaUrl: asset.url, headerMediaType: asset.assetType }))
  }

  // WhatsApp's own formatting markers — *bold*, _italic_ — wrapped around
  // whatever's selected in the Body textarea (or a placeholder word if
  // nothing's selected), same as tapping Bold/Italic in the WhatsApp app.
  const wrapBodySelection = (marker: string) => {
    const el = bodyRef.current
    if (!el) return
    const { selectionStart, selectionEnd, value } = el
    const selected = value.slice(selectionStart, selectionEnd) || "text"
    const next = `${value.slice(0, selectionStart)}${marker}${selected}${marker}${value.slice(selectionEnd)}`
    set("bodyText", next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selectionStart + marker.length, selectionStart + marker.length + selected.length)
    })
  }

  const insertIntoBody = (text: string) => {
    const el = bodyRef.current
    if (!el) {
      set("bodyText", form.bodyText + text)
      return
    }
    const { selectionStart, selectionEnd, value } = el
    const next = value.slice(0, selectionStart) + text + value.slice(selectionEnd)
    set("bodyText", next)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(selectionStart + text.length, selectionStart + text.length)
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    setNotice(null)

    try {
      const res = await fetch(templateId ? `/api/templates/${templateId}` : "/api/templates", {
        method: templateId ? "PUT" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to save template")

      if (data.metaSubmission?.submitted) {
        setNotice("Saved and submitted to WhatsApp for approval.")
        toast.success("Template submitted to Meta")
      } else if (data.metaSubmission?.error && form.channel === "whatsapp") {
        setNotice(`Saved as draft — not submitted to WhatsApp (${data.metaSubmission.error}).`)
        toast.warning(`Template saved as draft — not submitted to Meta (${data.metaSubmission.error})`)
      } else {
        toast.success("Template saved")
      }

      router.push("/templates")
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save template"
      setError(message)
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const inputClass =
    "w-full rounded-md border border-border px-3 py-2 text-sm focus:border-ring focus:outline-none"
  const labelClass = "mb-1 block text-xs font-medium text-muted-foreground"

  const isWhatsapp = form.channel === "whatsapp"

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      {/* Form */}
      <div className="space-y-5">
        {submissionStatus && submissionStatus !== "draft" && (
          <StatusBanner status={submissionStatus} rejectionReason={rejectionReason} />
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelClass}>Internal Key</label>
            <input
              placeholder="e.g. welcome_new_patient"
              value={form.key}
              onChange={(e) => set("key", e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Channel</label>
            <select value={form.channel} onChange={(e) => set("channel", e.target.value)} className={inputClass}>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Email</option>
              <option value="sms">SMS</option>
              <option value="push">Push</option>
              <option value="voice">Voice</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Display Name</label>
            <input
              placeholder="e.g. Welcome New Patient"
              value={form.name}
              onChange={(e) => handleNameChange(e.target.value)}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Consent Category (internal)</label>
            <select value={form.category} onChange={(e) => set("category", e.target.value)} className={inputClass}>
              <option value="marketing">Marketing</option>
              <option value="appointmentReminders">Appointment reminders</option>
              <option value="medicalReminders">Medical reminders</option>
              <option value="transactional">Transactional</option>
            </select>
          </div>
        </div>

        {isWhatsapp && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelClass}>WhatsApp Template Name</label>
                <input
                  value={form.providerTemplateName}
                  onChange={(e) => {
                    setNameManuallyEdited(true)
                    set("providerTemplateName", slugifyTemplateName(e.target.value))
                  }}
                  className={inputClass}
                />
                <p className="mt-1 text-[10px] text-muted-foreground">lowercase, underscores only</p>
              </div>
              <div>
                <label className={labelClass}>WABA Category</label>
                <select
                  value={form.wabaCategory}
                  onChange={(e) => set("wabaCategory", e.target.value as WabaCategory)}
                  className={inputClass}
                >
                  <option value="UTILITY">Utility</option>
                  <option value="MARKETING">Marketing</option>
                  <option value="AUTHENTICATION">Authentication</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Language</label>
                <select value={form.language} onChange={(e) => set("language", e.target.value)} className={inputClass}>
                  {LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Header */}
            <div className="rounded-md border border-border p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Header (optional)</p>
              <select
                value={form.headerType}
                onChange={(e) => set("headerType", e.target.value as HeaderType)}
                className={`${inputClass} mb-2`}
              >
                <option value="NONE">None</option>
                <option value="TEXT">Text</option>
                <option value="IMAGE">Image</option>
                <option value="VIDEO">Video</option>
                <option value="DOCUMENT">Document</option>
              </select>

              {form.headerType === "TEXT" && (
                <div>
                  <input
                    placeholder="Header text"
                    maxLength={HEADER_TEXT_LIMIT}
                    value={form.headerText}
                    onChange={(e) => set("headerText", e.target.value)}
                    className={inputClass}
                  />
                  <p className="mt-1 text-right text-[10px] text-muted-foreground">
                    {form.headerText.length}/{HEADER_TEXT_LIMIT}
                  </p>
                </div>
              )}

              {(form.headerType === "IMAGE" || form.headerType === "VIDEO" || form.headerType === "DOCUMENT") &&
                (form.headerMediaUrl ? (
                  <div className="flex items-center gap-2 rounded-md border border-border p-2">
                    <span className="flex-1 truncate text-xs text-muted-foreground">{form.headerMediaUrl}</span>
                    <Button
                      type="button"
                      onClick={() => set("headerMediaUrl", "")} variant="destructive">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    onClick={() => setPickerOpen(true)} variant="outline">
                    <ImagePlus className="h-4 w-4" />
                    Choose from Stock
                  </Button>
                ))}
            </div>

            {/* Body */}
            <div className="rounded-md border border-border p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Body</p>
                <Button
                  type="button"
                  onClick={() => set("bodyText", `${form.bodyText}{{${placeholders.length + 1}}}`)} size="sm" variant="ghost">
                  + Insert variable
                </Button>
              </div>

              <div className="mb-1.5 flex items-center gap-1">
                <Button
                  type="button"
                  onClick={() => wrapBodySelection("*")}
                  title="Bold" variant="ghost">
                  <Bold className="h-3.5 w-3.5" />
                </Button>
                <Button
                  type="button"
                  onClick={() => wrapBodySelection("_")}
                  title="Italic" variant="ghost">
                  <Italic className="h-3.5 w-3.5" />
                </Button>
                <div className="relative">
                  <Button
                    type="button"
                    onClick={() => setEmojiPickerOpen((v) => !v)}
                    title="Emoji" variant="ghost">
                    <Smile className="h-3.5 w-3.5" />
                  </Button>
                  {emojiPickerOpen && (
                    <EmojiPicker
                      onPick={(emoji) => insertIntoBody(emoji)}
                      onClose={() => setEmojiPickerOpen(false)}
                    />
                  )}
                </div>
              </div>

              <textarea
                ref={bodyRef}
                rows={5}
                maxLength={BODY_TEXT_LIMIT}
                placeholder="Hi {{1}}, your report is ready to view."
                value={form.bodyText}
                onChange={(e) => set("bodyText", e.target.value)}
                className={`${inputClass} resize-none`}
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                {form.bodyText.length}/{BODY_TEXT_LIMIT}
              </p>

              {placeholders.length > 0 && (
                <div className="mt-2 space-y-2">
                  <p className="text-[11px] font-medium text-muted-foreground">Example values (shown to Meta for review)</p>
                  {placeholders.map((n, i) => (
                    <input
                      key={n}
                      placeholder={`Example for {{${n}}}`}
                      value={form.bodyExamples[i] ?? ""}
                      onChange={(e) => {
                        const next = [...form.bodyExamples]
                        next[i] = e.target.value
                        set("bodyExamples", next)
                      }}
                      className={inputClass}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div>
              <label className={labelClass}>Footer (optional)</label>
              <input
                placeholder="e.g. Predict Health"
                maxLength={FOOTER_TEXT_LIMIT}
                value={form.footerText}
                onChange={(e) => set("footerText", e.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                {form.footerText.length}/{FOOTER_TEXT_LIMIT}
              </p>
            </div>

            {/* Buttons */}
            <div className="rounded-md border border-border p-4">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Buttons ({form.ctaButtons.length}/{MAX_BUTTONS})
                </p>
                {form.ctaButtons.length < MAX_BUTTONS && (
                  <Button
                    type="button"
                    onClick={addButton} size="sm" variant="ghost">
                    <Plus className="h-3.5 w-3.5" />
                    Add button
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                {form.ctaButtons.map((button, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      value={button.type}
                      onChange={(e) => updateButton(i, { type: e.target.value as ButtonType })}
                      className={`${inputClass} w-40`}
                    >
                      <option value="QUICK_REPLY">Quick Reply</option>
                      <option value="URL">Visit Website</option>
                      <option value="PHONE_NUMBER">Call Phone</option>
                    </select>
                    <input
                      placeholder="Button text"
                      maxLength={BUTTON_TEXT_LIMIT}
                      value={button.text}
                      onChange={(e) => updateButton(i, { text: e.target.value })}
                      className={inputClass}
                    />
                    {button.type === "URL" && (
                      <input
                        placeholder="https://..."
                        value={button.url ?? ""}
                        onChange={(e) => updateButton(i, { url: e.target.value })}
                        className={inputClass}
                      />
                    )}
                    {button.type === "PHONE_NUMBER" && (
                      <input
                        placeholder="+91..."
                        value={button.phoneNumber ?? ""}
                        onChange={(e) => updateButton(i, { phoneNumber: e.target.value })}
                        className={inputClass}
                      />
                    )}
                    <Button
                      type="button"
                      onClick={() => removeButton(i)} variant="destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {error && <p className="text-sm text-red-500">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}

        <Button
          onClick={handleSave}
          disabled={saving}>
          {saving ? <PredictSpinner className="size-4" /> : <Save className="h-4 w-4" />}
          {isWhatsapp ? "Save & Submit for Approval" : "Save Template"}
        </Button>
      </div>

      {/* Live preview */}
      {isWhatsapp && (
        <div className="sticky top-4 self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preview</p>
          <WhatsAppPreview form={form} placeholders={placeholders} />
        </div>
      )}

      <MediaPickerDialog open={pickerOpen} onOpenChange={setPickerOpen} onSelect={handleSelectMedia} />
    </div>
  )
}

function StatusBanner({ status, rejectionReason }: { status: string; rejectionReason?: string | null }) {
  if (status === "approved") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
        <CheckCircle2 className="h-4 w-4" /> Approved by WhatsApp
      </div>
    )
  }
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
        <XCircle className="h-4 w-4" /> Rejected{rejectionReason ? `: ${rejectionReason}` : ""}
      </div>
    )
  }
  return (
    <div className="flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-700">
      <Clock className="h-4 w-4" /> Pending WhatsApp approval — editing will resubmit it.
    </div>
  )
}

const EMOJI_LIST = [
  "😀", "😁", "😂", "🙂", "😊", "😍", "🥰", "😘", "😉", "😎",
  "🤔", "😢", "😞", "😟", "😴", "🤒", "🤕", "😷", "🙏", "👍",
  "👎", "👏", "🙌", "💪", "🤝", "👋", "❤️", "💙", "💚", "✅",
  "❌", "⭐", "🌟", "🎉", "🎂", "🎁", "📅", "⏰", "📍", "📞",
  "💬", "📩", "📝", "📄", "📷", "🩺", "💊", "🏥", "🔥", "✨",
]

function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute left-0 top-full z-20 mt-1 grid w-64 grid-cols-8 gap-0.5 rounded-md border border-border bg-card p-2 shadow-lg">
        {EMOJI_LIST.map((emoji) => (
          <Button
            key={emoji}
            type="button"
            onClick={() => {
              onPick(emoji)
              onClose()
            }} variant="ghost" className="text-lg">
            {emoji}
          </Button>
        ))}
      </div>
    </>
  )
}

// WhatsApp's own inline formatting markers: *bold*, _italic_, ~strike~, and
// ```monospace``` — rendered the same way in this preview as WhatsApp
// itself renders them, so what staff see here matches what the patient's
// phone will actually show.
function renderWhatsAppText(text: string): React.ReactNode {
  return text.split("\n").map((line, lineIndex, lines) => (
    <span key={lineIndex}>
      {line
        .split(/(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`\n]+```)/g)
        .map((part, i) => {
          if (part.startsWith("```") && part.endsWith("```") && part.length > 6) {
            return (
              <code key={i} className="rounded bg-black/5 px-1 font-mono text-[13px] text-[#111b21]">
                {part.slice(3, -3)}
              </code>
            )
          }
          if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
            return <strong key={i}>{part.slice(1, -1)}</strong>
          }
          if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
            return <em key={i}>{part.slice(1, -1)}</em>
          }
          if (part.startsWith("~") && part.endsWith("~") && part.length > 2) {
            return <s key={i}>{part.slice(1, -1)}</s>
          }
          return part
        })}
      {lineIndex < lines.length - 1 && <br />}
    </span>
  ))
}

function fillExamples(bodyText: string, placeholders: number[], examples: string[]): string {
  let result = bodyText
  placeholders.forEach((n, i) => {
    const value = examples[i]?.trim()
    result = result.replaceAll(`{{${n}}}`, value ? value : `[${n}]`)
  })
  return result
}

function ButtonIcon({ type }: { type: ButtonType }) {
  if (type === "URL") return <ExternalLink className="h-3.5 w-3.5" />
  if (type === "PHONE_NUMBER") return <Phone className="h-3.5 w-3.5" />
  return <Reply className="h-3.5 w-3.5" />
}

/** The signed-in clinic's name, as the WhatsApp contact the patient sees. Fetched once per page. */
let clinicNameCache: Promise<string | null> | null = null
function useClinicName(): string | null {
  const [name, setName] = useState<string | null>(null)
  useEffect(() => {
    clinicNameCache ??= fetch("/api/clinics")
      .then((r) => r.json())
      .then((d: { active?: { name?: string } }) => d.active?.name ?? null)
      .catch(() => null)
    let live = true
    void clinicNameCache.then((n) => live && setName(n))
    return () => {
      live = false
    }
  }, [])
  return name
}

export function WhatsAppPreview({
  form,
  placeholders,
  className,
}: {
  form: TemplateFormState
  placeholders: number[]
  className?: string
}) {
  const bodyPreview = fillExamples(form.bodyText, placeholders, form.bodyExamples) || "Your message body will appear here."
  const businessName = useClinicName() ?? "Your clinic"
  const initials =
    businessName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "WA"

  return (
    <div className={`mx-auto w-full max-w-[320px] overflow-hidden rounded-[28px] border-8 border-black bg-[#008069] shadow-xl ${className ?? ""}`}>
      <div className="overflow-hidden rounded-[20px] bg-white text-[#111b21]">
        {/* Phone status bar */}
        <div className="flex items-center justify-between bg-[#008069] px-4 pt-2 pb-0.5 text-[10px] font-medium text-white">
          <span>9:41</span>
          <div className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-[1px] border border-white/80" />
            <span className="h-2 w-2 rounded-full border border-white/80" />
          </div>
        </div>

        {/* WhatsApp contact bar */}
        <div className="flex items-center gap-2 bg-[#008069] px-2 py-2 text-white">
          <ChevronLeft className="h-5 w-5 shrink-0" />
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-xs font-semibold">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium leading-tight">{businessName}</p>
            <p className="truncate text-[10.5px] leading-tight text-white/75">WhatsApp Business</p>
          </div>
          <Video className="h-4 w-4 shrink-0" />
          <Phone className="h-4 w-4 shrink-0" />
          <MoreVertical className="h-4 w-4 shrink-0" />
        </div>

        {/* Chat area */}
        <div
          className="h-[min(420px,55vh)] overflow-y-auto overscroll-contain p-3 [scrollbar-width:thin]"
          style={{
            backgroundColor: "#e5ddd5",
            backgroundImage:
              "radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px), radial-gradient(rgba(0,0,0,0.035) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
            backgroundPosition: "0 0, 12px 12px",
          }}
        >
          <div className="relative mr-auto max-w-[88%]">
            <span
              className="absolute -left-[7px] top-0 h-0 w-0"
              style={{
                borderTop: "8px solid #fff",
                borderLeft: "8px solid transparent",
              }}
            />
            <div className="overflow-hidden rounded-lg rounded-tl-none bg-white text-[#111b21] shadow-sm">
              {form.headerType === "IMAGE" &&
                (form.headerMediaUrl ? (
                  <img src={form.headerMediaUrl} alt="" className="h-36 w-full object-cover" />
                ) : (
                  <div className="flex h-28 items-center justify-center bg-[#f0f2f5] text-[#667781]">
                    <ImagePlus className="h-7 w-7" />
                  </div>
                ))}
              {form.headerType === "VIDEO" &&
                (form.headerMediaUrl ? (
                  <div className="relative bg-black">
                    <video src={form.headerMediaUrl} controls playsInline preload="metadata" className="max-h-52 w-full" />
                  </div>
                ) : (
                  <div className="relative flex h-28 items-center justify-center bg-[#1f2c34] text-white">
                    <PlayCircle className="h-7 w-7" />
                  </div>
                ))}
              {form.headerType === "DOCUMENT" && (
                <div className="flex h-14 items-center gap-2 bg-[#f0f2f5] px-3 text-[#667781]">
                  <FileText className="h-5 w-5 shrink-0 text-red-500" />
                  <span className="truncate text-xs">
                    {form.headerMediaUrl
                      ? decodeURIComponent(form.headerMediaUrl.split("?")[0]!.split("/").pop() ?? "").replace(/^[a-f0-9]{16}-/i, "")
                      : "Document"}
                  </span>
                </div>
              )}

              <div className="p-2.5">
                {form.headerType === "TEXT" && form.headerText && (
                  <p className="mb-1 text-[13px] font-semibold text-[#111b21]">{form.headerText}</p>
                )}
                <p className="whitespace-pre-wrap text-[12.5px] leading-[17px] text-[#111b21]">
                  {renderWhatsAppText(bodyPreview)}
                </p>
                {form.footerText && <p className="mt-1.5 text-[10.5px] text-[#667781]">{form.footerText}</p>}
                <p className="mt-1 text-right text-[10px] text-[#667781]">12:00 PM</p>
              </div>

              {form.ctaButtons.length > 0 && (
                <div className="divide-y divide-black/10 border-t border-black/10">
                  {form.ctaButtons.map((b, i) => (
                    <div
                      key={i}
                      className="flex items-center justify-center gap-1.5 py-2 text-[12.5px] text-[#00a5f4]"
                    >
                      <ButtonIcon type={b.type} />
                      {b.text || "Button"}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Message input bar */}
        <div className="flex items-center gap-2 bg-[#f0f0f0] px-2 py-2">
          <div className="flex flex-1 items-center gap-2 rounded-full bg-white px-3 py-1.5">
            <span className="flex-1 truncate text-xs text-[#667781]">Message</span>
            <Paperclip className="h-4 w-4 shrink-0 text-[#667781]" />
            <Camera className="h-4 w-4 shrink-0 text-[#667781]" />
          </div>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#008069] text-white">
            <Mic className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  )
}
