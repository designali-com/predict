
import { notFound } from "next/navigation"
import { mdxComponents } from "@/mdx-components"
import { Metadata } from "next"
import { source } from "@/src/lib/source"
import { DocsTableOfContents } from "@/src/components/docs/docs-toc"

export const revalidate = false
export const dynamic = "force-static"
export const dynamicParams = false

export async function generateMetadata({
  params,
}: DocPageProps): Promise<Metadata> {
  const { doc } = await getDocFromParams({ params });

  return {
    title: doc.title,
    description: doc.description,
    openGraph: {
      title: doc.title,
      description: doc.description,

    },
    twitter: {
      card: "summary_large_image",
      title: doc.title,
      description: doc.description,

    },
  };
}

export function generateStaticParams() {
  return source.generateParams()
}

interface DocPageProps {
  params: Promise<{
    slug: string[]
  }>
}

async function getDocFromParams({ params }: DocPageProps) {
  const { slug } = await params
  const page = source.getPage(slug)
  if (!page) notFound()
  const doc = page.data
  if (!doc.title || !doc.description) {
    notFound()
  }

  return { doc, page }
}


export default async function DocPage({ params }: DocPageProps) {
  const { doc, page } = await getDocFromParams({ params })
  const MDX = doc.body


  return (

    <div data-slot="docs" className="flex items-stretch xl:w-full">
      <main className="flex min-w-0 border-x flex-1 flex-col">

        <div className="mx-auto flex w-full min-w-0 pt-6 flex-1 flex-col gap-4">
          
          <div className="w-full flex-1 p-4 *:data-[slot=alert]:first:mt-0">
            <MDX components={mdxComponents as any} />
          </div>
        </div>
      </main>
      <aside className="hidden xl:block w-52 shrink-0 self-stretch">
        <div className="sticky top-16 max-h-[calc(100vh-2.5rem)] overflow-y-auto p-4">
          {doc.toc?.length ? (
            <DocsTableOfContents toc={doc.toc} />
          ) : null}
        </div>
      </aside>
    </div>


  )
}