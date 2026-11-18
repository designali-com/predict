import { screen, type ScreenEntry } from "../types"

import * as Wearables01 from "./wearables-01"
import * as Wearables02 from "./wearables-02"
import * as Wearables03 from "./wearables-03"
import * as Wearables04 from "./wearables-04"

export const wearablesScreens: ScreenEntry[] = [
  screen("wearables-01", "1736:5153", Wearables01),
  screen("wearables-02", "1737:5408", Wearables02),
  screen("wearables-03", "1737:5563", Wearables03),
  screen("wearables-04", "1737:6145", Wearables04),
]
