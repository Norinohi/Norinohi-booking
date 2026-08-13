import { dehydrate, HydrationBoundary, QueryClient } from "@tanstack/react-query";

/*
 * Hydrated — the single HydrationBoundary a data-loading route wraps its subtree in.
 * The route passes a feature's server prefetch helper (features/<name>/api/server.ts);
 * it runs against a request-scoped QueryClient whose dehydrated state seeds the client
 * cache, so client hooks reading the same queryOptions render without refetching.
 */
export default async function Hydrated<TPrefetched>({
  prefetch,
  children,
}: {
  prefetch: (queryClient: QueryClient) => Promise<TPrefetched>;
  children: React.ReactNode;
}) {
  const queryClient = new QueryClient();
  await prefetch(queryClient);

  return <HydrationBoundary state={dehydrate(queryClient)}>{children}</HydrationBoundary>;
}
