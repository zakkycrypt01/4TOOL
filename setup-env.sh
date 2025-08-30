#!/bin/bash

echo "Setting up environment variables for 4T-Bot..."

# Check if .env file exists
if [ -f ".env" ]; then
    echo "Warning: .env file already exists. Backing up to .env.backup"
    cp .env .env.backup
fi

# Create .env file
cat > .env << 'EOF'
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_WEBHOOK_URL=https://your-domain.com
TELEGRAM_WEBHOOK_PORT=3000
TELEGRAM_WEBHOOK_SECRET=your_secret_token_here

# For local testing without HTTPS, set this to true
# TELEGRAM_SKIP_SET_WEBHOOK=true

# API Keys
BIRDEYE_API_KEY=your_birdeye_api_key
DEXSCREENER_API_KEY=your_dexscreener_api_key
HELIUS_API_KEY=your_helius_api_key
HELIUS_RPC_ENDPOINT=https://api.helius.xyz/v0/rpc
JUPITER_API_KEY=your_jupiter_api_key

# Solana Configuration
SOLANA_RPC_ENDPOINT=https://api.mainnet-beta.solana.com

# Database
DATABASE_PATH=./data/bot.db

# Redis Configuration (optional)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Trading Configuration
TRADING_PROVIDER=jupiter
ENABLE_TRADING_FALLBACK=true
RAYDIUM_PRIORITY_LEVEL=h

# Fee Configuration
TREASURY_WALLET=your_treasury_wallet_address
MARKETING_WALLET=your_marketing_wallet_address
FEE_PERCENTAGE=0.003
MARKETING_SHARE=0.5
MINIMUM_TOKEN_HOLDINGS=1000

# Environment
NODE_ENV=development

# CORS
ALLOWED_ORIGINS=*
EOF

echo "Created .env file with template values."
echo ""
echo "IMPORTANT: You need to edit the .env file and set your actual values:"
echo "1. TELEGRAM_BOT_TOKEN - Get this from @BotFather on Telegram"
echo "2. TELEGRAM_WEBHOOK_URL - Set to your public HTTPS URL (e.g., https://yourdomain.com)"
echo "3. TELEGRAM_WEBHOOK_SECRET - Set a secure secret token"
echo "4. API keys for various services"
echo ""
echo "For local testing without HTTPS, uncomment and set:"
echo "TELEGRAM_SKIP_SET_WEBHOOK=true"
echo ""
echo "After editing, run: source .env"
