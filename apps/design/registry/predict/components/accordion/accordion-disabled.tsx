"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

export function AccordionDisabled() {
  return (
    <Accordion className="w-full max-w-md">
      <AccordionItem value="heart">
        <AccordionTrigger>Heart health</AccordionTrigger>
        <AccordionContent>ApoB, LDL-C, HDL-C, Triglycerides.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="thyroid" disabled>
        <AccordionTrigger>Thyroid (not in this panel)</AccordionTrigger>
        <AccordionContent>TSH, Free T4.</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
