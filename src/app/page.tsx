import { Hero } from "@/components/landing/Hero";
import { PlanPanel } from "@/components/landing/PlanPanel";
import { Capabilities } from "@/components/landing/Capabilities";
import { Platforms } from "@/components/landing/Platforms";
import { Toolchain } from "@/components/landing/Toolchain";
import { SiteNav } from "@/components/landing/SiteNav";
import { SiteFooter } from "@/components/landing/SiteFooter";

export default function LandingPage() {
  return (
    <div className="landing">
      <SiteNav />
      <main>
        <Hero />
        <PlanPanel />
        <Capabilities />
        <Platforms />
        <Toolchain />
      </main>
      <SiteFooter />
    </div>
  );
}
