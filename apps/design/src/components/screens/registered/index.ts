import { screen, type ScreenEntry } from "../types"

import * as Registered01 from "./registered-01"
import * as Registered02 from "./registered-02"

export const registeredScreens: ScreenEntry[] = [
  screen("registered-01", "1733:3693", Registered01),
  screen("registered-02", "1733:3897", Registered02),
]
