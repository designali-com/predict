/**
 * The columns a people-list export can include, in the order they appear in
 * the file. Shared by the export dialog (the tick boxes) and the export route
 * (what each one means), so the two cannot disagree. No server imports: the
 * dialog is a client component.
 */
export const EXPORT_COLUMNS = [
  { key: "id", label: "ID" },
  { key: "name", label: "Name" },
  { key: "phone", label: "Phone" },
  { key: "email", label: "Email" },
  { key: "city", label: "City" },
  { key: "region", label: "Region" },
  { key: "interest", label: "ICP" },
  { key: "source", label: "Source" },
  { key: "sourcePlatform", label: "Platform" },
  { key: "campaign", label: "Campaign" },
  { key: "stage", label: "Stage" },
  { key: "funnelStage", label: "Funnel stage" },
  { key: "leadStatus", label: "Lead status" },
  { key: "leadStatusAt", label: "Status updated" },
  { key: "callbackAt", label: "Callback at" },
  { key: "owner", label: "Owner" },
  { key: "doNotContact", label: "Do not contact" },
  { key: "createdAt", label: "Added" },
  { key: "enquiredAt", label: "Last enquiry" },
  { key: "lastTouchAt", label: "Last contact" },
] as const

export type ExportColumnKey = (typeof EXPORT_COLUMNS)[number]["key"]

export function isExportColumn(v: string): v is ExportColumnKey {
  return EXPORT_COLUMNS.some((c) => c.key === v)
}
