#!/bin/bash

# Production Setup Script for 4T-Bot Webhook Server

echo "🚀 Setting up 4T-Bot Production Webhook Server..."

# Install dependencies
npm install helmet morgan

# Create production environment
cat > .env.production << 'EOF'
NODE_ENV=production
TELEGRAM_USE_POLLING=false
TELEGRAM_WEBHOOK_URL=https://your-domain.com
TELEGRAM_WEBHOOK_SECRET=your-secret-token
PORT=3000
ALLOWED_ORIGINS=https://your-domain.com
RATE_LIMIT_MAX=100
MAX_BODY_SIZE=10mb
EOF

echo "✅ Production environment file created"
echo "📝 Edit .env.production with your actual values"
echo "🚀 Run: npm start to start the server"


