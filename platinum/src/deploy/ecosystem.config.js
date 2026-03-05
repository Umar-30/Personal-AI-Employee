module.exports = {
  apps: [
    {
      name: 'ai-employee-cloud',
      script: 'npx',
      args: 'ts-node platinum/src/index.ts',
      cwd: '/home/deploy/ai-employee',
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 10000,
      watch: false,
      env_file: '.env.cloud',
      env: {
        NODE_ENV: 'production',
        AGENT_MODE: 'cloud',
      },
      error_file: '/home/deploy/logs/ai-employee-error.log',
      out_file: '/home/deploy/logs/ai-employee-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
