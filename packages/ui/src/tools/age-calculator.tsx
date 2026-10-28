"use client"

import * as React from "react"
import { cn } from "cn"
import { format } from "date-fns"
import { CalendarIcon, RotateCcwIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
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
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
    ageInMonths,
    ageInYears,
    correctedAgeInMonths,
    formatAge,
} from "@workspace/ui/lib/age"
import { NumberField, NumberFieldDecrement, NumberFieldGroup, NumberFieldIncrement, NumberFieldInput } from "@workspace/ui/components/number-field"

export interface AgeResult {
    /** Chronological age in WHO months. */
    ageMonths: number
    /** Age in months corrected for prematurity. */
    correctedAgeMonths: number
    /** Completed years, as a birthday counts it. */
    completedYears: number
}

// UTC midnight, so the result doesn't move with the reader's time zone.
const parse = (value: string) => new Date(`${value}T00:00:00Z`)

/** A local date as a `YYYY-MM-DD` value. */
const toInputValue = (date: Date) =>
    [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, "0"),
        String(date.getDate()).padStart(2, "0"),
    ].join("-")

/** A `YYYY-MM-DD` value as a local date, for the calendar. */
const toLocalDate = (value: string) => {
    const [year = 0, month = 1, day = 1] = value.split("-").map(Number)
    return new Date(year, month - 1, day)
}

const earliest = new Date(1900, 0)

function DatePicker({
    id,
    value,
    onChange,
    min,
    max,
}: {
    id: string
    value: string
    onChange: (value: string) => void
    min?: string
    max?: string
}) {
    const [open, setOpen] = React.useState(false)
    const selected = value ? toLocalDate(value) : undefined
    const minDate = min ? toLocalDate(min) : undefined
    const maxDate = max ? toLocalDate(max) : undefined

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
                id={id}
                render={
                    <Button
                        variant="outline"
                        className={cn(
                            "",
                            !selected && "text-border"
                        )}
                    />
                }
            >
                <CalendarIcon data-icon="inline-start" />
                {selected ? format(selected, "d MMM yyyy") : "Pick a date"}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                    mode="single"
                    captionLayout="dropdown"
                    selected={selected}
                    defaultMonth={selected ?? maxDate}
                    startMonth={minDate ?? earliest}
                    endMonth={maxDate ?? new Date(new Date().getFullYear() + 10, 11)}
                    disabled={[
                        ...(minDate ? [{ before: minDate }] : []),
                        ...(maxDate ? [{ after: maxDate }] : []),
                    ]}
                    onSelect={(date) => {
                        if (!date) return
                        onChange(toInputValue(date))
                        setOpen(false)
                    }}
                />
            </PopoverContent>
        </Popover>
    )
}

export function calculateAge(
    birth: Date,
    measured: Date,
    gestationalWeeks = 40
): AgeResult | null {
    if (measured < birth) return null
    return {
        ageMonths: ageInMonths(birth, measured),
        correctedAgeMonths: correctedAgeInMonths(birth, measured, gestationalWeeks),
        completedYears: ageInYears(birth, measured),
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

export interface AgeCalculatorProps
    extends Omit<React.ComponentProps<typeof Card>, "onChange"> {
    defaultBirthDate?: Date
    /** Defaults to today. */
    defaultMeasuredDate?: Date
    /** Weeks of pregnancy at birth. 40 is term. */
    defaultGestationalWeeks?: number
    onChange?: (result: AgeResult | null) => void
}

function AgeCalculator({
    className,
    defaultBirthDate,
    defaultMeasuredDate,
    defaultGestationalWeeks = 40,
    onChange,
    ...props
}: AgeCalculatorProps) {
    const id = React.useId()
    // Read once, then reused by reset
    const [initial] = React.useState(() => ({
        birth: defaultBirthDate ? toInputValue(defaultBirthDate) : "",
        measured: toInputValue(defaultMeasuredDate ?? new Date()),
    }))

    const [birth, setBirth] = React.useState(initial.birth)
    const [measured, setMeasured] = React.useState(initial.measured)
    const [weeks, setWeeks] = React.useState(defaultGestationalWeeks)

    const result = React.useMemo(
        () =>
            birth && measured
                ? calculateAge(parse(birth), parse(measured), weeks)
                : null,
        [birth, measured, weeks]
    )

    const emitChange = React.useEffectEvent((value: AgeResult | null) => {
        onChange?.(value)
    })

    React.useEffect(() => {
        emitChange(result)
    }, [result])

    const stats = [
        ["Chronological", result ? formatAge(result.ageMonths) : "—"],
        ["Corrected", result ? formatAge(result.correctedAgeMonths) : "—"],
        ["Completed years", result ? String(result.completedYears) : "—"],
    ]

    return (
        <Card className={cn("w-full max-w-xl", className)} {...props}>
            <CardHeader>
                <CardTitle className="text-sm">Age Calculator</CardTitle>
                <CardDescription>
                    Age on the day of a measurement, corrected for prematurity.
                </CardDescription>
                <CardAction>
                    <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Reset"
                        onClick={() => {
                            setBirth(initial.birth)
                            setMeasured(initial.measured)
                            setWeeks(defaultGestationalWeeks)
                        }}
                    >
                        <RotateCcwIcon />
                    </Button>
                </CardAction>
            </CardHeader>

            <CardContent className="flex flex-col gap-6">
                <div className="grid gap-4 sm:grid-cols-3">
                    <Field id={`${id}-birth`} label="Date of birth">
                        <DatePicker
                            id={`${id}-birth`}
                            max={measured || undefined}
                            value={birth}
                            onChange={setBirth}
                        />
                    </Field>
                    <Field id={`${id}-measured`} label="Measured on">
                        <DatePicker
                            id={`${id}-measured`}
                            min={birth || undefined}
                            value={measured}
                            onChange={setMeasured}
                        />
                    </Field>
                    <Field id={`${id}-weeks`} label="Born at (weeks)">
                        <NumberField 
                            min={22}
                            max={42}
                            value={weeks}
                            onValueChange={(value) => setWeeks(value || 40)}
                        >
                            <NumberFieldGroup>
                                <NumberFieldDecrement />
                                <NumberFieldInput 
                                    id={`${id}-weeks`}
                                    aria-label="Born at (weeks)"
                                />
                                <NumberFieldIncrement />
                            </NumberFieldGroup>
                        </NumberField>
                    </Field>
                </div>

                <dl className="grid grid-cols-3 gap-4 text-sm">
                    {stats.map(([label, value]) => (
                        <div key={label} className="flex flex-col gap-1">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
                        </div>
                    ))}
                </dl>

                {birth && measured && !result && (
                    <p className="text-muted-foreground">
                        The measurement date must be on or after the date of birth.
                    </p>
                )}
            </CardContent>
        </Card>
    )
}

export { AgeCalculator }
