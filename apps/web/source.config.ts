import { remarkImage } from "fumadocs-core/mdx-plugins"
import {
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config" 
import { z } from "zod"
 

export default defineConfig({
  mdxOptions: {
    remarkPlugins: [
      [
        remarkImage,
        {
          onError: "ignore",
        },
      ],
    ],
     
  },
})

export const docs = defineDocs({
  dir: "src/content/docs",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.date().optional(),
      author: z.string().optional(),
      published: z.boolean().optional().default(true),
      video: z.string().optional(),
      links: z
        .object({
          doc: z.string().optional(),
          api: z.string().optional(),
        })
        .optional(),
    }),
  },
})
  
export const blogs = defineDocs({
  dir: "src/content/blogs",
  docs: {
    schema: frontmatterSchema.extend({
      tags: z.array(z.string()).optional(),
      publishedOn: z.string(),
      featured: z.boolean().optional().default(false),
      image: z.string().optional(),
      author: z.string().optional(),
    }),
  },
})

export const biomarkers = defineDocs({
  dir: "src/content/biomarkers",
  docs: {
    schema: frontmatterSchema.extend({
      date: z.date().optional(),
      author: z.string().optional(),
      published: z.boolean().optional().default(true),
      video: z.string().optional(),
      links: z
        .object({
          doc: z.string().optional(),
          api: z.string().optional(),
        })
        .optional(),
    }),
  },
})