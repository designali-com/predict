"use client";

import React from "react";
import { cn } from "@workspace/ui/lib/utils";

interface BiologicalAgeChartProps {
  className?: string;
}

// A reusable leaf/petal component
function FlowerLeaf({
  rotation,
  fillId,
  className,
}: {
  rotation: number;
  fillId: string;
  className?: string;
}) {
  return (
    <g transform={`rotate(${rotation})`} className={className}>
      <path
        d={`
          M 0 0
          C -28 -24 -78 -72 -96 -128
          C -108 -170 -56 -222 0 -255
          C 56 -222 108 -170 96 -128
          C 78 -72 28 -24 0 0
          Z
        `}
        fill={`url(#${fillId})`}
        opacity={0.68}
        filter="url(#leafBlur)"
      />
    </g>
  );
}

export function BiologicalAgeChart({ className }: BiologicalAgeChartProps) {
  return (
    <div className={cn("relative w-full h-full min-h-[500px] flex items-center justify-center", className)}>
      <div className="relative w-[500px] h-[500px] flex items-center justify-center">
        {/* Outer dotted circles */}
        <div className="absolute inset-[20px] rounded-full border-[1px] border-dashed border-white/10"></div>
        <div className="absolute inset-[80px] rounded-full border-[1px] border-dashed border-white/10"></div>

        {/* Flower Petals (SVG) */}
        <svg
          viewBox="-260 -260 520 520"
          className="absolute w-[430px] h-[430px] overflow-visible"
        >
          <defs>
            {/* Gradients fading to black at the center (bottom of the petal) */}
            <radialGradient id="grad-green" cx="50%" cy="100%" r="100%">
              <stop offset="0%" stopColor="#000000" stopOpacity="1" />
              <stop offset="50%" stopColor="#025a33" stopOpacity="1" />
              <stop offset="100%" stopColor="#05cc6d" stopOpacity="1" />
            </radialGradient>

            <radialGradient id="grad-pink" cx="50%" cy="100%" r="100%">
              <stop offset="0%" stopColor="#000000" stopOpacity="1" />
              <stop offset="50%" stopColor="#6b0357" stopOpacity="1" />
              <stop offset="100%" stopColor="#d104a9" stopOpacity="1" />
            </radialGradient>

            <radialGradient id="grad-orange" cx="50%" cy="100%" r="100%">
              <stop offset="0%" stopColor="#000000" stopOpacity="1" />
              <stop offset="50%" stopColor="#873000" stopOpacity="1" />
              <stop offset="100%" stopColor="#f55600" stopOpacity="1" />
            </radialGradient>

            <radialGradient id="grad-lime" cx="50%" cy="100%" r="100%">
              <stop offset="0%" stopColor="#000000" stopOpacity="1" />
              <stop offset="50%" stopColor="#456602" stopOpacity="1" />
              <stop offset="100%" stopColor="#7ec400" stopOpacity="1" />
            </radialGradient>

            <radialGradient id="grad-blue" cx="50%" cy="100%" r="100%">
              <stop offset="0%" stopColor="#000000" stopOpacity="1" />
              <stop offset="50%" stopColor="#02207a" stopOpacity="1" />
              <stop offset="100%" stopColor="#0044ff" stopOpacity="1" />
            </radialGradient>
          </defs>

          {/* Rendering the leaves with specific rotations */}
          <FlowerLeaf rotation={0} fillId="grad-green" />
          <FlowerLeaf rotation={72} fillId="grad-pink" />
          <FlowerLeaf rotation={144} fillId="grad-orange" />
          <FlowerLeaf rotation={216} fillId="grad-lime" />
          <FlowerLeaf rotation={288} fillId="grad-blue" />
        </svg>

        {/* Central Value */}
        <div className="absolute w-[86px] h-[86px] bg-white rounded-full flex flex-col items-center justify-center shadow-2xl z-10">
          <span className="text-black text-[32px] font-sans font-bold leading-none tracking-tight">58</span>
        </div>

        {/* Marker: MHF */}
        <div className="absolute top-[12%] right-[25%] flex items-center bg-white rounded-[30px] px-[12px] py-[6px] shadow-xl gap-[10px] z-20">
          <div className="w-[12px] h-[12px] rounded-full bg-[#05cc6d]"></div>
          <span className="text-[12px] text-black font-sans font-medium">MHF <span className="font-normal opacity-70 ml-2">2.03</span></span>
        </div>

        {/* Marker: VAF */}
        <div className="absolute bottom-[20%] right-[5%] flex items-center bg-white rounded-[30px] px-[12px] py-[6px] shadow-xl gap-[10px] z-20">
          <div className="w-[12px] h-[12px] rounded-full bg-[#f55600]"></div>
          <span className="text-[12px] text-black font-sans font-medium">VAF <span className="font-normal opacity-70 ml-2">1.17</span></span>
        </div>

        {/* Marker: BMF */}
        <div className="absolute top-[45%] left-[5%] flex items-center bg-white rounded-[30px] px-[12px] py-[6px] shadow-xl gap-[10px] z-20">
          <div className="w-[12px] h-[12px] rounded-full bg-[#0044ff]"></div>
          <span className="text-[12px] text-black font-sans font-medium">BMF <span className="font-normal opacity-70 ml-2">0.87</span></span>
        </div>

      </div>
    </div>
  );
}