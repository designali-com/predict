import { screen, type ScreenEntry } from "../types"

import * as Auth01 from "./auth-01"
import * as Auth02 from "./auth-02"
import * as Auth03 from "./auth-03"
import * as Auth04 from "./auth-04"
import * as Auth05 from "./auth-05"
import * as Auth06 from "./auth-06"
import * as Auth07 from "./auth-07"
import * as Auth08 from "./auth-08"
import * as Auth09 from "./auth-09"

export const authScreens: ScreenEntry[] = [
  screen("auth-01", "1733:1924", Auth01),
  screen("auth-02", "1733:1930", Auth02),
  screen("auth-03", "1733:1984", Auth03),
  screen("auth-04", "1733:2003", Auth04),
  screen("auth-05", "1733:2053", Auth05),
  screen("auth-06", "1733:1947", Auth06),
  screen("auth-07", "1733:1964", Auth07),
  screen("auth-08", "1733:2028", Auth08),
  screen("auth-09", "1733:3143", Auth09),
]
