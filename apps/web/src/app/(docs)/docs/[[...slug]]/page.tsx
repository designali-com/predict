
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
    <div className="mx-auto max-w-7xl">

      <div
        data-slot="docs"
        className="flex items-stretch xl:w-full"
      >
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mx-auto flex w-full border-x border-dashed px-3 md:px-10 max-w-5xl min-w-0 flex-1 flex-col justify-center gap-8 px-4 py-6 md:px-0 lg:py-8">

            <div className="w-full flex-1 *:data-[slot=alert]:first:mt-0">
              <MDX components={mdxComponents} />
            </div>
          </div> 
        </div>
        <div className="sticky border-r top-0 border-dashed hidden h-[calc(100vh-5rem)] w-64 shrink-0 xl:block">
          <div className="h-full px-6 py-8">
            <DocsTableOfContents toc={doc.toc} />
          </div>
        </div> 
      </div>
    </div>
  )
}