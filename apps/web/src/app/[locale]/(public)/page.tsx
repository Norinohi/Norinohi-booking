import { Hydrated } from "@/components/layout/hydrated";
import HomePage from "@/features/home";
import { prefetchHome } from "@/features/home/api/server";

export default async function Home() {
  const state = await prefetchHome();

  return (
    <Hydrated state={state}>
      <HomePage />
    </Hydrated>
  );
}
