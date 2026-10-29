"use client"

import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const orders = [
  { id: "INV-1042", item: "Core panel", amount: 149 },
  { id: "INV-1043", item: "Clinician review", amount: 49 },
  { id: "INV-1044", item: "Home collection", amount: 25 },
]

const formatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
})

export function TableWithFooter() {
  const total = orders.reduce((sum, order) => sum + order.amount, 0)

  return (
    <Table className="max-w-md">
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Item</TableHead>
          <TableHead className="text-end">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((order) => (
          <TableRow key={order.id}>
            <TableCell className="font-medium">{order.id}</TableCell>
            <TableCell>{order.item}</TableCell>
            <TableCell className="text-end tabular-nums">
              {formatter.format(order.amount)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={2}>Total</TableCell>
          <TableCell className="text-end tabular-nums">
            {formatter.format(total)}
          </TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  )
}
