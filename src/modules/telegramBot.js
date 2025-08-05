const TelegramBot = require('node-telegram-bot-api');
const DatabaseManager = require('./database');
const FeeManagement = require('./feeManagement');
const TradingExecution = require('./tradingExecution');
const RugCheck = require('./rugCheck');
const TokenAnalysis = require('./tokenAnalysis');
const BuyManager = require('./buyManager');
const SellManager = require('./sellManager');
const RulesCommand = require('../commands/rules');
const RuleEngine = require('../services/ruleEngine');
const FileExportService = require('../services/fileExportService');
const AutonomousService = require('../services/autonomousService');
const {
    WalletHandlers,
    PortfolioHandlers,
    TradingHandlers,
    StrategyHandlers,
    RuleHandlers,
    ExportHandlers,
    SecurityHandlers,
    CopyTradeHandlers,
    SettingsHandlers
} = require('../handlers');
const CallbackRouter = require('./callbackRouter');

// Utility modules
const TelegramUtils = require('../utils/telegramUtils');
const MessageManager = require('../utils/messageManager');
const MenuManager = require('../utils/menuManager');
const RulesManager = require('../utils/rulesManager');

class TelegramBotManager {
    constructor(config, manualManagementService) {
        if (!config.telegram || !config.telegram.token) {
            throw new Error('Telegram token is required');
        }

        try {
            this.bot = new TelegramBot(config.telegram.token, { polling: true });
            this.bot.userStates = new Map(); // Ensure userStates is available on the bot instance

            // Add error handling for polling
            this.bot.on('polling_error', (error) => {
                console.error('Polling error:', error.message);
                
                if (error.code === 'EFATAL' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                    console.error('Connection error detected. Attempting to reconnect...');
                    this.reconnectBot();
                }
            });

            // Add connection error handling
            this.bot.on('error', (error) => {
                console.error('Telegram bot error:', error.message);
                this.reconnectBot();
            });

            this.db = new DatabaseManager();
            this.feeManager = new FeeManagement(config);
            this.tradingExecution = new TradingExecution(config);
            this.rugCheck = new RugCheck();
            this.tokenAnalysis = new TokenAnalysis();
            this.ruleEngine = new RuleEngine(this.db, config);
            // Instantiate AutonomousService with ruleEngine and pass the Telegram bot
            this.autonomousService = new AutonomousService(config, this.ruleEngine, this.bot);
            // Initialize utility classes
            this.messageManager = new MessageManager(this.bot);
            this.menuManager = new MenuManager(this.bot, this.db, this.messageManager);
            this.rulesCommand = new RulesCommand(this.bot, this.db, config); // Move this line before RulesManager
            this.rulesManager = new RulesManager(this.bot, this.db, this.messageManager, this.rulesCommand);
            this.buyManager = new BuyManager(config, this.tradingExecution, this.db, manualManagementService);
            this.sellManager = new SellManager(config, this.tradingExecution, this.db, this.messageManager);
            this.fileExportService = new FileExportService();
            this.tempStorage = new Map();
            this.activeRules = new Map();

            // Initialize handler classes
            this.walletHandlers = new WalletHandlers(this.bot, this.db, config);
            this.portfolioHandlers = new PortfolioHandlers(this.bot, this.db, config);
            this.tradingHandlers = new TradingHandlers(this.bot, this.db, config, this.sellManager);
            this.strategyHandlers = new StrategyHandlers(this.bot, this.db, config);
            this.ruleHandlers = new RuleHandlers(this.bot, this.db, config);
            this.exportHandlers = new ExportHandlers(this.bot, this.db, config);
            this.securityHandlers = new SecurityHandlers(this, this.db, config);
            this.copyTradeHandlers = new CopyTradeHandlers(this.bot, this.db, config);
            this.settingsHandlers = new SettingsHandlers(this.bot, this.db, config, this, this.autonomousService);

            this.callbackRouter = new CallbackRouter(this.bot, {
                walletHandlers: this.walletHandlers,
                portfolioHandlers: this.portfolioHandlers,
                tradingHandlers: this.tradingHandlers,
                strategyHandlers: this.strategyHandlers,
                ruleHandlers: this.ruleHandlers,
                exportHandlers: this.exportHandlers,
                securityHandlers: this.securityHandlers,
                copyTradeHandlers: this.copyTradeHandlers,
                settingsHandlers: this.settingsHandlers,
                rulesCommand: this.rulesCommand,
                bot: this 
            });

            this.setupCommands();
        } catch (error) {
            console.error('Failed to initialize Telegram bot:', error.message);
            throw new Error(`Failed to initialize Telegram bot: ${error.message}`);
        }
    }

    async reconnectBot() {
        try {
            console.log('Attempting to reconnect to Telegram...');
            
            // Stop current polling
            await this.bot.stopPolling();
            
            // Wait for 5 seconds before reconnecting
            await new Promise(resolve => setTimeout(resolve, 5000));
            
            // Start polling again
            await this.bot.startPolling();
            console.log('Successfully reconnected to Telegram');
            
            // Reinitialize the bot with error handlers
            this.bot.on('polling_error', (error) => {
                console.error('Polling error:', error.message);
                
                if (error.code === 'EFATAL' || error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
                    console.error('Connection error detected. Attempting to reconnect...');
                    this.reconnectBot();
                }
            });

            this.bot.on('error', (error) => {
                console.error('Telegram bot error:', error.message);
                this.reconnectBot();
            });
        } catch (error) {
            console.error('Failed to reconnect to Telegram:', error.message);
            // Try again after 30 seconds
            setTimeout(() => this.reconnectBot(), 30000);
        }
    }

    setupCommands() {
        // Start command
        this.bot.onText(/\/start/, async (msg) => {
            const chatId = msg.chat.id;
            const telegramId = msg.from.id.toString();
            
            try {
                let user = await this.db.getUserByTelegramId(telegramId);
                if (!user) {
                    user = await this.db.createUser(telegramId);
                }

                const wallets = await this.db.getWalletsByUserId(user.id);
                const activeWallet = await this.db.getActiveWallet(user.id);
                
                if (!activeWallet) {
                    // New user - show wallet creation options
                    const welcomeMessage = `
🎉 *Welcome to 4T-Bot!* 🚀

I'm your automated trading assistant for Solana tokens. To get started, you'll need a Solana wallet.

*Choose an option:*`;

                    const keyboard = {
                        inline_keyboard: [
                            [
                                { text: '👛 Create New Wallet', callback_data: 'create_wallet' },
                                { text: '📝 Import Wallet', callback_data: 'import_wallet' }
                            ]
                        ]
                    };

                    const sentMessage = await this.bot.sendMessage(chatId, welcomeMessage, {
                        parse_mode: 'Markdown',
                        reply_markup: keyboard
                    });

                    // Store welcome message ID for later deletion
                    this.messageManager.lastWelcomeMessageId = sentMessage.message_id;
                } else {
                    await this.menuManager.showMainMenu(chatId, activeWallet, this.ruleEngine);
                }
            } catch (error) {
                console.error('Error in /start command:', error);
                await this.bot.sendMessage(chatId, 'Sorry, something went wrong. Please try again later.');
            }
        });

        // Handle callback queries (inline button clicks)
        this.bot.on('callback_query', async (callbackQuery) => {
            try {
                // Create a context object that includes both the callback query and its message
                const ctx = {
                    callbackQuery,
                    from: callbackQuery.from,
                    chat: callbackQuery.message.chat,
                    message: callbackQuery.message
                };

                // Handle all callbacks through the main handler
                await this.handleCallbackQuery(ctx);
            } catch (error) {
                console.error('Error handling callback query:', error);
                const chatId = callbackQuery.message.chat.id;
                await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, there was an error processing your request. Please try again.');
            }
        });

        // Handle messages
        this.bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const telegramId = msg.from.id.toString();
            const text = msg.text;

            try {
                console.log('[MessageHandler] Triggered for', telegramId, text);
                // 1. Skip if the message is a command
                if (text && text.startsWith('/')) {
                    return;
                }

                // 2. ABSOLUTE TOP: SELL MANAGER CUSTOM SELL INPUT
                if (this.sellManager.hasPendingSell(telegramId)) {
                    const pendingSell = this.sellManager.pendingSell.get(telegramId);
                    console.log('[MessageHandler] Pending sell for', telegramId, pendingSell);
                    if (pendingSell && pendingSell.status === 'waiting_for_custom_amount') {
                        console.log('[MessageHandler] Routing to handleCustomSellAmountInput for', telegramId, text, pendingSell);
                        await this.tradingHandlers.handleCustomSellAmountInput(chatId, telegramId, text);
                        return;
                    }
                }

                // 3. All other handlers come AFTER
                if (this.rulesCommand.userStates.has(telegramId)) {
                    console.log('[RulesCommand] Handling message for', telegramId);
                    await this.rulesCommand.handleMessage({
                        chat: { id: chatId },
                        from: { id: telegramId },
                        message: { text }
                    });
                    return;
                }

                if (this.ruleHandlers.userStates.has(telegramId)) {
                    console.log('[RuleHandlers] Handling message for', telegramId);
                    const handled = await this.ruleHandlers.handleTextInput(chatId, telegramId, text);
                    if (handled) {
                        return;
                    }
                }

                const userState = this.bot.userStates.get(telegramId);
                if (userState) {
                    console.log('[UserState] Found user state in message handler:', userState);
                    
                    // Try to delegate to appropriate handlers first
                    const ctx = {
                        chat: { id: chatId },
                        from: { id: telegramId },
                        message: { text }
                    };
                    
                    // Try wallet handlers first for wallet-related states
                    if (userState.state === 'awaiting_private_key' || userState.state === 'waiting_external_wallet') {
                        console.log('🔍 Trying wallet handlers for state:', userState.state);
                        const walletResult = await this.walletHandlers.handleMessage(ctx, userState);
                        if (walletResult && walletResult.handled) {
                            console.log('✅ Wallet handler processed the message');
                            if (walletResult.clearState) {
                                this.bot.userStates.delete(telegramId);
                            }
                            return;
                        }
                    }
                    
                    // Try settings handlers for settings-related states
                    if (userState.state && userState.state.startsWith('waiting_')) {
                        console.log('🔍 Trying settings handlers for state:', userState.state);
                        const settingsResult = await this.settingsHandlers.handleMessage(ctx, userState);
                        if (settingsResult && settingsResult.handled) {
                            console.log('✅ Settings handler processed the message');
                            if (settingsResult.clearState) {
                                this.bot.userStates.delete(telegramId);
                            }
                            if (settingsResult.redirectTo) {
                                switch (settingsResult.redirectTo) {
                                    case 'trade_settings':
                                        await this.settingsHandlers.handleTradeSettings(chatId, telegramId);
                                        break;
                                    case 'risk_settings':
                                        await this.settingsHandlers.handleRiskSettings(chatId, telegramId);
                                        break;
                                }
                            }
                            return;
                        }
                    }
                    
                    // Handle specific states that need special processing
                    switch (userState.state) {
                        case 'waiting_external_wallet':
                            await this.handleExternalWalletInput(chatId, telegramId, text);
                            return;
                        case 'awaiting_private_key':
                            // This is now handled by wallet handlers above
                            return;
                        case 'awaiting_passphrase':
                        case 'awaiting_new_passphrase':
                            if (text && text.trim().length > 0) {
                                try {
                                    await this.securityHandlers.handlePassphraseInput(chatId, telegramId, text);
                                } catch (error) {
                                    await this.messageManager.sendAndStoreMessage(chatId, `Sorry, ${error.message}. Please try again.`);
                                }
                            } else {
                                await this.messageManager.sendAndStoreMessage(chatId, 'Please send a valid passphrase.');
                            }
                            return;
                        case 'awaiting_custom_buy_amount':
                            // Delegate to tradingHandlers for custom buy amount input
                            const ctx = {
                                chat: { id: chatId },
                                from: { id: telegramId },
                                message: { text }
                            };
                            await this.tradingHandlers.handleMessage(ctx, userState);
                            // Optionally clear state if needed (handled by tradingHandlers)
                            return;
                    }
                }

                // Check if user has pending sell with custom amount
                if (this.sellManager.hasPendingSell(telegramId)) {
                    const pendingSell = this.sellManager.pendingSell.get(telegramId);
                    if (pendingSell && pendingSell.status === 'waiting_for_custom_amount') {
                        await this.tradingHandlers.handleCustomSellAmountInput(chatId, telegramId, text);
                        return;
                    }
                }

                // Handle other message types
                if (text && text.length > 0) {
                    const cleanText = text.trim();
                    
                    // Check if the message is a token address (Solana address format)
                    if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(cleanText)) {
                        await this.tradingHandlers.handleTokenCheck(chatId, telegramId, cleanText);
                    }
                }
            } catch (error) {
                console.error('Error handling message:', error);
                await this.messageManager.sendAndStoreMessage(chatId, 'Sorry, something went wrong. Please try again.');
            }
        });
    }

    // Message management delegated to MessageManager
    async sendAndStoreMessage(chatId, message, options = {}) {
        return await this.messageManager.sendAndStoreMessage(chatId, message, options, this.reconnectBot.bind(this));
    }

    // Menu management delegated to MenuManager
    async showMainMenu(chatId, activeWallet, ruleEngine = null, telegramId = null) {
        return await this.menuManager.showMainMenu(chatId, activeWallet, ruleEngine || this.ruleEngine, telegramId);
    }

    async showSettings(chatId, telegramId) {
        return await this.menuManager.showSettings(chatId, telegramId);
    }

    async showWalletManagement(chatId, telegramId) {
        return await this.menuManager.showWalletManagement(chatId, telegramId);
    }

    async handleHelp(chatId) {
        return await this.menuManager.showHelp(chatId);
    }

    // Wallet creation and configuration methods handled by respective handlers
    async handleConfigureStrategy(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const strategy = await this.db.getActiveStrategy(user.id);

            const message = strategy ? `
*Current Strategy:*
\`\`\`json
${JSON.stringify(strategy.strategy_json, null, 2)}
\`\`\`

*Available Strategies:*` : `
*No Active Strategy*

*Available Strategies:*`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📈 Volume Spike', callback_data: 'strategy_volume_spike' },
                        { text: '📉 Dip Buy', callback_data: 'strategy_dip_buy' }
                    ],
                    [
                        { text: '🎮 Narrative', callback_data: 'strategy_narrative' },
                        { text: '📊 Momentum', callback_data: 'strategy_momentum' }
                    ],
                    [
                        { text: '📈 Volatility', callback_data: 'strategy_volatility' },
                        { text: '👥 Copy Trade', callback_data: 'strategy_copy_trade' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error configuring strategy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while configuring your strategy.');
        }
    }

    async handleClaimRewards(chatId, telegramId) {
        const message = `
*💎 Claim Status*

*Available Rewards:* 0 4TOOL
*Last Claim:* Never
*Next Claim:* Available now`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '💎 Claim Rewards', callback_data: 'confirm_claim' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    async handleMarketOverview(chatId) {
        const message = `
*📈 Market Overview*

*Top Gainers:*
No data available

*Top Losers:*
No data available

*Trending Tokens:*
No data available`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '🔄 Refresh', callback_data: 'refresh_market' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // Helper methods delegated to TelegramUtils
    async generateWallet() {
        return TelegramUtils.generateWallet();
    }

    encryptPrivateKey(privateKey, password) {
        return TelegramUtils.encryptPrivateKey(privateKey, password);
    }

    decryptPrivateKey(encryptedData, password) {
        return TelegramUtils.decryptPrivateKey(encryptedData, password);
    }

    validateWalletAddress(address) {
        return TelegramUtils.validateWalletAddress(address);
    }

    // Trade methods handled by tradingHandlers

    async handleStrategies(chatId, telegramId) {
        return await this.rulesManager.handleStrategies(chatId, telegramId);
    }

    // Helper methods for strategy management
    getStrategyIcon(type) {
        return TelegramUtils.getStrategyIcon(type);
    }

    formatStrategyName(type) {
        return TelegramUtils.formatStrategyName(type);
    }

    // Callback handler methods for rule and strategy management
    async handleToggleAllRules(chatId, telegramId) {
        return await this.rulesManager.handleToggleAllRules(chatId, telegramId);
    }

    async handleDeleteRulesMenu(chatId, telegramId) {
        return await this.rulesManager.handleDeleteRulesMenu(chatId, telegramId);
    }

    async handleDeleteRule(chatId, telegramId, ruleId) {
        return await this.rulesManager.handleDeleteRule(chatId, telegramId, ruleId);
    }

    async handleConfirmDeleteRule(chatId, telegramId, ruleId) {
        return await this.rulesManager.handleConfirmDeleteRule(chatId, telegramId, ruleId);
    }

    async handleStrategyPerformance(chatId, telegramId) {
        return await this.rulesManager.handleStrategyPerformance(chatId, telegramId);
    }
    
    // Security methods handled by securityHandlers

    async handleTokenReport(chatId, telegramId) {
        const message = `
*📊 Token Report*

Please enter the token address you want to check:`;

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown'
        });

        // Store the state to handle the next message as a token address
        this.pendingTokenCheck = {
            type: 'report',
            telegramId
        };
    }

    // Copy trade methods handled by copyTradeHandlers
    async handleAddExternalWallet(chatId, telegramId) {
        try {
            const message = `
*➕ Add External Wallet*

Please enter the wallet address you want to monitor for copy trading.

Format: Base58 encoded Solana address`;

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown'
            });

            // Set user state to wait for wallet address
            this.bot.userStates.set(telegramId, {
                state: 'waiting_external_wallet',
                data: {}
            });

        } catch (error) {
            console.error('Error handling add external wallet:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error adding the external wallet.');
        }
    }

    async handleExternalWalletInput(chatId, telegramId, walletAddress) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            
            try {
                // Skip validation and directly add the wallet address
                await this.db.addExternalWallet(user.id, walletAddress);
                
                const message = `
*✅ External Wallet Added*

Wallet address: \`${walletAddress}\`

The wallet has been added to your monitored list. You can now enable copy trading for this wallet.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🔄 Back to Copy Trade', callback_data: 'strategy_copy_trade' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

            } catch (error) {
                if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
                    await this.sendAndStoreMessage(chatId, 'This wallet address is already being monitored.');
                } else {
                    throw error;
                }
            }

            // Clear user state
            this.bot.userStates.delete(telegramId);

        } catch (error) {
            console.error('Error handling external wallet input:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error adding the external wallet.');
        }
    }

    // Buy/Sell methods handled by tradingHandlers and respective managers
    async handleConfirmBuy(chatId, telegramId, params) {
        return await this.tradingHandlers.handleConfirmBuy(chatId, telegramId, params);
    }

    async handleExecuteBuy(chatId, telegramId, params) {
        return await this.tradingHandlers.handleExecuteBuy(chatId, telegramId, params);
    }

    async showTradeMenu(chatId) {
        return await this.menuManager.showTradeMenu(chatId);
    }

    // Helper methods delegated to utils and handlers
    async createRuleAndShowSuccess(chatId, telegramId) {
        try {
            const ctx = {
                chat: { id: chatId },
                from: { id: telegramId }
            };
            
            await this.rulesCommand.createRuleAndShowSuccess(ctx);
        } catch (error) {
            console.error('Error creating rule:', error);
            await this.bot.sendMessage(chatId, 'Sorry, there was an error creating your rule. Please try again.');
        }
    }

    async getCurrentSelections(data) {
        if (!data) {
            return '*Current Selections:*\nNo criteria selected yet\n';
        }

        let selections = '*Current Selections:*\n';
        
        if (data.marketCap && data.marketCap.value) {
            const range = data.marketCap.value;
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                selections += `- Market Cap: $${range.min.toLocaleString()} - $${range.max === Infinity ? '∞' : range.max.toLocaleString()}\n`;
            }
        }
        
        if (data.price && data.price.value) {
            const range = data.price.value;
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                selections += `- Price: $${range.min.toFixed(4)} - $${range.max === Infinity ? '∞' : range.max.toFixed(4)}\n`;
            }
        }
        
        if (data.volume && data.volume.value) {
            const range = data.volume.value;
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                selections += `- Volume: $${range.min.toLocaleString()} - $${range.max === Infinity ? '∞' : range.max.toLocaleString()}\n`;
            }
        }
        
        if (data.liquidity && data.liquidity.value) {
            const range = data.liquidity.value;
            if (range && typeof range.min !== 'undefined' && typeof range.max !== 'undefined') {
                selections += `- Liquidity: $${range.min.toLocaleString()} - $${range.max === Infinity ? '∞' : range.max.toLocaleString()}\n`;
            }
        }
        
        if (data.category) {
            selections += `- Category: ${data.category.charAt(0).toUpperCase() + data.category.slice(1)}\n`;
        }
        
        if (data.timeframe) {
            selections += `- Timeframe: ${data.timeframe}\n`;
        }

        if (selections === '*Current Selections:*\n') {
            selections += 'No criteria selected yet\n';
        }

        return selections;
    }

    async showFilterOptions(chatId, telegramId) {
        const userState = this.bot.userStates.get(telegramId);
        if (!userState) {
            await this.bot.sendMessage(chatId, 'Please start over with /rules command.');
            return;
        }
        
        const selections = this.getCurrentSelections(userState.data);
        
        const message = `
*🔍 Filter Options*

${selections}

Select the criteria for your filter rule:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '📊 Market Cap', callback_data: 'mcap_select' },
                    { text: '💰 Price Range', callback_data: 'price_select' }
                ],
                [
                    { text: '💧 Liquidity', callback_data: 'liquidity_select' },
                    { text: '📈 Volume', callback_data: 'volume_select' }
                ],
                [
                    { text: '🏷️ Category', callback_data: 'category_select' },
                    { text: '⏰ Timeframe', callback_data: 'timeframe_select' }
                ],
                [
                    { text: '✅ Done', callback_data: 'confirm_rule' }
                ],
                [
                    { text: '◀️ Back', callback_data: 'rules_create' }
                ]
            ]
        };

        await this.bot.sendMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
    }

    // All callback handling delegated to CallbackRouter
    async handleCallbackQuery(ctx) {
        await this.callbackRouter.handleCallbackQuery(ctx);
    }

    async handleOtherCallbacks(ctx) {
        // Simplified callback handling for remaining methods
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const action = ctx.callbackQuery.data;

        try {
            if (action === 'main_menu') {
                await this.showMainMenu(chatId);
                return;
            }

            if (action === 'settings') {
                await this.showSettings(chatId, telegramId);
                return;
            }

            // Log unhandled actions
            console.warn('Unhandled callback action:', action);
            await this.bot.sendMessage(chatId, 'Sorry, this action is not supported. Please try again.');

        } catch (error) {
            console.error('Error handling other callbacks:', error);
            await this.bot.sendMessage(chatId, 'Sorry, there was an error processing your request. Please try again.');
        }
    }

    async showStrategyMenu(chatId, telegramId) {
        try {
            const message = `
*🎯 Trading Strategies*

Select a strategy type:

- 📈 Volume Spike - Trade on significant volume increases
- 📉 Dip Buy - Buy during price dips
- 📊 Momentum - Trade based on price momentum
- 📈 Volatility - Trade based on price volatility
- 👥 Copy Trading - Mirror successful traders
- ⚖️ Portfolio Rebalancing - Maintain target allocations
- 🎯 Event Triggers - React to token events
- 🛡️ Risk Management - Protect your portfolio`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📈 Volume Spike', callback_data: 'volume_spike' },
                        { text: '📉 Dip Buy', callback_data: 'dip_buy' }
                    ],
                    [
                        { text: '📊 Momentum', callback_data: 'momentum' }
                    ],
                    [
                        { text: '📈 Volatility', callback_data: 'volatility' },
                        { text: '👥 Copy Trading', callback_data: 'copy_trade' }
                    ],
                    [
                        { text: '⚖️ Portfolio Rebalance', callback_data: 'portfolio_rebalance' },
                        { text: '🎯 Event Triggers', callback_data: 'event_triggers' }
                    ],
                    [
                        { text: '🛡️ Risk Management', callback_data: 'risk_management' }
                    ],
                    [
                        { text: '◀️ Back', callback_data: 'trade' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in showStrategyMenu:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading the strategy menu.');
        }
    }
    isStrategyActive(strategies, strategyType) {
        return strategies.some(strategy => {
            try {
                const data = JSON.parse(strategy.strategy_json);
                return data.type === strategyType && data.params && data.params.isActive === true;
            } catch (e) {
                return false;
            }
        });
    }

    async handleStrategyToggle(chatId, telegramId, strategyType) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            if (!user) {
                await this.sendAndStoreMessage(chatId, 'Please create an account first.');
                return;
            }

            const strategies = await this.db.getUserStrategies(user.id);
            const isCurrentlyActive = this.isStrategyActive(strategies, strategyType);

            if (isCurrentlyActive) {
                // Deactivate the strategy
                const currentStrategy = strategies.find(s => {
                    try {
                        const data = JSON.parse(s.strategy_json);
                        return data.type === strategyType && data.params && data.params.isActive === true;
                    } catch (e) {
                        return false;
                    }
                });

                if (currentStrategy) {
                    const data = JSON.parse(currentStrategy.strategy_json);
                    data.params.isActive = false;
                    await this.db.updateStrategy(currentStrategy.id, {
                        strategy_json: JSON.stringify(data)
                    });
                }

                await this.sendAndStoreMessage(chatId, `❌ ${this.formatStrategyName(strategyType)} strategy has been deactivated.`);
            } else {
                // First, deactivate all other strategies (mutual exclusion)
                for (const strategy of strategies) {
                    try {
                        const data = JSON.parse(strategy.strategy_json);
                        if (data.params && data.params.isActive === true) {
                            data.params.isActive = false;
                            await this.db.updateStrategy(strategy.id, {
                                strategy_json: JSON.stringify(data)
                            });
                        }
                    } catch (e) {
                        console.error('Error deactivating strategy:', strategy.id, e);
                    }
                }

                // Create or activate the selected strategy
                let targetStrategy = strategies.find(s => {
                    try {
                        const data = JSON.parse(s.strategy_json);
                        return data.type === strategyType;
                    } catch (e) {
                        return false;
                    }
                });

                if (targetStrategy) {
                    // Update existing strategy
                    const data = JSON.parse(targetStrategy.strategy_json);
                    data.params.isActive = true;
                    await this.db.updateStrategy(targetStrategy.id, {
                        strategy_json: JSON.stringify(data)
                    });
                } else {
                    // Create new strategy with default parameters
                    const defaultParams = TelegramUtils.getDefaultStrategyParams(strategyType);
                    defaultParams.isActive = true;
                    await this.db.createStrategy(user.id, {
                        type: strategyType,
                        params: defaultParams
                    });
                }

                await this.sendAndStoreMessage(chatId, `✅ ${TelegramUtils.formatStrategyName(strategyType)} strategy has been activated!`);
            }

            // Return to strategies menu
            await this.handleStrategies(chatId, telegramId);
        } catch (error) {
            console.error('Error in handleStrategyToggle:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, there was an error toggling the strategy.');
        }
    }

    // Helper method for checking if strategy is active
    isStrategyActive(strategies, strategyType) {
        return TelegramUtils.isStrategyActive(strategies, strategyType);
    }
}

module.exports = TelegramBotManager;