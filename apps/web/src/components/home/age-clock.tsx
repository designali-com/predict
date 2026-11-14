
import type React from "react";

import { Badge } from "@workspace/ui/components/badge";
import { BioClock } from "@workspace/ui/components/predict/bio-clock";

export function AgeClockSection() {
    return (
        <div className="border-b border-dashed">
            <div className="flex items-center pt-20 pb-8 mx-auto max-w-md text-center space-y-4 justify-center w-full flex-col">
                <Badge>
                    Quantified Self
                </Badge>
                <h1 className="text-3xl font-medium">
                    Why We Built <br /> Bio-AgeClocks™.
                </h1>
                <p className="text-muted-foreground">
                    Health should be measured before it is felt.
                </p>
            </div>
            <div className="mx-auto flex flex-col md:flex-row w-full items-center justify-center gap-6 px-6">
                {/* Left Side */}
                <div className="md:w-[25%] w-full space-y-4 shrink-0 rounded-xl border p-6">
                    <h1>
                        Muscle, nerves, blood vessels, bone, and joints age together.
                    </h1>
                    <h1>
                        Bio-AgeClocks™ decode these hidden signals to measure structural aging - years before symptoms appear.
                    </h1>
                </div>

                {/* Center Component */}
                <div className="flex w-20 md:w-[50%] w-full items-center justify-center">
                    <div className="relative p-2">
                        <img
                            alt="app screen"
                            className="z-2 object-contain dark:hidden"
                            height="1080"
                            src="/images/age-clock-light.jpg"
                            width="1920"
                        />
                        <video
                            className="hidden object-contain bg-background dark:block"
                            autoPlay 
                            muted
                            playsInline
                            preload="metadata"
                        >
                            <source src="/videos/clock.mp4" type="video/mp4" />
                        </video>
                    </div>
                </div>

                <div className="md:w-[25%] mb-10 md:mb-0 w-full shrink-0 rounded-xl border p-6">
                    <ul className="space-y-3 text-sm">
                        <li className="flex items-start gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>Proprietary Multidomain Algorithm</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>Built on 30,000+ Clinical Data Points</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>Patent Filed</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                            <span>Validated Through Peer-Reviewed Research</span>
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
} 