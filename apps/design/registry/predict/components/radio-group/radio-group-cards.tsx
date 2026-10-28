"use client"

import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"

const plans = [
  { value: "essential", title: "Essential", description: "40 biomarkers, once a year." },
  { value: "complete", title: "Complete", description: "100 biomarkers, twice a year." },
]

export function RadioGroupCards() {
  return (
    <RadioGroup defaultValue="complete" aria-label="Plan" className="w-full max-w-sm">
      {plans.map((plan) => (
        <label
          key={plan.value}
          className="flex items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary"
        >
          <RadioGroupItem value={plan.value} className="mt-0.5" />
          <span className="grid gap-1">
            <span className="text-sm font-medium">{plan.title}</span>
            <span className="text-xs text-muted-foreground">{plan.description}</span>
          </span>
        </label>
      ))}
    </RadioGroup>
  )
}
