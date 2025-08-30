const express = require('express');
const TelegramBot = require('node-telegram-bot-api');
const winston = require('winston');
const cors = require('cors');
const compression = require('compression');

class WebhookServer {
    constructor(config, telegramBotManager) {
        this.config = config;
        this.telegramBotManager = telegramBotManager;
        this.app = express();
        this.server = null;
        this.bot = null;
        
        // Initialize logger
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'webhook-error.log', level: 'error' }),
                new winston.transports.File({ filename: 'webhook-combined.log' })
            ]
        });

        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.simple()
            }));
        }

        this.setupMiddleware();
        this.setupRoutes();
        this.initializeBot();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['*'],
            credentials: true
        }));

        // Compression
        this.app.use(compression());

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            this.logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            next();
        });

        // Error handling middleware
        this.app.use((err, req, res, next) => {
            this.logger.error('Webhook server error:', err);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    setupRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({ 
                status: 'healthy', 
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // Telegram webhook endpoint
        this.app.post('/webhook', async (req, res) => {
            try {
                // Verify the request is from Telegram
                if (!this.verifyTelegramRequest(req)) {
                    this.logger.warn('Invalid webhook request received', {
                        ip: req.ip,
                        headers: req.headers
                    });
                    return res.status(401).json({ error: 'Unauthorized' });
                }

                // Process the update
                const update = req.body;
                
                // Enhanced logging for debugging callback query issues
                this.logger.info('Received webhook update', {
                    updateId: update.update_id,
                    type: this.getUpdateType(update),
                    hasCallbackQuery: !!update.callback_query,
                    callbackQueryDetails: update.callback_query ? {
                        id: update.callback_query.id,
                        hasFrom: !!update.callback_query.from,
                        hasMessage: !!update.callback_query.message,
                        hasData: !!update.callback_query.data,
                        messageHasChat: !!(update.callback_query.message && update.callback_query.message.chat)
                    } : null
                });

                // Handle the update through the bot manager
                await this.telegramBotManager.handleWebhookUpdate(update);

                res.json({ status: 'ok' });
            } catch (error) {
                this.logger.error('Error processing webhook update:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });

        // Set webhook endpoint (for manual webhook management)
        this.app.post('/set-webhook', async (req, res) => {
            try {
                const { url, secret_token } = req.body;
                
                if (!url) {
                    return res.status(400).json({ error: 'URL is required' });
                }

                const result = await this.bot.setWebHook(url, {
                    secret_token: secret_token || process.env.TELEGRAM_WEBHOOK_SECRET,
                    max_connections: 40,
                    allowed_updates: ['message', 'callback_query', 'inline_query', 'chosen_inline_result']
                });

                this.logger.info('Webhook set successfully', { url, result });
                res.json({ success: true, result });
            } catch (error) {
                this.logger.error('Error setting webhook:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Delete webhook endpoint
        this.app.delete('/delete-webhook', async (req, res) => {
            try {
                const result = await this.bot.deleteWebHook();
                this.logger.info('Webhook deleted successfully', { result });
                res.json({ success: true, result });
            } catch (error) {
                this.logger.error('Error deleting webhook:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Get webhook info endpoint
        this.app.get('/webhook-info', async (req, res) => {
            try {
                const info = await this.bot.getWebHookInfo();
                res.json(info);
            } catch (error) {
                this.logger.error('Error getting webhook info:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Catch-all route for undefined endpoints
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Endpoint not found' });
        });
    }

    verifyTelegramRequest(req) {
        // Basic verification - Telegram sends requests with Go-http-client/1.1 User-Agent
        const userAgent = req.get('User-Agent');
        // Accept requests from Telegram (Go-http-client) or for development/testing
        return userAgent && (
            userAgent.includes('TelegramBot') || 
            userAgent.includes('Go-http-client') ||
            process.env.NODE_ENV === 'development'
        );
    }

    getUpdateType(update) {
        if (update.message) return 'message';
        if (update.callback_query) return 'callback_query';
        if (update.inline_query) return 'inline_query';
        if (update.chosen_inline_result) return 'chosen_inline_result';
        if (update.channel_post) return 'channel_post';
        if (update.edited_message) return 'edited_message';
        if (update.edited_channel_post) return 'edited_channel_post';
        if (update.shipping_query) return 'shipping_query';
        if (update.pre_checkout_query) return 'pre_checkout_query';
        if (update.poll) return 'poll';
        if (update.poll_answer) return 'poll_answer';
        if (update.my_chat_member) return 'my_chat_member';
        if (update.chat_member) return 'chat_member';
        if (update.chat_join_request) return 'chat_join_request';
        return 'unknown';
    }

    async initializeBot() {
        try {
            // Create bot instance without polling
            this.bot = new TelegramBot(this.config.telegram.token, { polling: false });
            
            // Set webhook if URL is provided and valid HTTPS, unless explicitly skipped
            const skipSet = (process.env.TELEGRAM_SKIP_SET_WEBHOOK || '').toLowerCase() === 'true';
            const url = this.config.telegram.webhook;
            if (url) {
                if (skipSet) {
                    this.logger.warn('Skipping setWebHook due to TELEGRAM_SKIP_SET_WEBHOOK=true');
                } else if (typeof url === 'string' && url.startsWith('https://')) {
                    await this.setWebhook();
                } else {
                    this.logger.error('TELEGRAM_WEBHOOK_URL must be HTTPS in webhook-only mode. Set a valid URL or set TELEGRAM_SKIP_SET_WEBHOOK=true for local testing.');
                }
            }

            this.logger.info('Webhook bot initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize webhook bot:', error);
            throw error;
        }
    }

    async setWebhook() {
        try {
            const webhookUrl = `${this.config.telegram.webhook}/webhook`;
            const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET || 'your-secret-token';
            
            const result = await this.bot.setWebHook(webhookUrl, {
                secret_token: secretToken,
                max_connections: 40,
                allowed_updates: ['message', 'callback_query', 'inline_query', 'chosen_inline_result']
            });

            this.logger.info('Webhook set successfully', { 
                url: webhookUrl, 
                result,
                secretToken: secretToken.substring(0, 8) + '...'
            });

            return result;
        } catch (error) {
            this.logger.error('Failed to set webhook:', error);
            throw error;
        }
    }

    async start(port = process.env.PORT || 3000) {
        return new Promise((resolve, reject) => {
            try {
                this.server = this.app.listen(port, () => {
                    this.logger.info(`Webhook server started on port ${port}`);
                    resolve();
                });

                this.server.on('error', (error) => {
                    this.logger.error('Webhook server error:', error);
                    reject(error);
                });

                // Graceful shutdown
                process.on('SIGTERM', () => this.shutdown());
                process.on('SIGINT', () => this.shutdown());

            } catch (error) {
                this.logger.error('Failed to start webhook server:', error);
                reject(error);
            }
        });
    }

    async shutdown() {
        this.logger.info('Shutting down webhook server...');
        
        try {
            // Delete webhook
            if (this.bot) {
                await this.bot.deleteWebHook();
                this.logger.info('Webhook deleted successfully');
            }

            // Close server
            if (this.server) {
                this.server.close(() => {
                    this.logger.info('Webhook server closed');
                    process.exit(0);
                });
            }
        } catch (error) {
            this.logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    getBot() {
        return this.bot;
    }
}

module.exports = WebhookServer;

