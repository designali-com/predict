import Link from "next/link"

import { PAGES_NEW } from "@/src/lib/docs"
import { 
  PageTreeRoot, 
  type PageTreePage,
} from "@/src/lib/page-tree"

function ComponentLink({
  component,
  showNewIndicator,
}: {
  component: PageTreePage
  showNewIndicator: boolean
}) {
  const isNew = showNewIndicator && PAGES_NEW.includes(component.url)

  return (
    <Link
      href={component.url}
      className="inline-flex items-center gap-2 text-lg font-medium underline-offset-4 hover:underline md:text-base"
    >
      {component.name}
      {isNew && (
        <>
          <span className="sr-only">New</span>
          <span
            aria-hidden="true"
            className="flex size-2 rounded-full bg-blue-500"
          />
        </>
      )}
    </Link>
  )
}

export function BiomarkersList({
  root,
  variant = "all",
}: {
  root: PageTreeRoot;
  variant?: "all" | "new";
}) {
  const list = root.children.filter(
    (item): item is PageTreePage =>
      item.type === "page" &&
      item.url !== "/biomarkers"
  );

  if (!list.length) return null;

  return (
    <div className="mt-8 items-start grid grid-cols-2 gap-4 md:grid-cols-3">
      {list.map((page) => (
        <ComponentLink
          key={page.$id}
          component={page}
          showNewIndicator={variant === "all"}
        />
      ))}
    </div>
  );
}