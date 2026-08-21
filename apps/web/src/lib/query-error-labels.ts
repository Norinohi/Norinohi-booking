/*
 * The QueryCache `onError` toast lives in a module, not a component, so it cannot call
 * `useTranslations`. These labels are the bridge: English defaults for the first paint, replaced
 * by `<QueryErrorLabels>` in the layout once the locale's messages are mounted.
 */
export type QueryErrorLabels = { title: string; retry: string };

let labels: QueryErrorLabels = { title: "Something went wrong", retry: "Retry" };

export function setQueryErrorLabels(next: QueryErrorLabels) {
  labels = next;
}

export function getQueryErrorLabels(): QueryErrorLabels {
  return labels;
}
