module.exports = {
  apps: [{
    name: 'saniah-app',
    script: 'index.js',
    autorestart: true,
    max_restarts: 5,
    min_uptime: '10s',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    }
  }]
};
