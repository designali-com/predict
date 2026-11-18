"use client";

import React from "react";
import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const data = [
  { subject: "eGFR", reference: 100, patient: 70 },
  { subject: "Hs-CRP", reference: 100, patient: 120 },
  { subject: "IL-6", reference: 100, patient: 110 },
  { subject: "MDA", reference: 100, patient: 90 },
  { subject: "VEGF", reference: 100, patient: 80 },
  { subject: "MMP-9", reference: 100, patient: 130, value: 1.17, isHighlighted: true },
  { subject: "TGF-β1", reference: 100, patient: 70 },
  { subject: "BDNF", reference: 100, patient: 60 },
  { subject: "SP", reference: 100, patient: 120 },
  { subject: "HbA1c", reference: 100, patient: 90 },
  { subject: "TC", reference: 100, patient: 80 },
  { subject: "LDL-C", reference: 100, patient: 110 },
  { subject: "TG", reference: 100, patient: 100 },
  { subject: "HDL-C", reference: 100, patient: 60 },
  { subject: "COMP", reference: 100, patient: 70 },
  { subject: "CK-MM", reference: 100, patient: 80 },
  { subject: "Aldo A", reference: 100, patient: 90 },
  { subject: "CTX-II", reference: 100, patient: 130, value: 12.17, isHighlighted: true },
  { subject: "Ca/P", reference: 100, patient: 80 },
  { subject: "PTH", reference: 100, patient: 60 },
  { subject: "Vitamin D", reference: 100, patient: 70 },
  { subject: "Osteocalcin", reference: 100, patient: 110 },
  { subject: "Creatinine", reference: 100, patient: 90 },
  { subject: "BUN", reference: 100, patient: 80 },
];

export function BiomarkerRadarChart() {
  return (
    <div className="relative w-full h-full min-h-[400px] max-w-[624px] max-h-[607px] flex flex-col items-center justify-center mx-auto opacity-100">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={data}>
          {/* Custom Grid */}
          <PolarGrid gridType="polygon" stroke="#ffffff" strokeOpacity={0.1} />

          {/* Angle Axis (Labels) */}
          <PolarAngleAxis
            dataKey="subject"
            tick={{ fill: "#ffffff", fontSize: 9, opacity: 0.8, fontFamily: "sans-serif" }}
          />

          {/* Reference Range (Blue Line) */}
          <Radar
            name="Reference Range"
            dataKey="reference"
            stroke="#1d4ed8"
            strokeWidth={1}
            fill="transparent"
          />

          {/* Your values (filled) */}
          <Radar
            name="Your values"
            dataKey="patient"
            stroke="#d97706"
            strokeWidth={1.5}
            fill="#d97706"
            fillOpacity={0.2}
          />

          <Tooltip
            contentStyle={{ backgroundColor: "#000", borderColor: "#333", borderRadius: "8px" }}
            itemStyle={{ color: "#fff" }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex flex-row items-center justify-center gap-6 mt-4">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#1d4ed8]"></div>
          <span className="text-[10px] text-white opacity-80 font-sans">Reference Range</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-[#d97706]"></div>
          <span className="text-[10px] text-white opacity-80 font-sans">Your values</span>
        </div>
      </div>
    </div>
  );
}