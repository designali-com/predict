import { screen, type ScreenEntry } from "../types"

import * as Onboarding01 from "./onboarding-01"
import * as Onboarding02 from "./onboarding-02"
import * as Onboarding03 from "./onboarding-03"
import * as Onboarding04 from "./onboarding-04"

export const onboardingScreens: ScreenEntry[] = [
  screen("onboarding-01", "1737:6689", Onboarding01),
  screen("onboarding-02", "1737:6816", Onboarding02),
  screen("onboarding-03", "1737:6783", Onboarding03),
  screen("onboarding-04", "1737:6746", Onboarding04),
]
