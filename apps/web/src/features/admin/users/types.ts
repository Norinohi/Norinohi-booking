import type { AdminClient } from "../shared/types";

export type UserAdminList = Awaited<ReturnType<AdminClient["user"]["list"]>>;
export type UserAdminRow = UserAdminList["items"][number];
export type UserRole = UserAdminRow["role"];
export type UserAccountStatus = UserAdminRow["status"];
export type UserAdminSort = NonNullable<
  NonNullable<Parameters<AdminClient["user"]["list"]>[0]>["sort"]
>;
