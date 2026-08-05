import { orpc } from "@/utils/orpc";

export const facetsQueryOptions = () => orpc.charterSearch.facets.queryOptions({ input: {} });
