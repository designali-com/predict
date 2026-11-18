// pm2 process list for the Predict server.
//
//   pm2 start deploy/ecosystem.config.cjs     (first time)
//   pm2 reload deploy/ecosystem.config.cjs    (after a deploy — no downtime)
//   pm2 logs <name> / pm2 status
//
// Each app reads its own apps/<name>/.env, as it does locally. Ports are fixed
// here rather than from .env: automation's .env has PORT=3100 for the webhook
// server, and `next start` would otherwise pick that up too.
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = (name) => path.join(root, "apps", name);
const next = (name, port) => ({
  name,
  cwd: app(name),
  script: "node_modules/next/dist/bin/next",
  args: `start --port ${port} --hostname 127.0.0.1`,
  env: { NODE_ENV: "production" },
  max_memory_restart: "700M",
});
const tsx = (name, file) => ({
  name,
  cwd: app("automation"),
  script: "node_modules/tsx/dist/cli.mjs",
  args: file,
  node_args: "--env-file=.env",
  env: { NODE_ENV: "production" },
  max_memory_restart: "400M",
});

module.exports = {
  apps: [
    next("web", 3000),
    next("automation", 3001),
    next("clinic", 3002),
    // WhatsApp + lead webhooks (PORT=3100 in apps/automation/.env).
    tsx("automation-webhook", "src/http-server.ts"),
    // Runs the automation flows off the Redis queue.
    tsx("automation-worker", "src/worker.ts"),
  ],
};
