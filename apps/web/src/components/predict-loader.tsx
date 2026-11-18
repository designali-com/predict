import { cn } from "@workspace/ui/lib/utils"

/**
 * The Predict mark — its two halves drawn separately, so each can be
 * animated on its own.
 */
export function PredictMark({
  className,
  halfClassNames = ["", ""],
}: {
  className?: string
  halfClassNames?: [string, string]
}) {
  return (
    <svg viewBox="0 0 184 184" className={className} aria-hidden>
      <path
        className={halfClassNames[0]}
        d="M173 87.961V116.631H127.763C115.793 116.631 106.038 126.488 106.038 138.488V184H77.5414V138.488C77.5414 118.517 89.2129 101.118 106.038 92.9322C112.641 89.7181 120.01 87.961 127.763 87.961H173Z"
        fill="#8504FE"
      />
      <path
        className={halfClassNames[1]}
        d="M10 96.9366V67.9984H55.6642C67.7467 67.9984 77.5932 58.0495 77.5932 45.9378V0H106.359V45.9378C106.359 66.0951 94.5776 83.657 77.5932 91.9189C70.9285 95.1631 63.4899 96.9366 55.6642 96.9366H10Z"
        fill="#8504FE"
      />
    </svg>
  )
}

/**
 * The loading indicator everywhere in the patient app: the Predict mark
 * turning, its halves breathing against each other — the same one the AI
 * chat shows while it answers, in place of a generic grey ring.
 */
export function PredictSpinner({ className }: { className?: string }) {
  return (
    <PredictMark
      className={cn("size-7 animate-[spin_1.6s_cubic-bezier(0.6,0.1,0.3,0.9)_infinite]", className)}
      halfClassNames={["animate-pulse", "animate-pulse [animation-delay:500ms]"]}
    />
  )
}

/** A page or section waiting on data: the spinner, centred, with an optional line under it. */
export function PredictLoader({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? "Loading"}
      className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}
    >
      <PredictSpinner />
      {label && <span className="animate-pulse text-xs text-muted-foreground">{label}</span>}
    </div>
  )
}
