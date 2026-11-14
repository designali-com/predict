"use client"

import { Button } from "@workspace/ui/components/button"

import { useState, useRef, useEffect } from "react"
import {
  X,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
} from "lucide-react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { PredictSpinner } from "@/src/components/predict-loader"

interface RoleOption {
  key: string
  label: string
  panel: string
}

interface AddUserModalProps {
  open: boolean
  onClose: () => void
  onSuccess: () => void
  defaultRole: string
  roleLabel: string
  /**
   * The roles that may be picked here. Passed in rather than looked up so the
   * single-role pages keep working unchanged; when present, the modal shows a
   * picker instead of assuming its page's role.
   */
  roleOptions?: RoleOption[]
}

type Status = "idle" | "loading" | "success" | "error"

export function AddUserModal({
  open,
  onClose,
  onSuccess,
  defaultRole,
  roleLabel,
  roleOptions,
}: AddUserModalProps) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [role, setRole] = useState(defaultRole)
  const [mobileNumber, setMobileNumber] = useState("")
  const [age, setAge] = useState("")
  const [gender, setGender] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [status, setStatus] = useState<Status>("idle")
  const [errorMsg, setErrorMsg] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)

  const isPatient = role.toLowerCase() === "patient"
  const chosenRole = roleOptions?.find((r) => r.key === role)
  // Where they will land after signing in. Without this someone creates a
  // receptionist, sends them the clinic link, and neither of them understands
  // why it bounces.
  const panelHint =
    chosenRole?.panel === "operations"
      ? "Works in the operations console — the clinic panel will not open for them."
      : chosenRole?.panel === "clinic"
        ? "Works in the clinic panel."
        : chosenRole?.panel === "both"
          ? "Works in both panels; signs in to the clinic panel."
          : null

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setName("")
      setEmail("")
      setPassword("")
      setRole(defaultRole)
      setMobileNumber("")
      setAge("")
      setGender("")
      setStatus("idle")
      setErrorMsg("")
      setTimeout(() => nameRef.current?.focus(), 100)
    }
  }, [open, defaultRole])

  // Escape to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()

    // Gender uses the custom Select (no native HTML validation) — check it
    // explicitly rather than silently sending an empty value.
    if (isPatient && !gender) {
      setStatus("error")
      setErrorMsg("Gender is required")
      return
    }

    setStatus("loading")
    setErrorMsg("")

    try {
      // Only age is collected (simpler for staff than an exact DOB) — the
      // patient record itself needs a real date, so approximate one that
      // keeps today's age correct: same month/day, birth year back-computed.
      let dateOfBirth: string | undefined
      if (isPatient && age) {
        const today = new Date()
        const dob = new Date(today.getFullYear() - Number(age), today.getMonth(), today.getDate())
        dateOfBirth = dob.toISOString().slice(0, 10)
      }

      const res = await fetch("/api/superadmin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role,
          ...(isPatient && { mobileNumber, gender, dateOfBirth }),
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to create user")
      }

      setStatus("success")
      setTimeout(() => {
        onSuccess()
        onClose()
      }, 1200)
    } catch (err: any) {
      setStatus("error")
      setErrorMsg(err.message || "Something went wrong")
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-md overflow-hidden rounded-md border border-black/22 bg-white text-black dark:border-white/15 dark:bg-black dark:text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="relative flex items-center justify-between border-b border-black/18 px-6 py-5 dark:border-white/10">
            <div>
              <h2 className="text-base font-semibold text-black dark:text-white">
                Add {roleLabel}
              </h2>
              <p className="mt-0.5 text-xs text-black/65 dark:text-white/45">
                Create a new {roleLabel.toLowerCase()} account
              </p>
            </div>
            <Button variant="ghost" size="icon-sm"
 onClick={onClose}

 >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Form */}
          <form
            onSubmit={handleSubmit}
            className="relative flex flex-col gap-4 p-6"
          >
            {/* Role — only when the page hands us a catalogue to pick from. */}
            {roleOptions && roleOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                  Role
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 text-sm text-black outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:focus:border-white/40"
                >
                  {roleOptions.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
                {panelHint && (
                  <p className="text-[11px] text-black/60 dark:text-white/40">{panelHint}</p>
                )}
              </div>
            )}

            {/* Name */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                Full Name
              </label>
              <input
                ref={nameRef}
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 text-sm text-black placeholder-black/50 outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder-white/35 dark:focus:border-white/40"
              />
            </div>

            {/* Email */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 text-sm text-black placeholder-black/50 outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder-white/35 dark:focus:border-white/40"
              />
            </div>

            {/* Password */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min. 8 characters"
                  className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 pr-10 text-sm text-black placeholder-black/50 outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder-white/35 dark:focus:border-white/40"
                />
                <Button variant="ghost" size="default" className="absolute top-1/2 right-3 -translate-y-1/2 text-black/65 hover:text-black/65 dark:text-white/40 dark:hover:text-white/65"
 type="button"
 onClick={() => setShowPassword((p) => !p)}

 >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {isPatient && (
              <>
                {/* Phone */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    required
                    value={mobileNumber}
                    onChange={(e) => setMobileNumber(e.target.value)}
                    placeholder="9876543210"
                    className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 text-sm text-black placeholder-black/50 outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder-white/35 dark:focus:border-white/40"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Age */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                      Age
                    </label>
                    <input
                      type="number"
                      required
                      min={0}
                      max={120}
                      value={age}
                      onChange={(e) => setAge(e.target.value)}
                      placeholder="35"
                      className="w-full rounded-md border border-black/22 bg-white px-4 py-2.5 text-sm text-black placeholder-black/50 outline-none transition focus:border-black/40 dark:border-white/15 dark:bg-black dark:text-white dark:placeholder-white/35 dark:focus:border-white/40"
                    />
                  </div>

                  {/* Gender */}
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold tracking-widest text-black/65 uppercase dark:text-white/45">
                      Gender
                    </label>
                    <Select value={gender} onValueChange={(v) => setGender((v as string) ?? "")}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MALE">Male</SelectItem>
                        <SelectItem value="FEMALE">Female</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </>
            )}

            {/* Error */}
            {status === "error" && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* Success */}
            {status === "success" && (
              <div className="flex items-center gap-2 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                User created successfully!
              </div>
            )}

            {/* Submit */}
            <Button variant="simple" size="lg" className="mt-2 w-full"
 type="submit"
 disabled={status === "loading" || status === "success"}

 >
              {status === "loading" ? (
                <>
                  <PredictSpinner className="size-4" />
                  Creating…
                </>
              ) : status === "success" ? (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Created!
                </>
              ) : (
                `Create ${roleLabel}`
              )}
            </Button>
          </form>
        </div>
      </div>
    </>
  )
}
