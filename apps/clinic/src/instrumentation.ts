/**
 * Runs once when the server starts. In demo mode (DEMO_MODE=1) it puts the
 * network guard in front of fetch, so no message, email or upload ever leaves
 * — see @workspace/db/demo-mode. Outside demo mode it does nothing.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installDemoNetworkGuard } = await import("@workspace/db/demo-mode")
    installDemoNetworkGuard()
  }
}
