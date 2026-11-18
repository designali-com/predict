
import type React from "react";

import { Card } from "@workspace/ui/components/card";
import { Badge } from "@workspace/ui/components/badge";
import { NumberTicker } from "@workspace/ui/components/number-ticker";
import { Marquee, MarqueeContent, MarqueeEdge, MarqueeItem } from "@workspace/ui/components/marquee";

const testimonials = [
    {
        name: "Megha Gupta",
        profession: "Longevity Influencer",
        image: "/avatars/Megha-Gupta.jpg",
        description:
            "I underwent the LegAGE™ assessment and was genuinely surprised by how seamlessly complex biomarker science was translated into a consumer experience.",
    },
    {
        name: "Dr. Albery Hamiltion",
        profession: "Orthopaedic Surgeon & Research Collaborator, USA",
        image: "/avatars/Dr-Albery-Hamiltion.jpg",
        description:
            "For years we've measured disease after it appears. Technologies such as MuscleAGE™ may help us think differently—by quantifying biological burden before functional decline becomes apparent.",
    },
    {
        name: "Prof. Prasun Chatterjee, MD",
        profession: "Head, Geriatric Medicine, Apollo Hospitals",
        image: "/avatars/Prof-Prasun-Chatterjee.jpg",
        description:
            "MuscleAGE™ is a pathbreaking approach that may redefine how we identify risks associated with aging and chronic disease. We are excited to explore collaborations with PREDICT.",
    },
    {
        name: "Arjun Vaidya",
        profession: "Partner, V3 Ventures",
        image: "/avatars/Arjun-Vaidya.jpg",
        description:
            "I experienced the MuscleAGE™ assessment first hand and was impressed by both the science and the user journey. They told me a lot about my macros and aging that I had no idea about. Wishing Veeky and the PREDICT team success as they go out to build this category.",
    },
    {
        name: "Brian Mac Mahon",
        profession: "Co-Founder and Investor in Matchbook AI",
        image: "/avatars/Brian-Mac-Mahon.jpg",
        description:
            "Longevity is about to get very interesting",
    },
];

export function TestimonialsSection() {
    return (
        <div className="border-y border-dashed">
            <div className="flex items-center max-w-60 md:max-w-full mx-auto text-center pt-20 space-y-4 justify-center w-full flex-col">
                <NumberTicker
                    value={30000}
                    suffix="+"
                    className="text-5xl md:text-8xl traking-tightest font-medium"
                />

                <p className="text-muted-foreground">
                    BIOMARKER OBSERVATIONS
                </p>
                <p className="text-muted-foreground">
                    One assessment. Thousands of possibilities. Earlier answers.
                </p>
                <Badge className="my-10">
                    Testimonials
                </Badge>
            </div>

            <div className="relative">
                <Marquee
                    pauseOnHover
                    aria-label="Patient testimonials"
                    className="py-2 max-w-full"
                >
                    <MarqueeContent>
                        {testimonials.map((testimonial, index) => (
                            <MarqueeItem key={index} asChild>
                                <Card className="flex w-[420px] flex-col justify-between overflow-hidden p-0">
                                    <div className="p-6">
                                        <p className="text-xl leading-relaxed tracking-tight">
                                            "{testimonial.description}"
                                        </p>
                                    </div>
                                    <div className="flex border-t items-center gap-4 p-6">
                                        <img
                                            src={testimonial.image}
                                            alt={testimonial.name}
                                            className="h-40 w-40 object-cover object-top"
                                        />

                                        <div className="flex flex-col">
                                            <h5 className="text-base font-medium">
                                                {testimonial.name}
                                            </h5>
                                            <p className="text-sm text-muted-foreground">
                                                {testimonial.profession}
                                            </p>
                                        </div>
                                    </div>
                                </Card>
                            </MarqueeItem>
                        ))}
                    </MarqueeContent>

                    <MarqueeEdge side="left" />
                    <MarqueeEdge side="right" />
                </Marquee>
            </div>

            <div className="flex items-center py-10 space-y-4 justify-center w-full flex-col">
                <h1 className="text-xl font-medium">
                    What changed, in their words.
                </h1>

            </div>

        </div>
    );
} 