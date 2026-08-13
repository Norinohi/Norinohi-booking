/*
 * A bare `window` reference throws in the server runtimes because the binding is not declared
 * there, so the question has to be asked of the global object instead.
 */
export const isBrowser = "window" in globalThis;
