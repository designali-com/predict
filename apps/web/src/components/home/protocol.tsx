
import type React from "react";

import { Card } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge"; 

export function ProtocolSection() {
    return (
        <div>
            <div className="flex items-center py-20 space-y-4 justify-center w-full flex-col">
                <Badge>
                    How It Works
                </Badge>
                <h1 className="text-3xl font-medium">
                    The protocol.
                </h1>

            </div>
            <div className="mx-auto grid border-b border-dashed gap-3 p-3 md:grid-cols-3">
                <Card className="relative w-full h-100 p-0">
                 
                    <div className="flex h-full flex-col justify-between p-10">
                        <div className="flex justify-end">
                            <h2 className="text-5xl text-foreground/20 font-medium">Day 1</h2>
                        </div>
                        <div className="max-w-sm z-10">
                            <h1 className="text-3xl font-medium">At Home</h1>
                            <p className="mt-3 text-muted-foreground leading-relaxed">
                                A certified phlebotomist visits your home to collect a comprehensive
                                45-biomarker blood panel and perform a body composition assessment-no
                                clinic visits, no waiting rooms.
                            </p>
                        </div>
                    </div>
                    <div className="pointer-events-none absolute -bottom-50 left-1/2 h-60 w-full -translate-x-1/2 rounded-full bg-gradient-to-t from-primary via-primary to-transparent blur-2xl" />
                    <div className="pointer-events-none absolute -top-60 left-1/2 h-50 w-full -translate-x-1/2 rounded-full bg-gradient-to-t from-primary via-primary to-transparent blur-2xl" />
                    
                </Card>
                <Card className="relative w-full h-100 p-0">
                    <div className="flex h-full flex-col justify-between p-10">
                        <div className="flex justify-end">
                            <h2 className="text-5xl text-foreground/20 font-medium">Day 2-3</h2>
                        </div>
                        <div className="max-w-sm z-10">
                            <h1 className="text-3xl font-medium">Your score</h1>
                            <p className="mt-3 text-muted-foreground leading-relaxed">
                                The Muscle Age Clock runs overnight. Your biological age, across six physiological systems, appears on your dashboard within 48 hours.
                            </p>
                        </div>
                    </div>
                    <div className="pointer-events-none absolute -bottom-50 left-1/2 h-60 w-full -translate-x-1/2 rounded-full bg-gradient-to-t from-primary via-primary to-transparent blur-2xl" />
                    <div className="pointer-events-none absolute -top-60 left-1/2 h-50 w-full -translate-x-1/2 rounded-full bg-gradient-to-t from-primary via-primary to-transparent blur-2xl" />

                </Card>
                <Card className="relative w-full h-100 p-0">
                    <div className="flex h-full flex-col justify-between p-10">
                        <div className="flex justify-end">
                            <h2 className="text-5xl text-foreground/20 font-medium">Day 4-7</h2>
                        </div>
                        <div className="max-w-sm z-10">
                            <h1 className="text-3xl font-medium">Specialist review</h1>
                            <p className="mt-3 text-muted-foreground leading-relaxed">
                                Six specialists review your results and build a protocol - training, nutrition, supplementation - from your exact biomarker profile. Not a template.
                            </p>
                        </div>
                    </div>
                    <div className="pointer-events-none absolute -bottom-50 left-1/2 h-60 w-full -translate-x-1/2 rounded-full bg-gradient-to-t from-primary via-primary to-transparent blur-2xl" />
                    <div className="pointer-events-none absolute -top-60 left-1/2 h-50 w-full -translate-x-1/2 rounded-full bg-gradient-to-t from-primary via-primary to-transparent blur-2xl" />

                </Card>
            </div>
        </div>
    );
} 