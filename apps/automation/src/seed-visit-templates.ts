import "dotenv/config";
import { db } from "@workspace/db/client";
import { communicationTemplate } from "@workspace/db/schema";
import { formatVisitDate, formatVisitTime } from "./lib/visit-schedule";

// The same five post-booking messages as Dr. Ganguly's sequence, for any
// other appointment. No doctor's name. Same media, buttons, and wording.

const DIRECTIONS = {
  type: "URL" as const,
  text: "Get Directions",
  url: "https://www.google.com/maps/search/?api=1&query=OPTM+Health+Care+F-38+Block-F+South+Extension-1+New+Delhi+110049",
};

const SAMPLE_AT = new Date("2026-10-12T10:30:00+05:30");
const SAMPLE_NAME = "Ankit Gaur";
const SAMPLE_DATE = formatVisitDate(SAMPLE_AT);
const SAMPLE_TIME = formatVisitTime(SAMPLE_AT);

const MEDIA = {
  experts: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/9be2494f8b5bf419-pain-care-experts.png",
  testimonial: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/64a28b837a4b5f75-day-2-build-trust-5-testimonial-together-3.mp4",
  protocol: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/3c9de9ba25d8d3b5-day-4-supportive-nudge-avoid-knee-replacement-surgery-choose.mp4",
  dayBefore: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/174db462c20a7d0c-day-6-nurture.mp4",
  morning: "https://s3.ap-south-1.amazonaws.com/predict.fit-643620726493-ap-south-1-an/public/media/a382929e19c1f23d-day-5-final-nudge.jpg",
};

const TEMPLATES = [
  {
    key: "visit_confirmed",
    name: "Booking confirmed",
    category: "appointmentReminders",
    wabaCategory: "UTILITY",
    headerType: "IMAGE",
    headerMediaType: "image",
    headerMediaUrl: MEDIA.experts,
    variablesSchema: ["name", "date", "time"],
    bodyExamples: [SAMPLE_NAME, SAMPLE_DATE, SAMPLE_TIME],
    ctaButtons: [DIRECTIONS],
    bodyText: [
      "Hi {{1}}, 👋",
      "",
      "Your OPTM consultation is confirmed.",
      "",
      "📅 *Date:* {{2}}",
      "⏰ *Time:* {{3}}",
      "",
      "During your visit, you'll receive a detailed AI-based muscle health assessment and meet an expert who will explain your results and help design a natural, personalized plan for you.",
    ].join("\n"),
  },
  {
    key: "visit_testimonial",
    name: "Patient experiences",
    category: "marketing",
    wabaCategory: "MARKETING",
    headerType: "VIDEO",
    headerMediaType: "video",
    headerMediaUrl: MEDIA.testimonial,
    variablesSchema: ["name"],
    bodyExamples: [SAMPLE_NAME],
    ctaButtons: [],
    bodyText: [
      "Hi {{1}}, 👋",
      "",
      "Every patient's journey is different, and hearing from others can help you understand what to expect.",
      "",
      "Here are real patient experiences from people who have visited OPTM.",
    ].join("\n"),
  },
  {
    key: "visit_protocol",
    name: "What to expect",
    category: "marketing",
    wabaCategory: "MARKETING",
    headerType: "VIDEO",
    headerMediaType: "video",
    headerMediaUrl: MEDIA.protocol,
    variablesSchema: ["name"],
    bodyExamples: [SAMPLE_NAME],
    ctaButtons: [],
    bodyText: [
      "Hi {{1}}, 👋",
      "",
      "Your OPTM consultation is coming up.",
      "",
      "Before your visit, we'd like to share a little more about how we approach muscle health and what you can expect from your consultation.",
    ].join("\n"),
  },
  {
    key: "visit_day_before",
    name: "Day before the visit",
    category: "appointmentReminders",
    wabaCategory: "UTILITY",
    headerType: "VIDEO",
    headerMediaType: "video",
    headerMediaUrl: MEDIA.dayBefore,
    variablesSchema: ["name"],
    bodyExamples: [SAMPLE_NAME],
    ctaButtons: [],
    bodyText: [
      "Hi {{1}}, 👋",
      "",
      "Friendly reminder: your OPTM consultation is *tomorrow*.",
      "",
      "Please arrive *10 minutes early* for a smooth experience.",
      "",
      "During your visit, you'll go through a detailed assessment and consultation, followed by a personalized treatment plan based on your assessment.",
    ].join("\n"),
  },
  {
    key: "visit_morning",
    name: "Morning of the visit",
    category: "appointmentReminders",
    wabaCategory: "UTILITY",
    headerType: "IMAGE",
    headerMediaType: "image",
    headerMediaUrl: MEDIA.morning,
    variablesSchema: ["name", "time"],
    bodyExamples: [SAMPLE_NAME, SAMPLE_TIME],
    ctaButtons: [DIRECTIONS],
    bodyText: [
      "Good morning, {{1}} 🌞",
      "",
      "Your OPTM appointment is today at *{{2}}*.",
      "",
      "Please bring your previous medical reports and arrive *10 minutes early* for a smooth experience.",
      "",
      "We look forward to seeing you today.",
    ].join("\n"),
  },
];

async function seed() {
  let created = 0;
  for (const template of TEMPLATES) {
    const inserted = await db
      .insert(communicationTemplate)
      .values({
        key: template.key,
        name: template.name,
        channel: "whatsapp",
        category: template.category,
        providerTemplateName: template.key,
        variablesSchema: template.variablesSchema,
        ctaButtons: template.ctaButtons,
        headerMediaUrl: template.headerMediaUrl,
        headerMediaType: template.headerMediaType,
        wabaCategory: template.wabaCategory,
        language: "en_US",
        headerType: template.headerType,
        bodyText: template.bodyText,
        bodyExamples: template.bodyExamples,
        submissionStatus: "draft",
      })
      .onConflictDoNothing({ target: communicationTemplate.key })
      .returning({ key: communicationTemplate.key });
    if (inserted.length) created += 1;
  }
  console.log(`Templates: ${created} created, ${TEMPLATES.length - created} already there.`);
  console.log(`Sample date/time sent as "${SAMPLE_DATE}" / "${SAMPLE_TIME}".`);
  console.log(TEMPLATES.map((template) => template.key).join("\n"));
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
