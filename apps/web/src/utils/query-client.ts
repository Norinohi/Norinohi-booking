import "server-only";

import { QueryClient } from "@tanstack/react-query";
import { cache } from "react";

import { QUERY_DEFAULTS } from "./orpc";

export const getQueryClient = cache(() => new QueryClient({ defaultOptions: QUERY_DEFAULTS }));
