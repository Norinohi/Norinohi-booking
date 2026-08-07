import BoatTypes from "./components/boat-types";
import BudgetFinder from "./components/budget-finder";
import EarnCta from "./components/earn-cta";
import Hero from "./components/hero";
import HowItWorks from "./components/how-it-works";
import PlanTrip from "./components/plan-trip";
import PopularDestinations from "./components/popular-destinations";
import PopularYachts from "./components/popular-yachts";
import SailingRoutes from "./components/sailing-routes";
import Testimonials from "./components/testimonials";

export default function HomePage() {
  return (
    <>
      <Hero />
      <div id="boat-types" className="scroll-mt-20">
        <BoatTypes />
      </div>
      <div id="find-by-budget" className="scroll-mt-20">
        <BudgetFinder />
      </div>
      <PlanTrip />
      <div id="destinations" className="scroll-mt-20">
        <PopularDestinations />
      </div>
      <div id="popular-routes" className="scroll-mt-20">
        <SailingRoutes />
      </div>
      <PopularYachts />
      <Testimonials />
      <HowItWorks />
      <EarnCta />
    </>
  );
}
