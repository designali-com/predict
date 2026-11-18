import { screen, type ScreenEntry } from "../types"

import * as Splash01 from "./splash-01"
import * as Splash02 from "./splash-02"
import * as Splash03 from "./splash-03"

export const splashScreens: ScreenEntry[] = [
  screen("splash-01", "1733:1862", Splash01),
  screen("splash-02", "1733:1867", Splash02),
  screen("splash-03", "1733:1872", Splash03),
]
