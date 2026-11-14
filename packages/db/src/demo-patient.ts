import { randomUUID } from "node:crypto";
import type { db as Db } from "./client";
import {
  account,
  biologicalAgeResult,
  biomarker,
  biomarkerDomain,
  biomarkerIndex,
  biomarkerReading,
  contact,
  domainAgeResult,
  domainBiomarkerMap,
  indexDomainMap,
  patientRecord,
  report,
  user,
} from "./schema";
import { BIOMARKER_CATALOG } from "./demo-fixtures/biomarker-catalog";
import { DEMO_PATIENT_RESULTS } from "./demo-fixtures/demo-patient-results";

/**
 * The demo patient — what the patient site's dashboard shows.
 *
 * One fictional person with a full blood panel: the biomarker catalogue (the
 * platform's real reference ranges and domains), their readings, a lab report,
 * and the biological age the platform's own calculation gives for them
 * (computed once with apps/clinic's run-calculation and kept in
 * demo-fixtures/demo-patient-results, so every reset shows the same score).
 */

type Database = typeof Db;

export const DEMO_PATIENT_EMAIL = "patient@demo.predict.fit";

/** A one-page PDF saying it is a demo report — what "view report" opens. */
const SAMPLE_REPORT_PDF = (() => {
  const text = "Predict demo - sample blood report (fictional patient)";
  const stream = `BT /F1 16 Tf 60 760 Td (${text}) Tj ET`;
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return `data:application/pdf;base64,${Buffer.from(pdf).toString("base64")}`;
})();

/** A believable panel: most markers healthy, a few out of range the way a 40s desk worker's would be. */
function readingFor(b: (typeof BIOMARKER_CATALOG.biomarkers)[number], i: number): number {
  const min = b.range_min ?? 0;
  const max = b.range_max ?? (min ? min * 2 : 10);
  const span = max - min || 1;
  // Fixed pattern so every reset gives the same panel: every third marker drifts.
  const off = i % 3 === 1;
  const value = off
    ? b.direction
      ? max + span * (0.12 + (i % 5) * 0.06) // higher is worse → above range
      : Math.max(0, min - span * (0.1 + (i % 4) * 0.05)) // lower is worse → below range
    : min + span * (0.3 + (i % 4) * 0.12);
  return Math.round(value * 100) / 100;
}

export async function seedDemoPatient(
  db: Database,
  opts: { clinicId: string; passwordHash: string; now: number },
): Promise<{ readings: number; scored: boolean }> {
  const { clinicId, passwordHash, now } = opts;
  const DAY = 86_400_000;
  const cat = BIOMARKER_CATALOG;

  // The catalogue, with its own ids, so the stored results below line up.
  await db.insert(biomarkerIndex).values(cat.indexes.map((x) => ({ id: x.id, name: x.name, shortCode: x.short_code, description: x.description, k: x.k, riskBands: x.risk_bands })));
  await db.insert(biomarkerDomain).values(cat.domains.map((x) => ({ id: x.id, name: x.name, shortCode: x.short_code, description: x.description })));
  await db.insert(biomarker).values(
    cat.biomarkers.map((x) => ({ id: x.id, name: x.name, shortCode: x.short_code, description: x.description, unit: x.unit, rangeMin: x.range_min, rangeMax: x.range_max, direction: x.direction, priceInPaise: x.price_in_paise })),
  );
  await db.insert(indexDomainMap).values(cat.indexDomains.map((x) => ({ indexId: x.index_id, domainId: x.domain_id, riskBands: x.risk_bands })));
  await db.insert(domainBiomarkerMap).values(cat.domainBiomarkers.map((x) => ({ domainId: x.domain_id, biomarkerId: x.biomarker_id })));

  // The person.
  const userId = "demo-patient-user";
  const contactId = randomUUID();
  const patientId = "demo-patient-chart";
  const joined = new Date(now - 40 * DAY);
  await db.insert(user).values({ id: userId, name: "Rohit Malhotra (Demo)", email: DEMO_PATIENT_EMAIL, emailVerified: true, role: "user", createdAt: joined, updatedAt: joined });
  await db.insert(account).values({ id: randomUUID(), accountId: userId, providerId: "credential", userId, password: passwordHash, createdAt: joined, updatedAt: joined });
  await db.insert(contact).values({ id: contactId, name: "Rohit Malhotra (Demo)", phone: "917000099999", email: DEMO_PATIENT_EMAIL, stage: "PATIENT", source: "WEBSITE", clinicId, city: "New Delhi", leadStatus: "VISITED", userId, createdAt: joined, updatedAt: joined });
  await db.insert(patientRecord).values({
    id: patientId, sequenceNo: 9999, patientCode: "P009999", contactId, userId, firstName: "Rohit", lastName: "Malhotra (Demo)",
    gender: "MALE", dateOfBirth: "1981-06-14", mobileNumber: "917000099999", email: DEMO_PATIENT_EMAIL, createdAt: joined, updatedAt: joined,
  });

  // The blood test, ten days ago.
  const drawn = new Date(now - 10 * DAY);
  const reportId = "demo-patient-report";
  await db.insert(report).values({ id: reportId, patientId, userId, fileUrl: SAMPLE_REPORT_PDF, fileName: "Demo blood report.pdf", reportType: "final", collectedOn: drawn.toISOString().slice(0, 10), uploadedAt: drawn });
  const readings = cat.biomarkers.map((b, i) => ({
    patientId, userId, reportId, biomarkerId: b.id, value: readingFor(b, i), collectedOn: drawn.toISOString().slice(0, 10), recordedAt: drawn,
  }));
  await db.insert(biomarkerReading).values(readings);

  // The score, as the platform computed it for exactly these readings.
  if (DEMO_PATIENT_RESULTS) {
    for (const r of DEMO_PATIENT_RESULTS) {
      const resultId = randomUUID();
      await db.insert(biologicalAgeResult).values({
        id: resultId, patientId, userId, indexId: r.indexId, reportId, chronologicalAge: r.chronologicalAge, compositeScore: r.compositeScore,
        deltaAge: r.deltaAge, biologicalAge: r.biologicalAge, calculatedAt: drawn, createdAt: drawn,
      });
      if (r.domains.length) await db.insert(domainAgeResult).values(r.domains.map((d) => ({ ...d, resultId })));
    }
  }
  return { readings: readings.length, scored: !!DEMO_PATIENT_RESULTS };
}
