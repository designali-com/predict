"use client"

import { useEffect, useRef, useState } from "react"

const PHOTO =
  "https://www.fortishealthcare.com/drupal-data/styles/doctor_image/azblob/doctors/dr-akash--jaiswal-3350.png?itok=pGoreiy5"

/**
 * Dr. Akash Jaiswal's photo over his initials. The photo stays invisible until
 * it has actually loaded, so a blocked or broken image leaves the initials,
 * never a broken-image icon or alt text.
 */
export function DoctorPhoto() {
  const ref = useRef<HTMLImageElement>(null)
  const [loaded, setLoaded] = useState(false)

  // A load that finished before React hydrated never reaches onLoad.
  useEffect(() => {
    const img = ref.current
    if (img?.complete && img.naturalWidth > 0) setLoaded(true)
  }, [])

  return (
    <div className="relative flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#c8e6b0] text-lg font-semibold text-[#133f26] ring-2 ring-white/20">
      AJ
      <img
        ref={ref}
        src={PHOTO}
        alt=""
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        className={`absolute inset-0 size-full object-cover object-top transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  )
}
