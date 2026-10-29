"use client"

import * as React from "react"
import { motion, useMotionValue, useSpring } from "framer-motion"

export interface PredictMascotProps
    extends React.ComponentProps<typeof motion.svg> { }

export function PredictMascot({
    className = "size-30",
    ...props
}: PredictMascotProps) {
    const svgRef = React.useRef<SVGSVGElement>(null)

    const mouseX = useMotionValue(0)
    const mouseY = useMotionValue(0)

    const springConfig = {
        damping: 20,
        stiffness: 300,
    }

    const eyeX = useSpring(mouseX, springConfig)
    const eyeY = useSpring(mouseY, springConfig)

    React.useEffect(() => {
        const handleMouseMove = (event: MouseEvent) => {
            if (!svgRef.current) return

            const rect = svgRef.current.getBoundingClientRect()

            const centerX = rect.left + rect.width / 2
            const centerY = rect.top + rect.height / 2

            const deltaX = event.clientX - centerX
            const deltaY = event.clientY - centerY

            const angle = Math.atan2(deltaY, deltaX)
            const distance = Math.hypot(deltaX, deltaY)

            const maxDistance = 22
            const moveDistance = Math.min(distance / 15, maxDistance)

            mouseX.set(Math.cos(angle) * moveDistance)
            mouseY.set(Math.sin(angle) * moveDistance)
        }

        window.addEventListener("mousemove", handleMouseMove)

        return () => {
            window.removeEventListener("mousemove", handleMouseMove)
        }
    }, [mouseX, mouseY])

    return (
        <div className=" overflow-visible">
            <motion.svg
                ref={svgRef}
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 351 339"
                fill="currentColor"
                role="img"
                aria-label="PREDICT mascot"
                {...props}
                className={className}
                style={{
                    overflow: "visible",
                }}
            >
                {/* Main Head */}
                <rect
                    x={47}
                    width={258}
                    height={258}
                    rx={129}
                    className="fill-primary"
                />

                {/* Left Eye */}
                <motion.rect
                    x={110}
                    y={85}
                    width={33}
                    height={54}
                    rx={16.5}
                    className="fill-background"
                    style={{
                        x: eyeX,
                        y: eyeY,
                        transformOrigin: "126.5px 112px",
                    }}
                    animate={{
                        scaleY: [1, 1, 0.08, 1, 1],
                    }}
                    transition={{
                        duration: 4.2,
                        repeat: Infinity,
                        repeatDelay: 1.8,
                        times: [0, 0.44, 0.48, 0.54, 1],
                        ease: "easeInOut",
                    }}
                />

                {/* Right Eye */}
                <motion.rect
                    x={180}
                    y={85}
                    width={33}
                    height={54}
                    rx={16.5}
                    className="fill-background"
                    style={{
                        x: eyeX,
                        y: eyeY,
                        transformOrigin: "196.5px 112px",
                    }}
                    animate={{
                        scaleY: [1, 1, 0.08, 1, 1],
                    }}
                    transition={{
                        duration: 4.2,
                        repeat: Infinity,
                        repeatDelay: 1.8,
                        times: [0, 0.44, 0.48, 0.54, 1],
                        ease: "easeInOut",
                    }}
                />

                {/* Left Leg */}
                <path
                    d="M47 339L80.7336 339L80.7336 285.45C80.7336 271.281 92.3311 259.734 106.45 259.734L160 259.734L160 226L106.45 226C82.9523 226 62.4801 239.816 52.8492 259.734C49.0674 267.549 47 276.273 47 285.45L47 339Z"
                    className="fill-primary"
                />

                {/* Left Center Leg */}
                <path
                    d="M119 339L152.734 339L152.734 285.45C152.734 271.281 164.331 259.734 178.45 259.734L232 259.734L232 226L178.45 226C154.952 226 134.48 239.816 124.849 259.734C121.067 267.549 119 276.273 119 285.45L119 339Z"
                    className="fill-primary"
                />

                {/* Right Center Leg */}
                <path
                    d="M305 339L271.266 339L271.266 285.45C271.266 271.281 259.669 259.734 245.55 259.734L192 259.734L192 226L245.55 226C269.048 226 289.52 239.816 299.151 259.734C302.933 267.549 305 276.273 305 285.45L305 339Z"
                    className="fill-primary"
                />

                {/* Right Leg */}
                <path
                    d="M236 339L202.266 339L202.266 285.45C202.266 271.281 190.669 259.734 176.55 259.734L123 259.734L123 226L176.55 226C200.048 226 220.52 239.816 230.151 259.734C233.933 267.549 236 276.273 236 285.45L236 339Z"
                    className="fill-primary"
                />

                {/* Right Hand */}
                <motion.path
                    d="M351 126L317.266 126L317.266 179.55C317.266 193.719 305.669 205.266 291.55 205.266L238 205.266L238 239L291.55 239C315.048 239 335.52 225.184 345.151 205.266C348.933 197.451 351 188.727 351 179.55L351 126Z"
                    className="fill-primary"
                    animate={{
                        x: [0, 5, 0, -5, 0],
                        rotate: [0, 2, 0, -2, 0],
                    }}
                    transition={{
                        duration: 3.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    style={{
                        transformOrigin: "290px 180px",
                    }}
                />

                {/* Left Hand */}
                <motion.path
                    d="M1.04597e-06 126L33.7336 126L33.7336 179.55C33.7336 193.719 45.3311 205.266 59.4498 205.266L113 205.266L113 239L59.4498 239C35.9523 239 15.4801 225.184 5.84918 205.266C2.06738 197.451 3.78788e-06 188.727 3.38673e-06 179.55L1.04597e-06 126Z"
                    className="fill-primary"
                    animate={{
                        x: [0, -5, 0, 5, 0],
                        rotate: [0, -2, 0, 2, 0],
                    }}
                    transition={{
                        duration: 3.5,
                        repeat: Infinity,
                        ease: "easeInOut",
                    }}
                    style={{
                        transformOrigin: "60px 180px",
                    }}
                />
            </motion.svg>
        </div>
    )
}