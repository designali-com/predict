import { loader } from "fumadocs-core/source";
import { biomarkers, docs } from "@/.source";

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
});

export const biomarkerSource = loader({
  baseUrl: "/biomarkers",
  source: biomarkers.toFumadocsSource(),
});
