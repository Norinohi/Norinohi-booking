/**
 * Where a visitor goes once they are signed in.
 *
 * `redirect` is whatever the URL carried — normally a return link from checkout — and is honoured
 * only when it names a path on this site. A value starting `//` is a host, not a path, so it is
 * refused along with anything absolute: an auth screen that forwards to an arbitrary URL is an
 * open redirect, and this is the one place that decides.
 *
 * Shared by the sign-in form and the auth routes themselves, so the page that bounces an
 * already-authenticated visitor lands them exactly where signing in would have.
 */
export const DEFAULT_SIGNED_IN_PATH = "/profile/bookings";

export function signedInTarget(redirect: string | undefined): string {
  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return DEFAULT_SIGNED_IN_PATH;
  }
  return redirect;
}
