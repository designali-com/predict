import { Suspense } from "react"
 

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container-wrapper flex flex-1 flex-col px-2">
       
        <Suspense>
          <div className="h-full w-full">{children}</div>
        </Suspense>
       
    </div>
  )
}