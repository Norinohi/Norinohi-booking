import { Hydrated } from "@/components/layout/hydrated";
import HomePage from "@/features/home";
import { prefetchHome } from "@/features/home/api/server";

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export default async function Home() {
  const state = await prefetchHome();

  return (
    <Hydrated state={state}>
      <HomePage />
    </Hydrated>
  );
}
