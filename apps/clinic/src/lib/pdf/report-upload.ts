import { extractPdfText } from "./pdf";
import { parseReport, type ParsedReport } from "./parser";

export interface UploadReportOptions {
  patientId?: string;
  /**
   * The chart, for a patient with no app account.
   *
   * A report belongs to the patient, and every patient has a chart from the
   * first booking — most walk-ins never sign up at all. Sent when there is no
   * patientId to send.
   */
  chartId?: string;
  reportType?: "initial" | "final";
  // Which visit this report was collected for — only meaningful alongside
  // patientId, and only honored server-side once verified to belong to
  // that patient.
  appointmentId?: string;
  /** The blood test this sheet fulfils, when it was ordered here. */
  bloodTestOrderId?: string;
  /**
   * Whether to read the biomarker values out of the PDF.
   *
   * Reading them is all this does. Nothing is saved: the values come back for
   * a person to check against the sheet, and only what they confirm becomes
   * a reading. This used to write straight to the database on upload, so a
   * misread number turned into a biological age with nobody having seen it.
   */
  autoParse?: boolean;
}

export interface UploadResult {
  success: boolean;
  url: string;
  reportId?: string;
  /** Present only when autoParse was asked for and the file was a PDF. */
  parsed?: ParsedReport;
  /** Why nothing was read, when that is worth telling the person. */
  parseError?: string;
}

/**
 * Put the file where it belongs, and optionally read it.
 *
 * The upload is what must not fail: a sheet that is filed but unread can be
 * typed in by hand, while a sheet that never uploaded is gone. So a parsing
 * failure is reported alongside a successful upload, never instead of one.
 */
export async function uploadAndParseReport(
  file: File,
  options: UploadReportOptions = {},
): Promise<UploadResult> {
  const formData = new FormData();
  formData.append("file", file);
  if (options.patientId) formData.append("patientId", options.patientId);
  if (options.chartId) formData.append("chartId", options.chartId);
  if (options.reportType) formData.append("reportType", options.reportType);
  if (options.appointmentId) formData.append("appointmentId", options.appointmentId);
  if (options.bloodTestOrderId)
    formData.append("bloodTestOrderId", options.bloodTestOrderId);

  const response = await fetch("/api/staff/upload", {
    method: "POST",
    body: formData,
  });

  // Read as text first. A failing route does not always answer in JSON — a
  // stale dev server returns Next's 404 page, an unhandled throw returns an
  // error page — and calling .json() on those throws a parse error that
  // replaces the real failure with "Unexpected token '<'".
  const raw = await response.text();
  let data: { url?: string; reportId?: string; error?: string } = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = {};
  }

  if (!response.ok) {
    // The status and the path are in the message because "Unauthorized" on
    // its own does not say which of the three requests in this flow refused,
    // which is the first thing anybody needs to know.
    throw new Error(
      `${data.error || raw.slice(0, 120) || "Upload failed"} (${response.status} from /api/staff/upload)`,
    );
  }

  const result: UploadResult = {
    success: true,
    url: data.url ?? "",
    reportId: data.reportId,
  };

  if (!options.autoParse) return result;

  if (file.type !== "application/pdf") {
    result.parseError = "Only a PDF can be read automatically — type these values in by hand.";
    return result;
  }

  try {
    result.parsed = parseReport(await extractPdfText(file));
  } catch (error) {
    result.parseError =
      error instanceof Error
        ? `Couldn't read the PDF: ${error.message}`
        : "Couldn't read the PDF.";
  }

  return result;
}
