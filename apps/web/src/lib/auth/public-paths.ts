/**
 * Public paths configuration
 *
 * - exactPaths: Array of specific paths that are public (e.g., "/", "/about")
 * - prefixes: Array of path prefixes that make all their children public (e.g., "/docs/", "/api/")
 */

export const publicPathsConfig = {
    // Exact paths that should be publicly accessible
    // /knee-talk is the OPTM talk sign-up page, shared on WhatsApp.
    exactPaths: ["/", "/knee-talk", "/api/public/event-registration"],
  
    // Path prefixes - any path starting with these will be public
    // /api/login-otp/ has to be reachable signed out — it is how somebody
    // signs in. It carries its own limits (see @workspace/db/otp-policy).
    // /l/ is the clinic sign-in link (see app/l/[token]/route.ts).
    // /join/ is a community invite redirect (see app/join/[slug]/route.ts).
    prefixes: ["/docs/", "/auth/", "/api/auth/", "/api/login-otp/", "/l/", "/join/"],
  };
  
  export function isPublicPath(pathname: string): boolean {
    // Check exact path matches
    if (publicPathsConfig.exactPaths.includes(pathname)) {
      return true;
    }
  
    // Check prefix matches
    for (const prefix of publicPathsConfig.prefixes) {
      if (pathname.startsWith(prefix)) {
        return true;
      }
    }
  
    return false;
  }