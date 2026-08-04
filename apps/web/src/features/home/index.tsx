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

/*
 * Home landing page — Figma "Main Page" (node 530:3085), composed top-to-bottom.
 * Global chrome (NavigationBar + Footer) comes from the root layout; this renders the
 * body sections only. Content is static placeholder data per section for now.
 */
export default function HomePage() {
  return (
    <>
      <Hero />
      <BoatTypes />
      <BudgetFinder />
      <PlanTrip />
      <PopularDestinations />
      <SailingRoutes />
      <PopularYachts />
      <Testimonials />
      <HowItWorks />
      <EarnCta />
    </>
  );
}
