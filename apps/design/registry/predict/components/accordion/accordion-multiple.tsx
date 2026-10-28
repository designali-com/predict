"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@workspace/ui/components/accordion"

export function AccordionMultiple() {
  return (
    <Accordion multiple defaultValue={["heart", "metabolic"]} className="w-full max-w-md">
      <AccordionItem value="heart">
        <AccordionTrigger>Heart health</AccordionTrigger>
        <AccordionContent>ApoB, LDL-C, HDL-C, Triglycerides.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="metabolic">
        <AccordionTrigger>Metabolic health</AccordionTrigger>
        <AccordionContent>HbA1c, Fasting glucose, Insulin.</AccordionContent>
      </AccordionItem>
      <AccordionItem value="inflammation">
        <AccordionTrigger>Inflammation</AccordionTrigger>
        <AccordionContent>hs-CRP, Ferritin.</AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}
