import { screen, type ScreenEntry } from "../types"

import * as Home01 from "./home-01"

export const homeScreens: ScreenEntry[] = [
  screen("home-01", "1734:4658", Home01),
]
