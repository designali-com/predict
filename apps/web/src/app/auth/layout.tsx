import { AuthHeader } from "@/src/components/auth/header"



export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="">
      <AuthHeader />
      <div className="">
        <div className="mx-auto relative border-x border-dashed max-w-7xl px-6 h-full">
          {children}
          <div
            className="absolute w-full h-full inset-0 z-0"
            style={{
              background:
                "radial-gradient(400% 100% at 50% 10%, var(--background) 70%, #8504FE 100%)",
            }}
          />
        </div>
      </div>
    </div>
  )
}
