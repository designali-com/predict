"use client"

import type React from "react"

interface BlobsProps {
  children?: React.ReactNode
} 

declare module 'react' {
  interface StyleHTMLAttributes<T> extends React.HTMLAttributes<T> {
    jsx?: boolean
    global?: boolean
  }
}

export function Blobs({ children }: BlobsProps) {
  const blobStyle = {
    "--border-radius": "115% 140% 145% 110% / 125% 140% 110% 125%",
    "--border-width": "0.5vmin",
    aspectRatio: "1",
    display: "block",
    gridArea: "stack",
    backgroundSize: "calc(100% + var(--border-width) * 10)",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    border: "var(--border-width) solid transparent",
    borderRadius: "var(--border-radius)",
    maskImage: "linear-gradient(transparent, transparent), linear-gradient(black, white)",
    maskClip: "padding-box, border-box",
    maskComposite: "intersect",
    mixBlendMode: "screen" as const,
    height: "80vmin",
    filter: "blur(1vmin)",
  } as React.CSSProperties

  const blobs = [
    {
      // Primary Deep Purple (#8606FE)
      backgroundColor: "#8606FE",
      backgroundImage: "linear-gradient(#8606FE, #B253FF, #8606FE)",
      transform: "rotate(30deg) scale(1.03)",
    },
    {
      // Vibrant Magenta-Violet Accent
      backgroundColor: "#C800FF",
      backgroundImage: "linear-gradient(#C800FF, #8606FE, #E066FF)",
      transform: "rotate(60deg) scale(0.95)",
    },
    {
      // Electric Indigo Accent
      backgroundColor: "#5000CA",
      backgroundImage: "linear-gradient(#5000CA, #8606FE, #3B0099)",
      transform: "rotate(90deg) scale(0.97)",
    },
    {
      // Bright Neon Purple-Pink Highlight
      backgroundColor: "#DF41FF",
      backgroundImage: "linear-gradient(#DF41FF, #A12BFF, #8606FE)",
      transform: "rotate(120deg) scale(1.02)",
    },
  ]

  return (
    <div className="min-h-screen w-full flex items-center justify-center overflow-hidden relative">
      {children && (
        <div className="absolute pointer-events-none z-10 flex items-center justify-center text-center">
          {children}
        </div>
      )}
      <div className="grid" style={{ gridTemplateAreas: "'stack'" }}>
        <div
          className="grid relative"
          style={{
            gridTemplateAreas: "'stack'",
            gridArea: "stack",
            animation: "spin 5s linear infinite",
          }}
        >
          {blobs.map((blob, index) => (
            <span
              key={index}
              style={{
                ...blobStyle,
                ...blob,
              }}
            />
          ))}
        </div>
      </div> 
      <style jsx>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}