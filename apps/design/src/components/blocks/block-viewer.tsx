"use client"

import * as React from "react"
import {
  ChevronRightIcon,
  FileIcon,
  FolderIcon,
  MonitorIcon,
  RotateCwIcon,
  SmartphoneIcon,
  SquareArrowOutUpRightIcon,
  TabletIcon,
  TerminalIcon,
} from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Toggle } from "@workspace/ui/components/toggle"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { CopyButton } from "@/src/components/docs/copy-button"
import type { FileTree } from "@/src/lib/registry"

type BlockFile = { target: string; content: string; highlighted: string }

const viewports = [
  { value: "100%", label: "Desktop", icon: MonitorIcon },
  { value: "768px", label: "Tablet", icon: TabletIcon },
  { value: "375px", label: "Mobile", icon: SmartphoneIcon },
] as const

const registryUrl = process.env.NEXT_PUBLIC_APP_URL || "https://predict.fit"

export function BlockViewer({
  name,
  description,
  iframeHeight,
  files,
  tree,
}: {
  name: string
  description: string
  iframeHeight: string
  files: BlockFile[]
  tree: FileTree[]
}) {
  const [view, setView] = React.useState<"preview" | "code">("preview")
  const [width, setWidth] = React.useState<string>("100%")
  const [activeFile, setActiveFile] = React.useState(files[0]?.target)
  const [iframeKey, setIframeKey] = React.useState(0)

  const file = files.find((f) => f.target === activeFile) ?? files[0]
  const command = `npx shadcn@latest add ${registryUrl}/r/${name}.json`

  return (
    <section id={name} className="flex scroll-mt-20 flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={view} onValueChange={(value) => setView(value as "preview" | "code")}>
          <TabsList>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="code">Code</TabsTrigger>
          </TabsList>
        </Tabs> 
        <div className="ml-auto flex items-center gap-1">
          <div className="hidden items-center gap-0.5 lg:flex">
            {viewports.map((viewport) => (
              <Tooltip key={viewport.value}>
                <TooltipTrigger
                  render={
                    <Toggle 
                      aria-label={viewport.label}
                      pressed={width === viewport.value}
                      onPressedChange={() => {
                        setWidth(viewport.value)
                        setView("preview")
                      }}
                    />
                  }
                >
                  <viewport.icon />
                </TooltipTrigger>
                <TooltipContent>{viewport.label}</TooltipContent>
              </Tooltip>
            ))}
            <Separator orientation="vertical" className="mx-0.5" />
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Reload preview"
                    onClick={() => setIframeKey((key) => key + 1)}
                  />
                }
              >
                <RotateCwIcon />
              </TooltipTrigger>
              <TooltipContent>Reload preview</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Open in a new tab"
                    nativeButton={false}
                    render={<a href={`/view/${name}`} target="_blank" rel="noreferrer" />}
                  />
                }
              >
                <SquareArrowOutUpRightIcon />
              </TooltipTrigger>
              <TooltipContent>Open in a new tab</TooltipContent>
            </Tooltip>
          </div> 
        </div>
      </div>

      {/* Preview */}
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border",
          view !== "preview" && "hidden"
        )}
        style={{ height: iframeHeight }}
      >
        <div
          className="mx-auto h-full bg-background border-x transition-[width] duration-300 ease-out"
          style={{ width }}
        >
          <iframe
            key={iframeKey}
            src={`/view/${name}`}
            title={description}
            loading="lazy"
            className="size-full"
          />
        </div>
      </div>

      {/* Code */}
      <div
        className={cn(
          "grid overflow-hidden rounded-xl border md:grid-cols-[14rem_1fr]",
          view !== "code" && "hidden"
        )}
        style={{ height: iframeHeight }}
      >
        <nav aria-label="Files" className="hidden overflow-y-auto border-r p-2 text-xs md:block">
          <FileTreeList tree={tree} active={file?.target} onSelect={setActiveFile} />
        </nav>
        <div className="flex min-w-0 flex-col">
          <div className="relative flex h-11 shrink-0 items-center gap-2 border-b px-4 font-mono text-xs text-muted-foreground">
            <FileIcon className="size-3.5" />
            <select
              aria-label="File"
              className="bg-transparent outline-none md:hidden"
              value={file?.target}
              onChange={(event) => setActiveFile(event.target.value)}
            >
              {files.map((f) => (
                <option key={f.target} value={f.target}>
                  {f.target}
                </option>
              ))}
            </select>
            <span className="hidden md:inline">{file?.target}</span>
            {file && <CopyButton value={file.content} className="top-1.5 right-1.5 bg-transparent" />}
          </div>
          <figure data-rehype-pretty-code-figure="" className="m-0! min-h-0 pl-4 flex-1 overflow-auto">
            <div dangerouslySetInnerHTML={{ __html: file?.highlighted ?? "" }} />
          </figure>
        </div>
      </div>
    </section>
  )
}

function FileTreeList({
  tree,
  active,
  onSelect,
  depth = 0,
}: {
  tree: FileTree[]
  active?: string
  onSelect: (path: string) => void
  depth?: number
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {tree.map((node) =>
        node.children ? (
          <li key={node.name}>
            <div
              className="flex items-center gap-1.5 rounded-md py-1 text-muted-foreground"
              style={{ paddingInlineStart: `${depth * 12 + 6}px` }}
            >
              <ChevronRightIcon className="size-3 rotate-90" />
              <FolderIcon className="size-3.5" />
              {node.name}
            </div>
            <FileTreeList tree={node.children} active={active} onSelect={onSelect} depth={depth + 1} />
          </li>
        ) : (
          <li key={node.path}>
            <button
              type="button"
              onClick={() => node.path && onSelect(node.path)}
              data-active={node.path === active}
              className="flex w-full items-center gap-1.5 rounded-md py-1 text-left hover:bg-muted data-[active=true]:bg-muted data-[active=true]:text-foreground"
              style={{ paddingInlineStart: `${depth * 12 + 22}px` }}
            >
              <FileIcon className="size-3.5" />
              {node.name}
            </button>
          </li>
        )
      )}
    </ul>
  )
}
