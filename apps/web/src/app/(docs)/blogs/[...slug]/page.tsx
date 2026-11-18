/* eslint-disable @next/next/no-img-element */

import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { mdxComponents } from "@/mdx-components"
import { ArrowLeft, ArrowRight } from "lucide-react"
import type {
  BlogPosting,
  BreadcrumbList,
  WithContext,
} from "schema-dts"

import { siteConfig } from "@/src/config/site"
import { blogSource } from "@/src/lib/source"
import {
  absoluteUrl,
  calculateReadingTime,
  formatDate,
} from "@/src/lib/utils"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { buttonVariants } from "@workspace/ui/components/button"

import { MobileTOC } from "@/src/components/docs/mobile-toc"
import { DocsTableOfContents } from "@/src/components/docs/docs-toc"

export const revalidate = false
export const dynamic = "force-static"
export const dynamicParams = false

interface PageProps {
  params: Promise<{
    slug: string[]
  }>
}

export function generateStaticParams() {
  return blogSource.generateParams()
}

async function getDocFromParams({ params }: PageProps) {
  const { slug } = await params

  const page = blogSource.getPage(slug)

  if (!page) notFound()

  const doc = page.data

  if (!doc.title || !doc.description) {
    notFound()
  }

  return { doc, page }
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { doc, page } = await getDocFromParams({ params })

  if (!page) {
    return {}
  }

  return {
    title: `${doc.title} | ${siteConfig.name}`,
    description: doc.description,

    openGraph: {
      title: doc.title,
      description: doc.description,
      type: "article",
      url: absoluteUrl(page.url),
      images: doc.image
        ? [
            {
              url: doc.image,
              width: 1200,
              height: 630,
            },
          ]
        : undefined,
    },

    twitter: {
      card: "summary_large_image",
      title: doc.title,
      description: doc.description,
      images: doc.image ? [doc.image] : undefined,
    },
  }
}

export default async function BlogPage({ params }: PageProps) {
  const { doc, page } = await getDocFromParams({ params })

  const content = await doc.getText("raw")
  const MDX = doc.body

  /* -------------------------------- */
  /* BREADCRUMBS */
  /* -------------------------------- */

  const toBreadcrumbLabel = (segment: string) =>
    segment
      .split("-")
      .filter(Boolean)
      .map(
        (part) =>
          part.slice(0, 1).toUpperCase() + part.slice(1),
      )
      .join(" ") || segment

  const slugSegments = page.url
    .replace(/^\/blogs\/?/, "")
    .split("/")
    .filter(Boolean)

  const intermediateCrumbs = slugSegments
    .slice(0, -1)
    .map((segment, index) => ({
      name: toBreadcrumbLabel(segment),
      url: `/blogs/${slugSegments
        .slice(0, index + 1)
        .join("/")}`,
    }))

  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Blog", url: "/blogs" },
    ...intermediateCrumbs,
    {
      name: doc.title,
      url: page.url,
    },
  ] as const

  /* -------------------------------- */
  /* STRUCTURED DATA */
  /* -------------------------------- */

  const structuredData: WithContext<BlogPosting> = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",

    headline: doc.title,
    description: doc.description,

    url: absoluteUrl(page.url),

    datePublished: doc.publishedOn,
    dateModified: doc.publishedOn,

    author: {
      "@type": "Person",
      name: doc.author ?? "PREDICT Team",
    },

    image: doc.image ? [doc.image] : undefined,

    publisher: {
      "@type": "Organization",
      name: siteConfig.name,
      url: siteConfig.url,
      logo: {
        "@type": "ImageObject",
        url: `${siteConfig.url}/logo.png`,
      },
    },

    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": absoluteUrl(page.url),
    },

    wordCount: content
      ? content.split(/\s+/).length
      : 0,

    timeRequired: `PT${calculateReadingTime(
      content || "",
    )}M`,

    keywords: (() => {
      const docTag = doc.tags

      if (!docTag) return undefined

      return Array.isArray(docTag)
        ? docTag
        : [docTag]
    })(),

    inLanguage: "en-US",
  }

  const breadcrumbStructuredData: WithContext<BreadcrumbList> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",

    itemListElement: breadcrumbs.map(
      (breadcrumb, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: breadcrumb.name,
        item: absoluteUrl(breadcrumb.url),
      }),
    ),
  }

  const serializedStructuredData = JSON.stringify(
    structuredData,
  ).replace(/</g, "\\u003c")

  const serializedBreadcrumbStructuredData =
    JSON.stringify(breadcrumbStructuredData).replace(
      /</g,
      "\\u003c",
    )

  /* -------------------------------- */
  /* TAGS */
  /* -------------------------------- */

  const docTags = doc.tags
    ? Array.isArray(doc.tags)
      ? doc.tags
      : [doc.tags]
    : []

  return (
    <>
      {/* -------------------------------- */}
      {/* STRUCTURED DATA */}
      {/* -------------------------------- */}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializedStructuredData,
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializedBreadcrumbStructuredData,
        }}
      />

      {/* -------------------------------- */}
      {/* PAGE */}
      {/* -------------------------------- */}

      <div className="mx-auto max-w-7xl border-x border-dashed pt-5 px-3 xl:px-0">

        {/* -------------------------------- */}
        {/* BACK TO BLOG */}
        {/* -------------------------------- */}

        <div className="mb-4 ml-6">
          <Link
            href="/blogs"
            className={buttonVariants({
              variant: "outline",
            })}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Blog
          </Link>
        </div>

        <article className="mx-auto rounded-xl">

          {/* -------------------------------- */}
          {/* BLOG HEADER */}
          {/* -------------------------------- */}

          {doc && (
            <div>
              {/* IMAGE */}

              {doc.image && (
                <div className="relative overflow-hidden px-6 rounded-xl">
                  <img
                    src={doc.image}
                    alt={doc.title}
                    className="
                      size-full
                      rounded-xl
                      border
                      border-border
                      object-cover
                      object-left
                    "
                  />
                </div>
              )}

              {/* TITLE */}

              <div className="mx-auto flex flex-col items-center justify-center gap-y-2 p-3">
                <div className="mx-auto flex max-w-3xl flex-col items-center justify-center gap-y-4">

                  <h1 className="text-center text-3xl font-semibold tracking-tighter text-balance md:text-5xl">
                    {doc.title}
                  </h1>

                  <p className="text-center text-secondary-foreground text-balance md:text-lg">
                    {doc.description}
                  </p>

                  <div className="flex items-center justify-center gap-x-2 text-sm text-secondary-foreground">
                    {doc.publishedOn && (
                      <time>
                        {formatDate(doc.publishedOn)}
                      </time>
                    )}

                    {doc.publishedOn && (
                      <span>·</span>
                    )}

                    <span>
                      {calculateReadingTime(content)} min read
                    </span>
                  </div>
                </div>
              </div>

              {/* TAGS */}

              {docTags.length > 0 && (
                <div className="flex pb-6 items-center justify-center gap-x-2 p-3 text-sm text-secondary-foreground">
                  <div className="flex flex-wrap items-center justify-center gap-1">
                    {docTags.map((tag) => (
                      <Link
                        key={tag}
                        href={`/blogs?tag=${encodeURIComponent(
                          tag,
                        )}`}
                      >
                        <Badge
                          variant="secondary"
                          className="border border-border text-xs"
                        >
                          {tag}
                        </Badge>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* -------------------------------- */}
          {/* CONTENT + TOC */}
          {/* -------------------------------- */}

          <div className="flex border-t border-dashed items-stretch xl:w-full">

            {/* MAIN CONTENT */}

            <div className="flex min-w-0 flex-1 flex-col">
              <div
                className="
                  mx-auto
                  flex
                  w-full
                  min-w-0
                  max-w-5xl
                  flex-1
                  flex-col
                  justify-center
                  gap-8 
                  px-4
                  py-6
                  md:px-10
                  lg:py-8
                "
              >
                <div className="article-content w-full flex-1 *:data-[slot=alert]:first:mt-0">
                  <MDX components={mdxComponents} />
                </div>

                {/* -------------------------------- */}
                {/* PREVIOUS / NEXT */}
                {/* -------------------------------- */}

                <div className="mt-12 flex items-center border-t pt-6">

                  {/*
                   * Previous
                   */}

                  {page && (
                    <>
                      {/* Add your neighbour logic here if blogSource
                          supports findNeighbour */}
                    </>
                  )}

                </div>
              </div>
            </div>

            {/* -------------------------------- */}
            {/* STICKY TOC */}
            {/* -------------------------------- */}

            <aside
              className="
                sticky
                top-16
                hidden
                h-[calc(100vh-5rem)]
                w-64
                shrink-0
                border-l
                border-dashed
                xl:block
              "
            >
              {doc.toc?.length ? (
                <div className="h-full overflow-y-auto px-6 py-8">
                  <DocsTableOfContents toc={doc.toc} />
                </div>
              ) : null}
            </aside>
          </div>
        </article>

        {/* -------------------------------- */}
        {/* MOBILE TOC */}
        {/* -------------------------------- */}

        <MobileTOC />
      </div>
    </>
  )
}