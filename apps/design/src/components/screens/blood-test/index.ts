import { screen, type ScreenEntry } from "../types"

import * as BloodTest01 from "./blood-test-01"
import * as BloodTest02 from "./blood-test-02"
import * as BloodTest03 from "./blood-test-03"
import * as BloodTest04 from "./blood-test-04"
import * as BloodTest05 from "./blood-test-05"
import * as BloodTest06 from "./blood-test-06"

export const bloodTestScreens: ScreenEntry[] = [
  screen("blood-test-01", "1738:7079", BloodTest01),
  screen("blood-test-02", "1738:7178", BloodTest02),
  screen("blood-test-03", "1739:7412", BloodTest03),
  screen("blood-test-04", "1739:7603", BloodTest04),
  screen("blood-test-05", "1739:7737", BloodTest05),
  screen("blood-test-06", "1739:8032", BloodTest06),
]
