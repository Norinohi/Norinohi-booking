import { createEvlog } from "evlog/next";
import { createInstrumentation } from "evlog/next/instrumentation/create";

export const { withEvlog, useLogger, log, createError } = createEvlog({
  service: "my-better-t-app-web",
});

export const { register, onRequestError } = createInstrumentation({
  service: "my-better-t-app-web",
});
