import { extractPdfText } from "./pdf";
import { parseReport } from "./parser";

interface UploadReportOptions {
  patientId?: string;
  reportType?: "initial" | "final";
  // Which visit this report was collected for — only meaningful alongside
  // patientId, and only honored server-side once verified to belong to
  // that patient.
  appointmentId?: string;
  // Biological age is only ever computed from the Final report — an Initial
  // report is provisional and must never feed the algorithm. Callers pass
  // this explicitly rather than it being inferred from reportType, so a
  // patient's own generic self-upload (no reportType at all) can still opt in.
  persistAndCalculate?: boolean;
}

export async function uploadAndParseReport(
  file: File,
  options: UploadReportOptions = {},
) {
  const formData = new FormData();
  formData.append("file", file);
  if (options.patientId) formData.append("patientId", options.patientId);
  if (options.reportType) formData.append("reportType", options.reportType);
  if (options.appointmentId) formData.append("appointmentId", options.appointmentId);

  const response = await fetch("/api/patient/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Upload failed");
  }

  if (file.type === "application/pdf") {
    const text = await extractPdfText(file);
    const report = parseReport(text);

    console.log("========================================");
    console.log("🩸 PARSED BIOMARKERS");
    console.log("========================================");
    console.table(
      Object.entries(report).map(([key, value]) => ({
        Biomarker: key,
        Value: value.value,
        Unit: value.unit,
        Alias: value.matchedAlias,
      })),
    );

    if (options.persistAndCalculate) {
      const saveResponse = await fetch("/api/patient/biomarker-readings/from-parsed-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportId: data.reportId,
          patientId: options.patientId,
          parsed: report,
        }),
      });
      const saveData = await saveResponse.json();

      console.log("========================================");
      console.log("💾 SAVED READINGS", saveData.savedReadings?.length ?? 0);
      console.log("========================================");
      console.table(saveData.savedReadings ?? []);

      if (saveData.unmatchedKeys?.length) {
        console.log("⚠️ Unmatched biomarker keys:", saveData.unmatchedKeys);
      }
      if (saveData.unitMismatches?.length) {
        console.log("⚠️ Unit mismatches (not saved — needs manual review):", saveData.unitMismatches);
      }
      if (saveData.calculationError) {
        console.log("⚠️ Biological age not recalculated:", saveData.calculationError);
      } else {
        console.log("🧬 Biological age results:", saveData.calculationResults);
      }
    }
  }

  return data as { success: boolean; url: string; reportId?: string };
}
