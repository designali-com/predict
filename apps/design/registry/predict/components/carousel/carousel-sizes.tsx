"use client"

import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace/ui/components/carousel"

const panels = [
  "Heart",
  "Metabolic",
  "Thyroid",
  "Liver",
  "Kidney",
  "Hormones",
  "Nutrients",
]

export function CarouselSizes() {
  return (
    <Carousel opts={{ align: "start" }} className="w-full max-w-sm">
      <CarouselContent>
        {panels.map((panel) => (
          <CarouselItem key={panel} className="basis-1/2 md:basis-1/3">
            <Card>
              <CardContent className="flex aspect-square items-center justify-center p-4">
                <span className="text-sm font-medium">{panel}</span>
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
