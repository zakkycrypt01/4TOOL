#!/bin/bash

# 4TOOL Memory-Optimized Startup Script
# This script starts the application with proper memory management

echo "🚀 Starting 4TOOL with memory optimization..."

# Enable garbage collection and set memory limits
export NODE_OPTIONS="--max-old-space-size=2048 --max-semi-space-size=512 --optimize-for-size --expose-gc"

# Set environment variables for better memory management
export UV_THREADPOOL_SIZE=4
export NODE_ENV=production

# Check if PM2 is installed
if command -v pm2 &> /dev/null; then
    echo "📦 Using PM2 to start application..."
    
    # Stop any existing instances
    pm2 stop 4t-bot-webhook 2>/dev/null || true
    pm2 delete 4t-bot-webhook 2>/dev/null || true
    
    # Start with PM2
    pm2 start ecosystem.config.js --env production
    
    # Monitor the process
    echo "📊 Application started. Monitoring logs..."
    pm2 logs 4t-bot-webhook --lines 50
    
else
    echo "⚠️  PM2 not found, starting with Node.js directly..."
    
    # Start with Node.js directly
    node --max-old-space-size=2048 --max-semi-space-size=512 --optimize-for-size --expose-gc src/index.js
fi

echo "✅ Startup script completed."
