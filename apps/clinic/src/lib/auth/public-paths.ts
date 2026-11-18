/**
 * Public paths configuration
 *
 * - exactPaths: Array of specific paths that are public (e.g., "/", "/about")
 * - prefixes: Array of path prefixes that make all their children public (e.g., "/docs/", "/api/")
 */

export const publicPathsConfig = {
    // Exact paths that should be publicly accessible
    exactPaths: ["/"],
  
    // Path prefixes - any path starting with these will be public
    prefixes: ["/docs/", "/auth/", "/api/auth/"],
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