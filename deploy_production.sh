#!/bin/bash

# Production Deployment Script for 4T-Bot Webhook Server
# This script sets up a production-ready webhook server with SSL, nginx, and systemd

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"
DOMAIN=""
EMAIL=""
BOT_TOKEN=""

echo -e "${BLUE}🚀 4T-Bot Production Webhook Server Deployment${NC}\n"

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to prompt for input
prompt_input() {
    local prompt="$1"
    local var_name="$2"
    local default="$3"
    
    if [[ -n "$default" ]]; then
        read -p "$prompt [$default]: " input
        eval "$var_name=\${input:-$default}"
    else
        read -p "$prompt: " input
        eval "$var_name=\$input"
    fi
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo -e "${RED}❌ This script should not be run as root${NC}"
   exit 1
fi

# Check prerequisites
echo -e "${YELLOW}📋 Checking prerequisites...${NC}"

if ! command_exists node; then
    echo -e "${RED}❌ Node.js is not installed${NC}"
    echo "Please install Node.js 18+ and try again"
    exit 1
fi

if ! command_exists npm; then
    echo -e "${RED}❌ npm is not installed${NC}"
    exit 1
fi

if ! command_exists nginx; then
    echo -e "${YELLOW}⚠️  nginx is not installed${NC}"
    echo "Installing nginx..."
    sudo apt update
    sudo apt install -y nginx
fi

if ! command_exists certbot; then
    echo -e "${YELLOW}⚠️  certbot is not installed${NC}"
    echo "Installing certbot..."
    sudo apt install -y certbot python3-certbot-nginx
fi

echo -e "${GREEN}✅ Prerequisites check passed${NC}\n"

# Get configuration
echo -e "${YELLOW}🔧 Configuration Setup${NC}"
prompt_input "Enter your domain name (e.g., bot.yourdomain.com)" "DOMAIN"
prompt_input "Enter your email address for SSL certificates" "EMAIL"
prompt_input "Enter your Telegram bot token" "BOT_TOKEN"

if [[ -z "$DOMAIN" || -z "$EMAIL" || -z "$BOT_TOKEN" ]]; then
    echo -e "${RED}❌ All configuration values are required${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Configuration received${NC}\n"

# Create production environment file
echo -e "${YELLOW}📝 Creating production environment file...${NC}"
cat > .env.production << EOF
# Production Environment Configuration for 4T-Bot Webhook Server

# Bot Configuration
TELEGRAM_BOT_TOKEN=$BOT_TOKEN
TELEGRAM_USE_POLLING=false
TELEGRAM_WEBHOOK_URL=https://$DOMAIN
TELEGRAM_WEBHOOK_PORT=3000
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 32)

# Server Configuration
NODE_ENV=production
PORT=3000
HOST=0.0.0.0

# Security
ALLOWED_ORIGINS=https://$DOMAIN,https://www.$DOMAIN
RATE_LIMIT_MAX=100
MAX_BODY_SIZE=10mb

# Logging
LOG_LEVEL=info
LOG_MAX_SIZE=10m
LOG_MAX_FILES=5

# Database
DATABASE_PATH=./db/4tool.db

# Monitoring
ENABLE_METRICS=true
HEALTH_CHECK_INTERVAL=30000
EOF

echo -e "${GREEN}✅ Production environment file created${NC}\n"

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
cd "$PROJECT_DIR"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}\n"

# Setup nginx configuration
echo -e "${YELLOW}🌐 Setting up nginx configuration...${NC}"
sudo cp nginx.production.conf /etc/nginx/sites-available/4t-bot
sudo sed -i "s/your-domain.com/$DOMAIN/g" /etc/nginx/sites-available/4t-bot

# Create symlink
if [[ -L /etc/nginx/sites-enabled/4t-bot ]]; then
    sudo rm /etc/nginx/sites-enabled/4t-bot
fi
sudo ln -s /etc/nginx/sites-available/4t-bot /etc/nginx/sites-enabled/

# Test nginx configuration
if sudo nginx -t; then
    echo -e "${GREEN}✅ Nginx configuration is valid${NC}"
else
    echo -e "${RED}❌ Nginx configuration is invalid${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Nginx configuration set up${NC}\n"

# Setup SSL certificate
echo -e "${YELLOW}🔒 Setting up SSL certificate...${NC}"
sudo certbot --nginx -d "$DOMAIN" --email "$EMAIL" --non-interactive --agree-tos
echo -e "${GREEN}✅ SSL certificate obtained${NC}\n"

# Create systemd service
echo -e "${YELLOW}⚙️  Setting up systemd service...${NC}"
sudo tee /etc/systemd/system/4t-bot.service > /dev/null << EOF
[Unit]
Description=4T-Bot Webhook Server
After=network.target
Wants=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$PROJECT_DIR
Environment=NODE_ENV=production
Environment=PATH=$PROJECT_DIR/node_modules/.bin:/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/bin/node src/index.js
ExecReload=/bin/kill -HUP \$MAINPID
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=4t-bot

# Security settings
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$PROJECT_DIR/db $PROJECT_DIR/logs $PROJECT_DIR/exports
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true

# Resource limits
LimitNOFILE=65536
LimitNPROC=4096

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable 4t-bot.service

echo -e "${GREEN}✅ Systemd service created and enabled${NC}\n"

# Setup log rotation
echo -e "${YELLOW}📋 Setting up log rotation...${NC}"
sudo tee /etc/logrotate.d/4t-bot > /dev/null << EOF
$PROJECT_DIR/logs/*.log {
    daily
    missingok
    rotate 7
    compress
    delaycompress
    notifempty
    create 644 $USER $USER
    postrotate
        systemctl reload 4t-bot.service
    endscript
}
EOF

echo -e "${GREEN}✅ Log rotation configured${NC}\n"

# Setup firewall (if ufw is available)
if command_exists ufw; then
    echo -e "${YELLOW}🔥 Setting up firewall...${NC}"
    sudo ufw allow 22/tcp
    sudo ufw allow 80/tcp
    sudo ufw allow 443/tcp
    sudo ufw --force enable
    echo -e "${GREEN}✅ Firewall configured${NC}\n"
fi

# Create startup script
echo -e "${YELLOW}📝 Creating startup script...${NC}"
cat > start_production.sh << 'EOF'
#!/bin/bash
# Production startup script for 4T-Bot

set -e

echo "🚀 Starting 4T-Bot in production mode..."

# Load production environment
export $(cat .env.production | xargs)

# Start the service
sudo systemctl start 4t-bot.service

# Check status
sleep 5
sudo systemctl status 4t-bot.service

echo "✅ 4T-Bot started successfully!"
echo "📊 Check logs: sudo journalctl -u 4t-bot.service -f"
echo "🌐 Health check: https://your-domain.com/health"
echo "🔧 Service control: sudo systemctl {start|stop|restart|status} 4t-bot.service"
EOF

chmod +x start_production.sh

# Update the domain in startup script
sed -i "s/your-domain.com/$DOMAIN/g" start_production.sh

echo -e "${GREEN}✅ Startup script created${NC}\n"

# Final setup
echo -e "${YELLOW}🔧 Final configuration...${NC}"

# Copy production environment to .env
cp .env.production .env

# Create logs directory if it doesn't exist
mkdir -p logs

# Set proper permissions
chmod 600 .env
chmod 755 logs

echo -e "${GREEN}✅ Final configuration completed${NC}\n"

# Summary
echo -e "${GREEN}🎉 Production deployment completed successfully!${NC}\n"
echo "📋 Summary of what was set up:"
echo "  ✅ Production environment configuration"
echo "  ✅ Nginx reverse proxy with SSL"
echo "  ✅ Systemd service for automatic startup"
echo "  ✅ Log rotation configuration"
echo "  ✅ Firewall rules (if ufw available)"
echo "  ✅ SSL certificate via Let's Encrypt"
echo "  ✅ Startup script"
echo ""
echo "🚀 To start the service:"
echo "  ./start_production.sh"
echo ""
echo "🔧 Service management:"
echo "  sudo systemctl start 4t-bot.service"
echo "  sudo systemctl stop 4t-bot.service"
echo "  sudo systemctl restart 4t-bot.service"
echo "  sudo systemctl status 4t-bot.service"
echo ""
echo "📝 Logs:"
echo "  sudo journalctl -u 4t-bot.service -f"
echo ""
echo "🌐 Test endpoints:"
echo "  Health: https://$DOMAIN/health"
echo "  Webhook: https://$DOMAIN/webhook"
echo ""
echo "⚠️  Important: Update your Telegram bot webhook URL to:"
echo "  https://$DOMAIN/webhook"
