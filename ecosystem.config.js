/**
 * PM2 Ecosystem Configuration for Orbit Framework
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 * 
 * Then on reboot, Orbit will auto-start and persist.
 */

module.exports = {
  apps: [
    {
      name: "orbit-framework",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      // Auto-restart on crash
      autorestart: true,
      // Delay before attempting to restart after crash (ms)
      min_uptime: "10s",
      max_restarts: 5,
      // Backoff multiplier for restarts (exponential)
      restart_delay: 4000,
      // Error and combined output logs
      error_file: "logs/orbit-error.log",
      out_file: "logs/orbit-out.log",
      // Merge logs from all instances
      merge_logs: true,
      // Use timestamp in log files
      time_format: "YYYY-MM-DD HH:mm:ss Z",
      // Watch files for restart (disable in production)
      watch: false,
      // Ignore node_modules during watch
      ignore_watch: ["node_modules", "dist", "logs"],
      // Graceful shutdown: time to wait before hard kill (ms)
      kill_timeout: 5000,
      // Send SIGTERM before SIGKILL
      signal: "SIGTERM",
      // Namespace for PM2 monitoring
      namespace: "orbit",
      // Instance mode (solo/cluster/single)
      // Use fork (1 instance) to maintain state
      instance_var: "INSTANCE_ID",
    },
  ],
  // PM2 daemon settings
  daemon_mode: true,
  // Listen on localhost:9615 for PM2 monitoring
  pmx: true,
};
