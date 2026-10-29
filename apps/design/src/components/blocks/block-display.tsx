import { highlightCode } from "@/src/lib/highlight-code"
import {
  createFileTreeForRegistryItemFiles,
  getRegistryItem,
  type RegistryFile,
} from "@/src/lib/registry"

import { BlockViewer } from "./block-viewer"

export async function BlockDisplay({ name }: { name: string }) {
  const item = await getRegistryItem(name)

  if (!item?.files?.length) return null

  const files = await Promise.all(
    item.files.map(async (file: RegistryFile) => ({
      target: file.target ?? file.path,
      content: file.content ?? "",
      highlighted: await highlightCode(file.content ?? "", "tsx"),
    }))
  )

  return (
    <BlockViewer
      name={name}
      description={item.description ?? ""}
      iframeHeight={(item.meta as { iframeHeight?: string } | undefined)?.iframeHeight ?? "800px"}
      files={files}
      tree={createFileTreeForRegistryItemFiles(item.files)}
    />
  )
}
