// Bare pages for block previews. No site header, so the iframe shows only
// the block.
export default function ViewLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-background">{children}</div>
}
