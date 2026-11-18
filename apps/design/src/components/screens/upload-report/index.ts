import { screen, type ScreenEntry } from "../types"

import * as UploadReport01 from "./upload-report-01"
import * as UploadReport02 from "./upload-report-02"
import * as UploadReport03 from "./upload-report-03"

export const uploadReportScreens: ScreenEntry[] = [
  screen("upload-report-01", "1737:5741", UploadReport01),
  screen("upload-report-02", "1737:5871", UploadReport02),
  screen("upload-report-03", "1737:6003", UploadReport03),
]
