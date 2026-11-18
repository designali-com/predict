import type { ScreenGroup } from "./types"

import { splashScreens } from "./splash"
import { authScreens } from "./auth"
import { registeredScreens } from "./registered"
import { onboardingScreens } from "./onboarding"
import { wearablesScreens } from "./wearables"
import { uploadReportScreens } from "./upload-report"
import { bloodTestScreens } from "./blood-test"
import { homeScreens } from "./home"

/** Section 8 of the Figma "App Design" page, in reading order. */
export const screenGroups: ScreenGroup[] = [
  { slug: "splash", title: "Splash", screens: splashScreens },
  { slug: "auth", title: "Login & Sign up", screens: authScreens },
  { slug: "registered", title: "Already Registered", screens: registeredScreens },
  { slug: "onboarding", title: "Onboarding", screens: onboardingScreens },
  { slug: "wearables", title: "Connect Wearables", screens: wearablesScreens },
  { slug: "upload-report", title: "Upload report", screens: uploadReportScreens },
  { slug: "blood-test", title: "Book Blood Test", screens: bloodTestScreens },
  { slug: "home", title: "Home Screen", screens: homeScreens },
]
