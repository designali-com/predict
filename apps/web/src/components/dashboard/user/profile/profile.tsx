"use client"

import React, { useEffect, useRef, useState } from "react"
import { PredictSpinner } from "@/src/components/predict-loader"
import {
  User,
  Calendar as CalendarIcon,
  Phone,
  MapPin,
  IdCard,
  Pencil,
  X,
  Loader2,
  CheckCircle2,
  Sparkles,
  Mail,
  Save,
  Camera,
  Trash2,
} from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { format } from "date-fns"

import { Avatar, AvatarFallback, AvatarImage } from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Calendar } from "@workspace/ui/components/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

/* =========================================================
   CONSTANTS & TYPES
========================================================= */

const INDIAN_STATES = [
  "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
  "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
  "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
  "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
  "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal", "Delhi"
]

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
const MARITAL_STATUSES = ["Single", "Married", "Divorced", "Widowed"]

const GENDER_LABELS: Record<string, string> = {
  MALE: "Male",
  FEMALE: "Female",
  OTHER: "Other",
}

interface ProfileData {
  name: string
  email: string
  image: string | null
  patientCode: string | null

  gender: string | null
  dateOfBirth: string | null
  mobileNumber: string | null
  alternateMobile: string | null

  bloodGroup: string | null
  maritalStatus: string | null
  nationality: string | null
  language: string | null

  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  country: string | null
  pincode: string | null
}

interface FormState {
  gender: string
  dateOfBirth: string
  mobileNumber: string
  alternateMobile: string

  bloodGroup: string
  maritalStatus: string
  nationality: string
  language: string

  addressLine1: string
  addressLine2: string
  city: string
  state: string
  country: string
  pincode: string
}

const EMPTY_FORM: FormState = {
  gender: "",
  dateOfBirth: "",
  mobileNumber: "",
  alternateMobile: "",
  bloodGroup: "",
  maritalStatus: "",
  nationality: "",
  language: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  country: "India",
  pincode: "",
}

/* =========================================================
   HELPERS
========================================================= */

function formToState(data: ProfileData): FormState {
  return {
    gender: data.gender ?? "",
    dateOfBirth: data.dateOfBirth ?? "",
    mobileNumber: data.mobileNumber ?? "",
    alternateMobile: data.alternateMobile ?? "",
    bloodGroup: data.bloodGroup ?? "",
    maritalStatus: data.maritalStatus ?? "",
    nationality: data.nationality ?? "",
    language: data.language ?? "",
    addressLine1: data.addressLine1 ?? "",
    addressLine2: data.addressLine2 ?? "",
    city: data.city ?? "",
    state: data.state ?? "",
    country: data.country ?? "India",
    pincode: data.pincode ?? "",
  }
}

function formatDate(value: string | null) {
  if (!value) return null
  const date = new Date(`${value.slice(0, 10)}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function calculateAge(dateOfBirth: string | null): string | null {
  if (!dateOfBirth) return null
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  const diff = Date.now() - dob.getTime()
  const ageDate = new Date(diff)
  return Math.abs(ageDate.getUTCFullYear() - 1970).toString()
}

/* =========================================================
   SUB-COMPONENTS
========================================================= */

function DatePickerField({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const selectedDate = value
    ? new Date(`${value.slice(0, 10)}T00:00:00`)
    : undefined

  return (
    <Popover>
      {/* The trigger IS the button (render), not a button wrapped around
          one — a button inside a button is invalid HTML and React flagged it. */}
      <PopoverTrigger
        render={
          <Button
 type="button"
 variant="outline"
 className="h-9 w-full justify-start border-muted bg-background/50 text-left font-normal hover:bg-background"
 />
        }
      >
        <CalendarIcon className="mr-2.5 size-4 text-muted-foreground" />
        {selectedDate && !Number.isNaN(selectedDate.getTime()) ? (
          format(selectedDate, "dd MMMM yyyy")
        ) : (
          <span className="text-muted-foreground">Select date of birth</span>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0 rounded-2xl" align="start">
        <Calendar
          mode="single"
          selected={selectedDate}
          onSelect={(date) => {
            if (!date) return
            const year = date.getFullYear()
            const month = String(date.getMonth() + 1).padStart(2, "0")
            const day = String(date.getDate()).padStart(2, "0")
            onChange(`${year}-${month}-${day}`)
          }}
          captionLayout="dropdown"
          startMonth={new Date(1900, 0, 1)}
          endMonth={new Date(new Date().getFullYear(), 11, 31)}
          disabled={(date) => date > new Date()}
        />
      </PopoverContent>
    </Popover>
  )
}

/**
 * "919876543210" → "+91 98765 43210"; "9876543210" → "+91 98765 43210".
 * Anything that is not an Indian mobile is shown as stored.
 */
function formatPhone(value: string | null): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, "")
  const local = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits.length === 10 ? digits : null
  return local ? `+91 ${local.slice(0, 5)} ${local.slice(5)}` : value
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 w-full">
      <Label className="text-[11px] font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  )
}

/* =========================================================
   MAIN COMPONENT
========================================================= */

export function ProfileDetails() {
  const [data, setData] = useState<ProfileData | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    const loadProfile = async () => {
      try {
        setLoading(true)
        setError(null)
        const response = await fetch("/api/patient/profile")
        if (!response.ok) throw new Error("Failed to load profile")
        const json = (await response.json()) as ProfileData

        setData(json)
        setForm(formToState(json))
      } catch (err) {
        console.error(err)
        setError("Failed to load your profile.")
      } finally {
        setLoading(false)
      }
    }

    loadProfile()
  }, [])

  // Profile photo: set, changed or removed straight away, apart from the form.
  const photoInput = useRef<HTMLInputElement>(null)
  const [photoBusy, setPhotoBusy] = useState(false)

  const uploadPhoto = async (file: File) => {
    setPhotoBusy(true)
    setError(null)
    setSuccess(false)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/patient/profile/photo", { method: "POST", body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Could not upload that photo.")
      setData((prev) => (prev ? { ...prev, image: json.image } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not upload that photo.")
    } finally {
      setPhotoBusy(false)
    }
  }

  const removePhoto = async () => {
    setPhotoBusy(true)
    setError(null)
    setSuccess(false)
    try {
      const res = await fetch("/api/patient/profile/photo", { method: "DELETE" })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? "Could not remove the photo.")
      setData((prev) => (prev ? { ...prev, image: null } : prev))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not remove the photo.")
    } finally {
      setPhotoBusy(false)
    }
  }

  const updateField = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleEdit = () => {
    if (!data) return
    setForm(formToState(data))
    setError(null)
    setSuccess(false)
    setEditing(true)
  }

  const handleCancel = () => {
    if (data) setForm(formToState(data))
    setEditing(false)
    setError(null)
    setSuccess(false)
  }

  const handleSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    try {
      setSaving(true)
      setError(null)
      setSuccess(false)

      const response = await fetch("/api/patient/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gender: form.gender || null,
          dateOfBirth: form.dateOfBirth || null,
          mobileNumber: form.mobileNumber || null,
          alternateMobile: form.alternateMobile || null,
          bloodGroup: form.bloodGroup || null,
          maritalStatus: form.maritalStatus || null,
          nationality: form.nationality || null,
          language: form.language || null,
          addressLine1: form.addressLine1 || null,
          addressLine2: form.addressLine2 || null,
          city: form.city || null,
          state: form.state || null,
          country: form.country || null,
          pincode: form.pincode || null,
        }),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => null)
        throw new Error(body?.error ?? "Failed to update profile")
      }

      const updatedData = (await response.json().catch(() => null)) as ProfileData | null

      setData((previous) => {
        if (!previous) return updatedData
        return {
          ...previous,
          ...form,
          ...(updatedData ?? {}),
        }
      })

      setSuccess(true)
      setEditing(false)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      // Centred in the space under the header, like every other page's loader.
      <div className="flex min-h-[calc(100svh-var(--header-height)-2rem)] items-center justify-center">
        <PredictSpinner />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="p-6">
        <Card className="rounded-2xl border-dashed p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <X className="size-6" />
          </div>
          <h3 className="mt-4 font-semibold">Failed to Load Profile</h3>
          <p className="text-sm text-muted-foreground">Unable to fetch information right now.</p>
        </Card>
      </div>
    )
  }

  const initials =
    data.name
      ?.split(" ")
      .filter(Boolean)
      .map((name) => name[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() ||
    data.email?.charAt(0).toUpperCase() ||
    "U"

  const age = calculateAge(data.dateOfBirth)

  const changed = JSON.stringify(form) !== JSON.stringify(formToState(data))
  const address = [data.addressLine1, data.addressLine2, [data.city, data.state].filter(Boolean).join(", "), [data.country, data.pincode].filter(Boolean).join(" ")]
    .filter((part) => part && part.trim())
    .join(", ")

  return (
    <div className="w-full p-4 md:p-6">
      {/* PAGE HEADER — the same heading as Biomarker Overview. */}
      <div className="mb-6 max-w-3xl md:mb-8">
        <h1 className="text-xl font-medium tracking-tight md:text-2xl">My Profile</h1>
        <p className="mt-3 text-sm text-muted-foreground">Your details as the clinic has them. Keep them current so reports and reminders reach you.</p>
      </div>

      <div className="flex max-w-4xl flex-col gap-4">
        {success && (
          <p className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            Profile updated.
          </p>
        )}
        {error && (
          <p className="flex items-center gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            <X className="size-4 shrink-0" />
            {error}
          </p>
        )}

        {/* WHO — photo, name, code, how to reach them, and the one action. */}
        <section className="flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
          <div className="relative w-fit shrink-0">
            {/* after:hidden — the shared Avatar draws a round ring over itself,
                which showed as a circle inside this square one. */}
            <Avatar className="size-16 rounded-2xl border after:hidden">
              <AvatarImage src={data.image ?? undefined} alt={data.name} className="rounded-2xl object-cover" />
              <AvatarFallback className="rounded-2xl bg-muted text-lg font-semibold">{initials}</AvatarFallback>
            </Avatar>
            {photoBusy && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/50">
                <Loader2 className="size-5 animate-spin text-white" />
              </div>
            )}
            <input
              ref={photoInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0]
                e.target.value = ""
                if (file) uploadPhoto(file)
              }}
            />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="default"
                    type="button"
                    disabled={photoBusy}
                    aria-label="Profile photo options"
                    className="absolute -right-1.5 -bottom-1.5 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary p-0 text-white shadow transition hover:opacity-90 disabled:opacity-60"
                  />
                }
              >
                <Camera className="size-3.5" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-44">
                <DropdownMenuItem onClick={() => photoInput.current?.click()}>
                  <Camera className="mr-2 size-4" />
                  {data.image ? "Change photo" : "Upload photo"}
                </DropdownMenuItem>
                {data.image && (
                  <DropdownMenuItem onClick={removePhoto} className="text-destructive">
                    <Trash2 className="mr-2 size-4" />
                    Remove photo
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-lg font-semibold">{data.name}</p>
              {data.patientCode && (
                <Badge variant="outline" className="gap-1 rounded-md font-mono text-[11px]">
                  <IdCard className="size-3 text-muted-foreground" />
                  {data.patientCode}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              {data.mobileNumber && (
                <span className="inline-flex items-center gap-1">
                  <Phone className="size-3" />
                  {formatPhone(data.mobileNumber)}
                </span>
              )}
              {data.email && (
                <span className="inline-flex min-w-0 items-center gap-1">
                  <Mail className="size-3" />
                  <span className="truncate">{data.email}</span>
                </span>
              )}
              {age && <span>{age} yrs</span>}
            </p>
          </div>

          {!editing ? (
            <Button size="sm" onClick={handleEdit}>
              <Pencil className="mr-1.5 size-3.5" />
              Edit
            </Button>
          ) : (
            <Button size="sm" variant="outline" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          )}
        </section>

        {!editing ? (
          <div className="grid gap-4 md:grid-cols-2">
            <InfoCard icon={User} title="Personal">
              <Info label="Gender" value={data.gender ? GENDER_LABELS[data.gender] ?? data.gender : null} />
              <Info label="Date of birth" value={formatDate(data.dateOfBirth)} />
              <Info label="Blood group" value={data.bloodGroup} />
              <Info label="Marital status" value={data.maritalStatus} />
              <Info label="Nationality" value={data.nationality} />
              <Info label="Language" value={data.language} />
            </InfoCard>
            <InfoCard icon={MapPin} title="Contact & address">
              <Info label="Mobile" value={formatPhone(data.mobileNumber)} />
              <Info label="Alternate" value={formatPhone(data.alternateMobile)} />
              <Info label="Email" value={data.email} wide />
              <Info label="Address" value={address || null} wide />
            </InfoCard>
          </div>
        ) : (
          /* EDIT — one card, three short groups, the fields side by side. */
          <form onSubmit={handleSave} className="rounded-2xl border bg-card">
            <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
              <h2 className="text-sm font-semibold">Edit details</h2>
              {changed && (
                <Badge variant="outline" className="gap-1 rounded-full border-amber-500/30 bg-amber-500/5 text-[11px] text-amber-500">
                  <Sparkles className="size-3" /> Unsaved changes
                </Badge>
              )}
            </div>

            <div className="space-y-5 p-4">
              <EditGroup title="Personal">
                <FormField label="Gender">
                  <Select items={GENDER_LABELS} value={form.gender} onValueChange={(val) => updateField("gender", val ?? "")}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      <SelectItem value="MALE">Male</SelectItem>
                      <SelectItem value="FEMALE">Female</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Date of birth">
                  <DatePickerField value={form.dateOfBirth} onChange={(val) => updateField("dateOfBirth", val)} />
                </FormField>
                <FormField label="Blood group">
                  <Select value={form.bloodGroup} onValueChange={(val) => updateField("bloodGroup", val ?? "")}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {BLOOD_GROUPS.map((group) => (
                        <SelectItem key={group} value={group}>
                          {group}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Marital status">
                  <Select value={form.maritalStatus} onValueChange={(val) => updateField("maritalStatus", val ?? "")}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {MARITAL_STATUSES.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Nationality">
                  <Input placeholder="e.g. Indian" value={form.nationality} onChange={(e) => updateField("nationality", e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Language">
                  <Input placeholder="e.g. Hindi" value={form.language} onChange={(e) => updateField("language", e.target.value)} className="h-9" />
                </FormField>
              </EditGroup>

              <EditGroup title="Phone">
                <FormField label="Mobile">
                  <Input placeholder="Mobile number" value={form.mobileNumber} onChange={(e) => updateField("mobileNumber", e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Alternate mobile">
                  <Input placeholder="Optional" value={form.alternateMobile} onChange={(e) => updateField("alternateMobile", e.target.value)} className="h-9" />
                </FormField>
              </EditGroup>

              <EditGroup title="Address">
                <FormField label="Address line 1">
                  <Input placeholder="Flat, house no., building" value={form.addressLine1} onChange={(e) => updateField("addressLine1", e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Address line 2">
                  <Input placeholder="Street, area, landmark" value={form.addressLine2} onChange={(e) => updateField("addressLine2", e.target.value)} className="h-9" />
                </FormField>
                <FormField label="City">
                  <Input placeholder="City" value={form.city} onChange={(e) => updateField("city", e.target.value)} className="h-9" />
                </FormField>
                <FormField label="State">
                  <Select value={form.state} onValueChange={(val) => updateField("state", val ?? "")}>
                    <SelectTrigger className="h-9 w-full">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent className="rounded-xl">
                      {INDIAN_STATES.map((st) => (
                        <SelectItem key={st} value={st}>
                          {st}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormField>
                <FormField label="Country">
                  <Input placeholder="Country" value={form.country} onChange={(e) => updateField("country", e.target.value)} className="h-9" />
                </FormField>
                <FormField label="Pincode">
                  <Input placeholder="PIN code" value={form.pincode} onChange={(e) => updateField("pincode", e.target.value)} className="h-9" />
                </FormField>
              </EditGroup>
            </div>

            <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
              <Button type="button" size="sm" variant="ghost" onClick={handleCancel} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={saving || !changed}>
                {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <Save className="mr-1.5 size-4" />}
                Save changes
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

/* A card of label / value pairs, two to a row. */
function InfoCard({ icon: Icon, title, children }: { icon: React.ElementType; title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card">
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <Icon className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">{title}</h2>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-4">{children}</dl>
    </section>
  )
}

function Info({ label, value, wide }: { label: string; value: string | null; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? "col-span-2" : ""}`}>
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm ${value ? "font-medium break-words" : "text-muted-foreground/50 italic"}`}>{value || "Not added"}</dd>
    </div>
  )
}

function EditGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </div>
  )
}
