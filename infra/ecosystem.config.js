module.exports = {
  apps: [
    {
      name: 'drillex-api',
      cwd: '/opt/drillex/apps/api',
      script: 'dist/src/main.js',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'drillex-web',
      cwd: '/opt/drillex/apps/web/.next/standalone/apps/web',
      script: 'server.js',
      env: { NODE_ENV: 'production', PORT: '3000', HOSTNAME: '127.0.0.1' },
    },
  ],
};
