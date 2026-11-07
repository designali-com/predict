"use client"

import * as React from "react"

import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from "@workspace/ui/components/carousel"

const steps = [
  "Book a blood draw",
  "Fast for 10 to 12 hours",
  "Visit the lab",
  "Get results in 48 hours",
]

export function CarouselApiDemo() {
  const [api, setApi] = React.useState<CarouselApi>()
  const [current, setCurrent] = React.useState(0)
  const [count, setCount] = React.useState(0)

  React.useEffect(() => {
    if (!api) return

    const update = () => {
      setCount(api.scrollSnapList().length)
      setCurrent(api.selectedScrollSnap() + 1)
    }

    update()
    api.on("select", update)
    api.on("reInit", update)

    return () => {
      api.off("select", update)
      api.off("reInit", update)
    }
  }, [api])

  return (
    <div className="w-full max-w-xs">
      <Carousel setApi={setApi}>
        <CarouselContent>
          {steps.map((step) => (
            <CarouselItem key={step}>
              <Card>
                <CardContent className="flex aspect-video items-center justify-center p-6 text-center">
                  <span className="text-lg font-medium">{step}</span>
                </CardContent>
              </Card>
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious />
        <CarouselNext />
      </Carousel>
      <p
        className="mt-3 text-center text-sm text-muted-foreground"
        aria-live="polite"
      >
        Step {current} of {count}
      </p>
    </div>
  )
}
