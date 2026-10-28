"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

export function AccordionDemo() {
  return (
    <Accordion defaultValue={["fasting"]} className="w-full max-w-md">
      <AccordionItem value="fasting">
        <AccordionTrigger>Do I need to fast before the test?</AccordionTrigger>
        <AccordionContent>
          Yes. Fast for 10 to 12 hours. Water is fine.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="results">
        <AccordionTrigger>When will my results be ready?</AccordionTrigger>
        <AccordionContent>
          Most panels are ready within 48 hours of collection.
        </AccordionContent>
      </AccordionItem>
      <AccordionItem value="range">
        <AccordionTrigger>What does out of range mean?</AccordionTrigger>
        <AccordionContent>
          The value sits outside the reference range for your age and sex.
          Your report explains what to do next.
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
