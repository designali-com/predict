"use client"
import React, { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { DotGrid, GemSmoke } from "@paper-design/shaders-react";
import { Button } from "@workspace/ui/components/button";
import Link from "next/link";

export function GSAPLogoTilt() {
    const mainRef = useRef<HTMLElement | null>(null);
    const logoOuterRef = useRef<HTMLDivElement | null>(null);
    const logoInnerRef = useRef<SVGSVGElement | null>(null);

    useGSAP(
        () => {
            if (!mainRef.current || !logoOuterRef.current || !logoInnerRef.current) return;

            // Set perspective on main container
            gsap.set(mainRef.current, { perspective: 650 });

            // Create quickTo interpolators for smooth performance
            const outerRX = gsap.quickTo(logoOuterRef.current, "rotationX", {
                ease: "power3",
            });
            const outerRY = gsap.quickTo(logoOuterRef.current, "rotationY", {
                ease: "power3",
            });
            const innerX = gsap.quickTo(logoInnerRef.current, "x", {
                ease: "power3",
            });
            const innerY = gsap.quickTo(logoInnerRef.current, "y", {
                ease: "power3",
            });

            const handlePointerMove = (e: PointerEvent) => {
                outerRX(gsap.utils.interpolate(15, -15, e.y / window.innerHeight));
                outerRY(gsap.utils.interpolate(-15, 15, e.x / window.innerWidth));
                innerX(gsap.utils.interpolate(-30, 30, e.x / window.innerWidth));
                innerY(gsap.utils.interpolate(-30, 30, e.y / window.innerHeight));
            };

            const handlePointerLeave = () => {
                outerRX(0);
                outerRY(0);
                innerX(0);
                innerY(0);
            };

            const mainEl = mainRef.current;
            mainEl.addEventListener("pointermove", handlePointerMove);
            mainEl.addEventListener("pointerleave", handlePointerLeave);

            // Cleanup event listeners when component unmounts
            return () => {
                mainEl.removeEventListener("pointermove", handlePointerMove);
                mainEl.removeEventListener("pointerleave", handlePointerLeave);
            };
        },
        { scope: mainRef }
    );

    return (
        <div className="relative overflow-hidden"> {/* overflow-hidden added to contain dots if needed */}
            {/* 1. Main Content Layer - High z-index */}
            <div className="relative z-10">
                <div className="flex max-w-80 items-center md:max-w-md mx-auto text-center py-20 space-y-4 justify-center w-full flex-col">
                    <h1 className="text-3xl font-medium">
                        The earlier you know, <br /> the more you can change.

                    </h1>
                    <p className="text-muted-foreground">
                        Your invitation includes the Muscle Age™ & Leg Age™ assessment, a longevity retreat, and thirty days at a premier gym. Available to a limited number of founding members.

                    </p>
                </div>
                <main
                    ref={mainRef}
                    className="flex items-center justify-center w-full max-w-5xl mx-auto h-full select-none"
                >
                    <div
                        ref={logoOuterRef}
                        className="w-90 md:w-1/2 h-1/2 rounded-[3rem] flex items-center justify-center shadow-2xl/20 border border-dashed border-primary bg-background"
                    >
                        <GemSmoke
                            className='max-w-100 md:max-w-200 h-full xl:max-w-full'
                            width={1400}
                            height={300}
                            image="/logo-icon.svg"
                            colors={["#8606fe", "#e7e6df"]}
                            colorBack="#ffffff00"
                            colorInner="#fafaf5"
                            shape={undefined}
                            innerDistortion={0.8}
                            outerDistortion={0.6}
                            outerGlow={0.55}
                            innerGlow={1}
                            offset={0}
                            angle={0}
                            size={0.8}
                            speed={1}
                            scale={0.6}
                        />
                        <svg
                            className="absolute hidden"
                            ref={logoInnerRef}
                        >
                        </svg>

                    </div>
                </main>
                <div className="flex items-center py-20 space-y-4 justify-center w-full flex-col">
                    <Button nativeButton={false} render={<Link href="#waitlist" />} className="rounded-full" size="xl">
                        Get early access
                    </Button>
                </div>
            </div>
            <DotGrid
                className="absolute top-0 max-w-md md:max-w-full left-0 w-full h-full z-0 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_70%)]"
                width={1280}
                height={800}
                colorBack="#00000000"
                colorFill="#8606fe"
                colorStroke="#ffaa00"
                size={0.5}
                gapX={20}
                gapY={20}
                strokeWidth={0}
                sizeRange={0}
                opacityRange={0}
                shape="circle"
            />
        </div>
    );
}