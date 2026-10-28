"use client"

import * as React from "react"
import { cn } from "cn"
import { RotateCcwIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import {
  bmiCategory,
  bmiCategoryLabels,
  bodyMassIndex,
  bodySurfaceArea,
  type BmiCategory,
  type BsaFormula,
} from "@workspace/ui/lib/body-measurements"

const formulas: BsaFormula[] = ["mosteller", "du-bois", "haycock"]

export interface BodyMeasurementsResult {
  bmi: number
  category: BmiCategory
  /** Body surface area in square metres, by formula. */
  bsa: Record<BsaFormula, number>
}

export function calculateBodyMeasurements(
  weightKg: number,
  heightCm: number
): BodyMeasurementsResult | null {
  if (!(weightKg > 0 && heightCm > 0)) return null
  const bmi = bodyMassIndex(weightKg, heightCm)
  return {
    bmi,
    category: bmiCategory(bmi),
    bsa: {
      mosteller: bodySurfaceArea(weightKg, heightCm, "mosteller"),
      "du-bois": bodySurfaceArea(weightKg, heightCm, "du-bois"),
      haycock: bodySurfaceArea(weightKg, heightCm, "haycock"),
    },
  }
}

function Field({
  id,
  label,
  children,
}: {
  id: string
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

export interface BodyMeasurementsProps
  extends Omit<React.ComponentProps<typeof Card>, "onChange"> {
  /** Kilograms. */
  defaultWeight?: number
  /** Centimetres. */
  defaultHeight?: number
  onChange?: (result: BodyMeasurementsResult | null) => void
}

function BodyMeasurements({
  className,
  defaultWeight = 70,
  defaultHeight = 175,
  onChange,
  ...props
}: BodyMeasurementsProps) {
  const id = React.useId()
  const [weight, setWeight] = React.useState(defaultWeight)
  const [height, setHeight] = React.useState(defaultHeight)

  const result = React.useMemo(
    () => calculateBodyMeasurements(weight, height),
    [weight, height]
  )

  const emitChange = React.useEffectEvent(
    (value: BodyMeasurementsResult | null) => {
      onChange?.(value)
    }
  )

  React.useEffect(() => {
    emitChange(result)
  }, [result])

  return (
    <Card className={cn("w-full max-w-xl", className)} {...props}>
      <CardHeader>
        <CardTitle className="text-sm">Body Measurements</CardTitle>
        <CardDescription>
          Body mass index and body surface area from weight and height.
        </CardDescription>
        <CardAction>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Reset"
            onClick={() => {
              setWeight(defaultWeight)
              setHeight(defaultHeight)
            }}
          >
            <RotateCcwIcon />
          </Button>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-weight`} label="Weight (kg)">
            <Input
              id={`${id}-weight`}
              type="number"
              min={1}
              step="any"
              value={weight || ""}
              onChange={(event) => setWeight(event.target.valueAsNumber || 0)}
            />
          </Field>
          <Field id={`${id}-height`} label="Height (cm)">
            <Input
              id={`${id}-height`}
              type="number"
              min={1}
              step="any"
              value={height || ""}
              onChange={(event) => setHeight(event.target.valueAsNumber || 0)}
            />
          </Field>
        </div>

        <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">BMI</dt>
            <dd className="text-lg font-semibold tabular-nums">
              {result ? result.bmi.toFixed(1) : "—"}
            </dd>
            <dd className="text-xs text-muted-foreground">
              {result ? bmiCategoryLabels[result.category] : ""}
            </dd>
          </div>
          {formulas.map((formula) => (
            <div key={formula} className="flex flex-col gap-1">
              <dt className="text-muted-foreground capitalize">
                BSA, {formula.replace("-", " ")}
              </dt>
              <dd className="text-lg font-semibold tabular-nums">
                {result ? result.bsa[formula].toFixed(2) : "—"} m²
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

export { BodyMeasurements }
