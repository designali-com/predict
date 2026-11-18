import Link from "next/link";
import { notFound } from "next/navigation";
import { findNeighbour } from "fumadocs-core/page-tree";
import { Metadata } from "next"

import { mdxComponents } from "@/mdx-components";
import { biomarkersSource } from "@/src/lib/source";
import { DocsTableOfContents } from "@/src/components/docs/docs-toc";
 
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@workspace/ui/components/button";

export const revalidate = false;
export const dynamic = "force-static";
export const dynamicParams = false;

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
  return biomarkersSource.generateParams();
}

interface DocPageProps {
  params: Promise<{
    slug: string[];
  }>;
}

async function getDocFromParams({ params }: DocPageProps) {
  const { slug } = await params;

  const page = biomarkersSource.getPage(slug);

  if (!page) notFound();

  const doc = page.data;

  if (!doc.title || !doc.description) {
    notFound();
  }

  return { doc, page };
}

export default async function DocPage({ params }: DocPageProps) {
  const { doc, page } = await getDocFromParams({ params });

  const MDX = doc.body;

  const neighbours = findNeighbour(
    biomarkersSource.pageTree,
    page.url
  );

  return (
    <div className="mx-auto max-w-7xl">
    <div
      data-slot="biomarkers"
       className="flex items-stretch xl:w-full"
    >
      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col">
        
        <div className="mx-auto flex w-full border-x border-dashed px-3 md:px-10 max-w-5xl min-w-0 flex-1 flex-col justify-center gap-8 px-4 py-6 md:px-0 lg:py-8">
        <div className="flex  ml-auto gap-2 mt-8 items-center">
          {neighbours.previous && (
            <Button className={"shadow-none"} variant="outline" >
              <Link className="flex items-center" href={neighbours.previous.url}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                {neighbours.previous.name}
              </Link>
            </Button>
          )}

          {neighbours.next && (
            <Button
 variant="outline"
 className="shadow-none"

 >
              <Link className="flex items-center" href={neighbours.next.url}>
                {neighbours.next.name}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>
          <div className="w-full flex-1 *:data-[slot=alert]:first:mt-0">
            <MDX components={mdxComponents} />
          </div>

          {/* Previous / Next */}
          <div className="mt-12 flex items-center border-t pt-6">
            {neighbours.previous && (
              <Button className={"shadow-none"} variant="outline" >
                <Link className="flex items-center" href={neighbours.previous.url}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  {neighbours.previous.name}
                </Link>
              </Button>
            )}

            {neighbours.next && (
              <Button
 variant="outline"
 className="ml-auto shadow-none"

 >
                <Link className="flex items-center" href={neighbours.next.url}>
                  {neighbours.next.name}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>


      <div className="sticky border-r top-0 border-dashed hidden h-[calc(100vh-5rem)] w-64 shrink-0 xl:block">
        {doc.toc?.length ? (
          <div className="overflow-y-auto px-6 py-8">
            <DocsTableOfContents toc={doc.toc} />
          </div>
        ) : null}
      </div>
      </div>
    </div>
  );
}