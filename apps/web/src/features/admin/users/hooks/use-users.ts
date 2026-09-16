"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { userListQueryOptions } from "../api/queries";

export function useUsers(input: Parameters<typeof userListQueryOptions>[0]) {
  return useQuery({ ...userListQueryOptions(input), placeholderData: keepPreviousData });
}
