
import type React from "react";

import { Card } from "@workspace/ui/components/card";

export function MuscleSection() {
    return (
        <div>
            <div className="flex items-center mx-auto max-w-60 md:max-w-md text-center py-20 space-y-4 justify-center w-full flex-col">
                <h1 className="text-3xl font-medium">
                    Why Muscle, Why Blood
                </h1>
                <p className="text-muted-foreground">
                    Muscle doesn't fail in isolation. It takes four systems with it.
                </p>
            </div>
            <div className="mx-auto grid border-b border-dashed gap-3 p-3 md:grid-cols-2">
                <Card className="relative w-full p-0 h-90 md:h-110">

                    <img
                        src="/images/cardiovascular-dark.jpg"
                        alt="Cardiovascular System"
                        className="absolute hidden object-bottom dark:block object-bottom inset-0 w-full h-full object-contain"
                    />

                    <img
                        src="/images/cardiovascular-light.jpg"
                        alt="Cardiovascular System"
                        className="absolute dark:hidden object-bottom inset-0 w-full h-full object-contain"
                    />

                    <div className="relative z-10 text-center py-10 space-y-4">
                        <h1 className="text-3xl font-medium">Cardiovascular</h1>
                        <p className="mx-auto max-w-80 text-muted-foreground">
                            Low muscle mass doubles cardiovascular risk - visible in blood a decade
                            before a cardiac event.
                        </p>
                    </div>
                </Card>
                <Card className="relative w-full p-0 h-90 md:h-110">

                    <img
                        src="/images/meta-dark.jpg"
                        alt="Cardiovascular System"
                        className="absolute hidden  object-bottom dark:block inset-0 w-full h-full object-contain"
                    />

                    <img
                        src="/images/meta-light.jpg"
                        alt="Cardiovascular System"
                        className="absolute dark:hidden object-bottom inset-0 w-full h-full object-contain"
                    />

                    <div className="relative z-10 text-center py-10 space-y-4">
                        <h1 className="text-3xl font-medium">Metabolism</h1>
                        <p className="mx-auto max-w-80 text-muted-foreground">
                        Every 10% increase in muscle mass reduces insulin resistance by 11%. Blood tracks the shift in real time.
                        </p>
                    </div>
                </Card>
                <Card className="relative w-full p-0 h-90 md:h-110">

                    <img
                        src="/images/bone-dark.jpg"
                        alt="Cardiovascular System"
                        className="absolute hidden object-bottom dark:block inset-0 w-full h-full object-contain"
                    />

                    <img
                        src="/images/bone-light.jpg"
                        alt="Cardiovascular System"
                        className="absolute dark:hidden object-bottom inset-0 w-full h-full object-contain"
                    />

                    <div className="relative z-10 text-center py-10 space-y-4">
                        <h1 className="text-3xl font-medium">Bone & Joint</h1>
                        <p className="mx-auto max-w-80 text-muted-foreground">
                        Muscle weakness is the leading predictor of fracture after 40. Bone decline starts at 45. Screening starts at 65 - twenty years late.
                        </p>
                    </div>
                </Card>
                <Card className="relative w-full p-0 h-90 md:h-110">

                    <img
                        src="/images/brain-dark.jpg"
                        alt="Cardiovascular System"
                        className="absolute hidden dark:block object-bottom inset-0 w-full h-full object-contain"
                    />

                    <img
                        src="/images/brain-light.jpg"
                        alt="Cardiovascular System"
                        className="absolute dark:hidden object-bottom inset-0 w-full h-full object-contain"
                    />

                    <div className="relative z-10 text-center py-10 space-y-4">
                        <h1 className="text-3xl font-medium">Cognitive Health</h1>
                        <p className="mx-auto max-w-80 text-muted-foreground">
                        Brain function declines with muscle through inflammation and insulin sensitivity - all readable in a single blood panel.
                        </p>
                    </div>
                </Card>

            </div>
        </div>
    );
} 