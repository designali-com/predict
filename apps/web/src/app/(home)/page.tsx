import { AgeClockSection } from "@/src/components/home/age-clock";
import { AskSection } from "@/src/components/home/ask";
import { DashboardSection } from "@/src/components/home/dashboard";
import { FaqsSection } from "@/src/components/home/faq";
import { BiologySection } from "@/src/components/home/biology";
import { HeroSection } from "@/src/components/home/hero";
 
import { GSAPLogoTilt } from "@/src/components/home/logo-card";
import { MarqueeLogo } from "@/src/components/home/logos";
import { MuscleSection } from "@/src/components/home/muscle";
import { ProtocolSection } from "@/src/components/home/protocol";
import { TestimonialsSection } from "@/src/components/home/testimonials";
import { WaitlistSection } from "@/src/components/home/waitlist";

export default function Page() {
  return (
    <div className="">
      <HeroSection />
      <div className="border-t border-dashed">
        <div className="xl:border-x border-dashed mx-auto container">
          <MuscleSection />
          <AgeClockSection />
          <DashboardSection />
          <ProtocolSection />
          <BiologySection/>
          <AskSection />
        </div>
        <TestimonialsSection />
        <div className="xl:border-x border-dashed mx-auto container">
          <GSAPLogoTilt/>
          <FaqsSection />  
        </div>
        <WaitlistSection />
      </div>
    </div>
  )
}
