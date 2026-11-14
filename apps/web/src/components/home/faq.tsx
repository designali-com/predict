import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@workspace/ui/components/accordion";

export function FaqsSection() {
    return (
        <div className="w-full h-full">
            <div className="mx-4 md:mx-auto h-full pb-20 md:pb-0 grid md:h-[calc(100vh-4rem)] grid-cols-1 border-dashed border border-b-0 md:mx-0 md:grid-cols-2 md:border-x-0">
                <div className="space-y-4 px-4 pt-10 md:pt-60 flex flex-col pb-4 md:border-r">
                    <h2 className="font-black text-3xl md:text-4xl">FAQs</h2>
                    <p className="text-muted-foreground w-80">
                        Here are some common questions and answers that you might encounter
                        when using Predict.
                    </p>
                </div>
                <div className="place-content-center">
                    <Accordion
                    defaultValue={["item-1"]}
                        className="rounded-none border-x-0 border-y" >
                        {questions.map((item) => (
                            <AccordionItem className="px-4" key={item.id} value={item.id}>
                                <AccordionTrigger className="py-4 hover:no-underline focus-visible:underline focus-visible:ring-0">
                                    {item.title}
                                </AccordionTrigger>
                                <AccordionContent className="pb-4 text-muted-foreground">
                                    {item.content}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </div>
    );
}

const questions = [
    {
        id: "item-1",
        title: "What is Predict?",
        content:
            "Predict is a muscle-health and biological-age platform built on a simple insight: muscle is the next vital sign. It uses proprietary biomarkers and Age Clocks—including MuscleAGE™, OrthoAGE™, and LegAGE™—to measure what's happening inside your body and turn those insights into a personalised plan across supplements, nutrition, movement, recovery, and health guidance.",
    },
    {
        id: "item-2",
        title: "Who can benefit from Predict?",
        content:
            "Predict is designed for adults aged 20–60 who want a clearer picture of their biological health. It can be particularly useful for people managing chronic conditions, those who haven't found answers through conventional healthcare, and longevity-focused individuals who want to actively optimise and track their health across muscle, cognitive, cardiovascular, metabolic, and musculoskeletal health.",
    },
    {
        id: "item-3",
        title: "What key features does Predict offer?",
        content: (
            <ul className="list-disc space-y-2 pl-5">
                <li>
                    <strong>Age Clocks</strong> — MuscleAGE™, OrthoAGE™, and
                    LegAGE™ provide a biological age reading across multiple
                    systems, rather than relying only on chronological age.
                </li>
                <li>
                    <strong>Multi-Agent AI Health Copilot</strong> — turns your
                    biomarker results into personalised day-to-day guidance across
                    supplements, nutrition, movement, recovery, sleep, and
                    metabolic health.
                </li>
                <li>
                    <strong>Supplements 2.0</strong> — AI-powered,
                    biomarker-guided supplement formulations personalised to your
                    biology instead of a generic supplement stack.
                </li>
                <li>
                    <strong>Dedicated Clinical Care</strong> — higher-tier
                    programs provide access to clinical specialists and follow-up
                    biomarker assessments to track progress over time.
                </li>
            </ul>
        ),
     },
    {
        id: "item-4",
        title: "How accurate is the science behind Predict?",
        content: (
            <div className="list-disc space-y-2 pl-5">
                <p>
                Predict's models are trained on 30,000+ Indian patient data points, specifically because conventional diagnostic labs are built on data that often doesn't reflect Indian biology. 
                 </p>
                <p>
                The underlying biological age clocks are peer-reviewed and published in journals including Nature, Wiley, and Aging. In an early clinical study of the MuscleAGE™ formula, patients showed measurable improvement over 16 weeks — for example, the Framework Score improved from 26.4 to 8.46, and the Age Acceleration Gap narrowed from 6.55 years to 2.10 years.

                </p> 
            </div>
        ),
     },
    {
        id: "item-5",
        title: "Does Predict work with my existing health data or wearables?",
        content: (
            <div className="list-disc space-y-2 pl-5">
                <p>
                Does Predict work with my existing health data or wearables? (reworded from "data stack integration" — there's no indication Predict is a business software integration)
                 </p>
                <p>
                Predict's core assessment is built on its own biomarker panel and proprietary Age Clocks rather than pulling in outside health data. The upcoming wearable (sEMG + ISF sensing) is designed to feed continuous data directly into your Predict profile automatically.

                </p> 
                <p>
                (The deck doesn't confirm whether existing lab reports, Apple Health/wearable data, or other diagnostic history can currently be imported — worth confirming before publishing this answer, since it's a common question for health-tech buyers.)

                </p> 
            </div>
        ),
     },
    {
        id: "item-6",
        title: "Is my health data secure on Predict?",
        content: (
            <div className="list-disc space-y-2 pl-5">
                <p>
                Protecting your health data is treated as fundamental — your biomarker and health data is stored securely and is never shared or sold to third parties without your consent.
                </p>
                <p>
                (This is a placeholder — for a health platform handling biomarker/clinical data, you'll want to state your actual compliance posture explicitly, e.g. India's DPDP Act, ABDM alignment, or ISO 27001, since generic reassurance carries little weight with health-data buyers.)

                </p> 
            </div>
        ),
    },
    {
        id: "item-7",
        title: "How do I get started with Predict?",
        content:
            "You can start with the Assess tier, which provides a biomarker assessment and establishes your baseline Health Score and Age Clock results. From there, you can continue with Optimize for ongoing AI-guided health support and personalised supplement and nutrition protocols, or choose Transform for dedicated clinical care, specialist support, and follow-up biomarker reassessment.",
    },
];