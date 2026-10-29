"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const results = [
  { name: "LDL-C", value: "96", unit: "mg/dL", range: "< 100", inRange: true },
  { name: "HDL-C", value: "58", unit: "mg/dL", range: "> 40", inRange: true },
  { name: "Triglycerides", value: "182", unit: "mg/dL", range: "< 150", inRange: false },
  { name: "HbA1c", value: "5.4", unit: "%", range: "< 5.7", inRange: true },
  { name: "hs-CRP", value: "3.4", unit: "mg/L", range: "< 1.0", inRange: false },
]

export function TableDemo() {
  return (
    <Table className="max-w-lg">
      <TableCaption>Results from your October panel.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Biomarker</TableHead>
          <TableHead className="text-end">Result</TableHead>
          <TableHead>Reference</TableHead>
          <TableHead className="text-end">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {results.map((result) => (
          <TableRow key={result.name}>
            <TableCell className="font-medium">{result.name}</TableCell>
            <TableCell className="text-end tabular-nums">
              {result.value} {result.unit}
            </TableCell>
            <TableCell className="text-muted-foreground">{result.range}</TableCell>
            <TableCell className="text-end">
              <Badge variant={result.inRange ? "outline" : "destructive"}>
                {result.inRange ? "In range" : "Out of range"}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
