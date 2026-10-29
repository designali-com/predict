"use client";

import { motion, type Variants } from "framer-motion";
import type * as React from "react";
import type { SVGProps } from "react";

interface LogoLoaderProps extends SVGProps<SVGSVGElement> {
  size?: number;
  duration?: number; // full loop duration in seconds
}

export const PredictLoader: React.FC<LogoLoaderProps> = ({
  size = 24,
  duration = 1.4,
  ...props
}) => {
  const pathVariants: Variants = {
    animate: (i: number) => ({
      opacity: [0, 1, 1, 0],
      scale: [0.6, 1, 1, 0.6],
      transition: {
        duration,
        times: [0, 0.3, 0.7, 1],
        repeat: Infinity,
        ease: "easeInOut",
        delay: i * (duration * 0.18), // stagger between the two strokes
      },
    }),
  };

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 12 12"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      role="status"
      aria-label="Loading"
      {...props}
    >
      <motion.path
        custom={0}
        variants={pathVariants}
        animate="animate"
        style={{ transformOrigin: "9.8px 8.9px" }}
        d="M11.2827 5.73682V7.60662H8.33242C7.55179 7.60662 6.91563 8.24945 6.91563 9.03203V12.0002H5.05713V9.03203C5.05713 7.72959 5.81831 6.59486 6.91563 6.06103C7.34623 5.85141 7.82682 5.73682 8.33242 5.73682H11.2827Z"
        fill="#8504FE"
      />
      <motion.path
        custom={1}
        variants={pathVariants}
        animate="animate"
        style={{ transformOrigin: "2.2px 3.1px" }}
        d="M0.6521 6.32195V4.43468H3.6302C4.41819 4.43468 5.06035 3.78584 5.06035 2.99594V0H6.93639V2.99594C6.93639 4.31055 6.16803 5.45589 5.06035 5.99471C4.6257 6.20629 4.14057 6.32195 3.6302 6.32195H0.6521Z"
        fill="#8504FE"
      />
    </svg>
  );
};