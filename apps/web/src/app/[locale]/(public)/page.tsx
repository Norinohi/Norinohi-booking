import { Hydrated } from "@/components/layout/hydrated";
import HomePage from "@/features/home";
import { prefetchHome } from "@/features/home/api/server";
import { JsonLd, organizationNode } from "@/lib/json-ld";

export default async function Home() {
  const state = await prefetchHome();

  return (
    <>
      {/* Site identity, declared once on the root page rather than on every route. */}
      <JsonLd data={organizationNode()} />
      <Hydrated state={state}>
        <HomePage />
      </Hydrated>
    </>
  );
}
