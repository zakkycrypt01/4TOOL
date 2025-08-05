const winston = require('winston');
const DatabaseManager = require('../modules/database');
const TokenDataService = require('./tokenDataService');
const TradingService = require('./tradingService');
const PortfolioService = require('./portfolioService');
const FeeService = require('./feeService');
const AutonomousTrading = require('./autonomousTrading');

class AutonomousService {
    constructor(config, ruleEngine, telegramBot = null) {
        this.config = config;
        this.db = new DatabaseManager();
        this.tokenDataService = new TokenDataService(config);
        this.tradingService = new TradingService(config);
        this.portfolioService = new PortfolioService(config);
        this.feeService = new FeeService(config);
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
        this.isRunning = false;
        this.monitoringIntervals = new Map();
        this.ruleEngine = ruleEngine;
        this.autonomousTrading = new AutonomousTrading(this.config, this.db, this.ruleEngine, telegramBot);
        this.globalMonitorInterval = null;
        this.userAutonomousStates = new Map(); // userId -> running state
        this.startGlobalAutonomousMonitor();
    }

    startGlobalAutonomousMonitor() {
        // Run every 5 minutes
        if (this.globalMonitorInterval) {
            clearInterval(this.globalMonitorInterval);
        }
        this.globalMonitorInterval = setInterval(() => this.checkAllUsersAutonomousMode(), 300000);
        // Also run immediately on startup
        this.checkAllUsersAutonomousMode();
    }

    async checkAllUsersAutonomousMode() {
        try {
            const users = await this.db.getAllUsers();
            for (const user of users) {
                const settings = await this.db.getUserSettings(user.id);
                const enabled = settings.autonomous_enabled === 1 || settings.autonomous_enabled === true;
                const currentlyRunning = this.userAutonomousStates.get(user.id) === true;
                
                // Check if autonomous mode is enabled but there are no active autonomous strategy rules
                if (enabled) {
                    const wasDisabled = await this.autonomousTrading.checkAndDisableAutonomousModeIfNoRules(user.id);
                    if (wasDisabled) {
                        // Update the running state
                        this.userAutonomousStates.set(user.id, false);
                        continue; // Skip to next user
                    }
                }
                
                if (enabled && !currentlyRunning) {
                    await this.startAutonomousMode(user.id);
                    this.userAutonomousStates.set(user.id, true);
                } else if (!enabled && currentlyRunning) {
                    await this.stopAutonomousMode(user.id);
                    this.userAutonomousStates.set(user.id, false);
                }
            }
        } catch (error) {
            this.logger.error(`Error in global autonomous mode check: ${error.message}`);
        }
    }

    async startAutonomousMode(userId) {
        try {
            if (this.isRunning) {
                return {
                    success: false,
                    message: 'Autonomous mode is already running'
                };
            }
            // Only use new AutonomousTrading logic
            await this.autonomousTrading.start(userId);
            // Immediately send filtered tokens to the user for feedback
            await this.autonomousTrading.sendRandomTokensToAutonomousUsers();
            this.isRunning = true;
            this.logger.info(`AutonomousTrading started for user ${userId}`);
            return {
                success: true,
                message: '🤖 Autonomous Mode Successfully Activated (new logic)'
            };
        } catch (error) {
            this.logger.error(`Error starting autonomous mode: ${error.message}`);
            throw error;
        }
    }

    async stopAutonomousMode(userId) {
        try {
            await this.autonomousTrading.stop();
            this.isRunning = false;
            this.logger.info(`AutonomousTrading stopped for user ${userId}`);
            return {
                success: true,
                message: '🤖 Autonomous Mode Successfully Stopped (new logic)'
            };
        } catch (error) {
            this.logger.error(`Error stopping autonomous mode: ${error.message}`);
            throw error;
        }
    }

    async sendTelegramAlert(userId, alert) {
        try {
            const userSettings = await this.db.getUserSettings(userId);
            if (!userSettings.telegram_alerts_enabled) {
                return;
            }

            let message = '';
            
            switch (alert.type) {
                case 'AUTONOMOUS_MODE_STARTED':
                    message = `
🤖 *Autonomous Mode Activated*

*Active Strategies:* ${alert.details.activeStrategies.length}
${alert.details.activeStrategies.map(s => `• ${s.name} (${s.type})`).join('\n')}

*Active Rules:* ${alert.details.activeRules.length}
${alert.details.activeRules.map(r => `• ${r.name}`).join('\n')}

Autonomous trading is now running with your configured strategies and rules. You will receive notifications for all executed trades and important events.
                    `;
                    break;
                // ... other alert types ...
            }

            // TODO: Implement Telegram bot message sending
            // This would involve using the Telegram bot API
            console.log('Telegram alert:', message);
        } catch (error) {
            this.logger.error(`Error sending Telegram alert: ${error.message}`);
        }
    }

    async loadStrategyTemplate(userId, templateName) {
        try {
            const template = await this.db.getStrategyTemplate(templateName);
            if (!template) {
                throw new Error('Strategy template not found');
            }

            await this.db.updateUserStrategyPreferences(userId, {
                template_id: template.id,
                custom_tp_percentage: template.default_tp_percentage,
                custom_sl_percentage: template.default_sl_percentage,
                max_position_size: template.max_position_size,
                max_daily_trades: template.max_daily_trades
            });

            return {
                success: true,
                message: 'Strategy template loaded successfully',
                data: template
            };
        } catch (error) {
            this.logger.error(`Error loading strategy template: ${error.message}`);
            throw error;
        }
    }
}

module.exports = AutonomousService; 