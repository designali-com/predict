import { createMDX } from "fumadocs-mdx/next";

import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  transpilePackages: ["@workspace/ui"],
  outputFileTracingIncludes: {
    "/*": ["./registry/**/*", "./content/**/*"],
  },
   

  async redirects() {
    return [  
      {
        source: "/docs/:path*.mdx",
        destination: "/docs/:path*.md",
        permanent: true,
      }, 
    ];
  },

  rewrites() {
    return [
      {
        source: "/docs/:path*.md",
        destination: "/llm/:path*",
      },
    ];
  },
}

const withMDX = createMDX({});

export default withMDX(nextConfig);
