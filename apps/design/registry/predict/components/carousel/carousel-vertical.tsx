"use client"

import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@workspace/ui/components/carousel"

const tips = [
  "Drink water before your draw.",
  "Skip intense exercise the day before.",
  "Bring a list of your supplements.",
  "Wear a top with loose sleeves.",
]

export function CarouselVertical() {
  return (
    <Carousel
      orientation="vertical"
      opts={{ align: "start" }}
      className="my-12 w-full max-w-xs"
    >
      <CarouselContent className="h-[220px]">
        {tips.map((tip) => (
          <CarouselItem key={tip} className="basis-1/2">
            <Card>
              <CardContent className="flex items-center justify-center p-6 text-center">
                <span className="text-sm font-medium">{tip}</span>
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
