import { blogs, docs, biomarkers } from "@/.source"
import { loader } from "fumadocs-core/source"

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
})
 
export const blogSource = loader({
  baseUrl: "/blogs",
  source: blogs.toFumadocsSource(),
})
 
export const biomarkersSource = loader({
  baseUrl: "/biomarkers",
  source: biomarkers.toFumadocsSource(),
})