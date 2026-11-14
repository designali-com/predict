import localFont from "next/font/local";

export const NeueMontreal = localFont({
  src: [
    {
      path: "../fonts/NeueMontreal-Light.otf",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/NeueMontreal-Regular.otf",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/NeueMontreal-Medium.otf",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/NeueMontreal-Bold.otf",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-montreal",
  display: "swap",
});