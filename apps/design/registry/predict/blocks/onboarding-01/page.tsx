"use client"

import * as React from "react"
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Label } from "@workspace/ui/components/label"
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
  NumberFieldScrubArea,
} from "@workspace/ui/components/number-field"
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@workspace/ui/components/progress"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { Switch } from "@workspace/ui/components/switch"
import { PredictMascot } from "@workspace/ui/predict/predict-mascot"

const steps = [
  { title: "Your body", description: "Used for BMI and body surface area." },
  { title: "Your week", description: "How active you are on a normal week." },
  { title: "Your results", description: "Choose who can see your results." },
]

const activity = [
  { value: "low", title: "Mostly sitting", description: "Under 30 minutes of exercise a week." },
  { value: "moderate", title: "Some exercise", description: "Two or three sessions a week." },
  { value: "high", title: "Very active", description: "Four or more sessions a week." },
]

export default function Page() {
  const [step, setStep] = React.useState(0)
  const [done, setDone] = React.useState(false)
  const current = steps[step]!
  const isLast = step === steps.length - 1

  return (
    <div className="flex min-h-svh items-center justify-center p-4">
      <Card className="w-full max-w-md">
        {done ? (
          <CardContent className="flex flex-col items-center gap-4 py-8 text-center">
            <PredictMascot className="size-24" aria-hidden />
            <div className="flex flex-col gap-1">
              <h1 className="text-base font-medium">You're all set</h1>
              <p className="text-muted-foreground">
                We'll use your profile to read your first panel.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDone(false)
                setStep(0)
              }}
            >
              Start again
            </Button>
          </CardContent>
        ) : (
          <>
            <CardHeader>
              <Progress value={step + 1} max={steps.length}>
                <ProgressLabel>Health profile</ProgressLabel>
                <ProgressValue>{(_, value) => `Step ${value} of ${steps.length}`}</ProgressValue>
              </Progress>
              <CardTitle className="pt-4 text-base">{current.title}</CardTitle>
              <CardDescription>{current.description}</CardDescription>
            </CardHeader>

            <CardContent>
              {step === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <NumberField defaultValue={70} min={20} max={300}>
                    <NumberFieldScrubArea label="Weight (kg)" />
                    <NumberFieldGroup>
                      <NumberFieldDecrement />
                      <NumberFieldInput />
                      <NumberFieldIncrement />
                    </NumberFieldGroup>
                  </NumberField>
                  <NumberField defaultValue={170} min={100} max={230}>
                    <NumberFieldScrubArea label="Height (cm)" />
                    <NumberFieldGroup>
                      <NumberFieldDecrement />
                      <NumberFieldInput />
                      <NumberFieldIncrement />
                    </NumberFieldGroup>
                  </NumberField>
                </div>
              )}

              {step === 1 && (
                <RadioGroup defaultValue="moderate" aria-label="Activity level">
                  {activity.map((option) => (
                    <label
                      key={option.value}
                      className="flex items-start gap-3 rounded-lg border p-3 has-data-checked:border-primary"
                    >
                      <RadioGroupItem value={option.value} className="mt-0.5" />
                      <span className="grid gap-1">
                        <span className="text-sm font-medium">{option.title}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </span>
                    </label>
                  ))}
                </RadioGroup>
              )}

              {step === 2 && (
                <div className="flex flex-col gap-4">
                  <Label className="justify-between">
                    Share results with my clinician
                    <Switch defaultChecked />
                  </Label>
                  <Label className="justify-between">
                    Email me when results are ready
                    <Switch defaultChecked />
                  </Label>
                  <Label className="justify-between">
                    Use my data for research
                    <Switch />
                  </Label>
                </div>
              )}
            </CardContent>

            <CardFooter className="justify-between">
              <Button
                variant="ghost"
                size="sm"
                disabled={step === 0}
                onClick={() => setStep((s) => s - 1)}
              >
                <ArrowLeftIcon data-icon="inline-start" />
                Back
              </Button>
              <Button
                size="sm"
                onClick={() => (isLast ? setDone(true) : setStep((s) => s + 1))}
              >
                {isLast ? "Finish" : "Continue"}
                {isLast ? (
                  <CheckIcon data-icon="inline-end" />
                ) : (
                  <ArrowRightIcon data-icon="inline-end" />
                )}
              </Button>
            </CardFooter>
          </>
        )}
      </Card>
    </div>
  )
}
