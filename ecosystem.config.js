module.exports = {
  apps: [{
    name: "clinic-scanner",
    script: "server.js",
    env: {
      NODE_ENV: "production",
      PORT: 80,
      ANTHROPIC_API_KEY: "your-api-key-here"
    }
  }]
} 