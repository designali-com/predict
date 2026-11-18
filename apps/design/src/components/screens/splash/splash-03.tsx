import { Screen } from "../screen"

export const title = "iOS home screen"

// Figma: iPhone 18 Pro - 119 (1733:1872)
// The iOS home screen (status bar, system app icons, dock) is a single render;
// the PREDICT app icon sits in row 5 with a "17" badge.
export default function Splash03() {
  return (
    <Screen>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/screens/splash/ios-home-screen.png"
        alt="iOS home screen with the PREDICT app icon"
        className="size-full object-cover"
      />
    </Screen>
  )
}
