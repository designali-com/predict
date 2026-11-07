"use client"

import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace/ui/components/carousel"

const markers = [
  { name: "Vitamin D", value: "32", unit: "ng/mL" },
  { name: "Ferritin", value: "86", unit: "ng/mL" },
  { name: "HbA1c", value: "5.2", unit: "%" },
  { name: "LDL", value: "104", unit: "mg/dL" },
  { name: "hs-CRP", value: "0.8", unit: "mg/L" },
]

export function CarouselDemo() {
  return (
    <Carousel className="w-full max-w-xs">
      <CarouselContent>
        {markers.map((marker) => (
          <CarouselItem key={marker.name}>
            <Card>
              <CardContent className="flex aspect-square flex-col items-center justify-center gap-2">
                <span className="text-sm text-muted-foreground">
                  {marker.name}
                </span>
                <span className="text-4xl font-semibold tabular-nums">
                  {marker.value}
                </span>
                <span className="text-sm text-muted-foreground">
                  {marker.unit}
                </span>
              </CardContent>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  )
}
