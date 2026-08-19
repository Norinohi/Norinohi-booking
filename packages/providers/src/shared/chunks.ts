/**
 * Batch sizes for statements built from a variable-length list.
 *
 * Both sync writers used to be addressed one listing at a time, so nothing here
 * mattered. Once a provider's dump covers the whole account they are handed the
 * entire fleet in one call, and the two ceilings below are the ones that bite:
 * Postgres caps a statement at 65535 bind parameters, and a very large `IN (...)`
 * is a query plan nobody wants to be surprised by.
 */

/** Ids per `IN (...)` list; one parameter each. */
export const ID_CHUNK = 1000;

/**
 * Rows per multi-row INSERT. Lower than `ID_CHUNK` because each row binds several
 * parameters - the widest of these tables binds thirteen.
 */
export const ROW_CHUNK = 500;

export function chunked<T>(items: readonly T[], size = ID_CHUNK): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
