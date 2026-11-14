import { LabOrderView } from "@/src/components/lab/lab-order-view"

export const metadata = { title: "Order" }

export default async function LabOrderPage({ params }: { params: Promise<{ id: string }> }) {
  return <LabOrderView id={(await params).id} />
}
