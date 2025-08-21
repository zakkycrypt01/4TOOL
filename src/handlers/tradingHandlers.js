const TelegramErrorHandler = require('../utils/telegramErrorHandler');

class TradingHandlers {
    constructor(bot, db, config, sellManager) {
        this.bot = bot;
        this.db = db;
        this.config = config;
        const RugCheck = require('../modules/rugCheck');
        this.rugCheck = new RugCheck();
        const TokenAnalysis = require('../modules/tokenAnalysis');
        this.tokenAnalysis = new TokenAnalysis();
        const TradingExecution = require('../modules/tradingExecution');
        this.tradingExecution = new TradingExecution(config);
        const BuyManager = require('../modules/buyManager');
        this.buyManager = new BuyManager(config, this.tradingExecution, db);
        this.sellManager = sellManager; // Use the shared instance!
        this.userStates = new Map();
        this.lastMessageIds = new Map();
        this.pendingTokenCheck = null;
    }

    // Handle input messages for trading-related waiting states
    async handleMessage(ctx, userState) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const message = ctx.message.text;

        try {
            // Check for pending token check first
            if (this.pendingTokenCheck && this.pendingTokenCheck.telegramId === telegramId) {
                const tokenAddress = message.trim();
                const checkType = this.pendingTokenCheck.type;
                
                // Clear the pending state
                this.pendingTokenCheck = null;
                
                if (checkType === 'check') {
                    await this.handleTokenCheck(chatId, telegramId, tokenAddress);
                } else if (checkType === 'report') {
                    await this.handleTokenCheck(chatId, telegramId, tokenAddress);
                }
                return { handled: true, clearState: true };
            }

            if (userState && userState.state) {
                switch (userState.state) {
                    case 'awaiting_token_address': {
                        // Used for buy token flow
                        const tokenAddress = message.trim();
                        // Optionally validate token address here
                        await this.handleBuyToken(chatId, telegramId, tokenAddress);
                        return { handled: true, clearState: true };
                    }
                    case 'awaiting_custom_buy_amount': {
                        // Handle custom buy amount input
                        const amount = parseFloat(message.trim());
                        if (isNaN(amount) || amount <= 0) {
                            await this.sendAndStoreMessage(chatId, 'Please enter a valid positive number for the amount.');
                            return { handled: true, clearState: false };
                        }
                        const tokenAddress = userState.data.tokenAddress;
                        // Show confirmation message before executing
                        const confirmMsg = `\n*🛒 Confirm Buy Order*\n\n*Token:* \`${tokenAddress}\`\n*Amount:* ${amount} SOL\n\nPlease confirm your buy order:`;
                        const keyboard = {
                            inline_keyboard: [
                                [
                                    { text: '✅ Confirm Buy', callback_data: `confirm_buy_${tokenAddress}_${amount}` },
                                    { text: '❌ Cancel', callback_data: 'trade' }
                                ]
                            ]
                        };
                        await this.sendAndStoreMessage(chatId, confirmMsg, {
                            parse_mode: 'Markdown',
                            reply_markup: keyboard
                        });
                        return { handled: true, clearState: true };
                    }
                    default:
                        return false; // Not handled by trading handlers
                }
            }
            return false;
        } catch (error) {
            console.error('Error in tradingHandlers.handleMessage:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your trading input.');
            return true;
        }
    }

    async handleTrade(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                const message = `
*⚠️ No Active Wallet*

Please create or import a wallet first to start trading.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            if (activeWallet.is_locked) {
                const message = `
*⚠️ Wallet is Locked*

Please unlock your wallet first to start trading.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🔓 Unlock Wallet', callback_data: `unlock_wallet_${activeWallet.id}` }
                        ],
                        [
                            { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            const message = `
*⚡️ Trading Hub*

*Active Wallet:* \`${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}\`

Choose your trading action:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🛒 Buy Token', callback_data: 'buy_token' },
                        { text: '💰 Sell Token', callback_data: 'sell_token' }
                    ],
                    [
                        { text: '🔍 Check Token', callback_data: 'check_token' },
                        { text: '📊 Token Report', callback_data: 'token_report' }
                    ],
                    [
                        { text: '🔄 Refresh Holdings', callback_data: 'refresh_holdings' },
                        { text: '📈 Trade History', callback_data: 'trade_history' }
                    ],
                    [
                        { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleTrade:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while accessing the trading hub.');
        }
    }

    async handleBuyToken(chatId, telegramId, tokenAddress = null) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                const message = `
*⚠️ No Active Wallet*

Please create or import a wallet first to start trading.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Trade', callback_data: 'trade' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            if (activeWallet.is_locked) {
                const message = `
*⚠️ Wallet is Locked*

Please unlock your wallet first to start trading.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '🔓 Unlock Wallet', callback_data: `unlock_wallet_${activeWallet.id}` }
                        ],
                        [
                            { text: '◀️ Back to Trade', callback_data: 'trade' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            if (tokenAddress) {
                // If token address is provided, show buy options for that token
                const message = `
*🛒 Buy Token*

*Token Address:* \`${tokenAddress}\`

Select buy amount:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '0.1 SOL', callback_data: `buy_amount_0.1_${tokenAddress}` },
                            { text: '0.5 SOL', callback_data: `buy_amount_0.5_${tokenAddress}` }
                        ],
                        [
                            { text: '1 SOL', callback_data: `buy_amount_1_${tokenAddress}` },
                            { text: '5 SOL', callback_data: `buy_amount_5_${tokenAddress}` }
                        ],
                        [
                            { text: 'Custom Amount', callback_data: `custom_buy_${tokenAddress}` }
                        ],
                        [
                            { text: '◀️ Back to Trade', callback_data: 'trade' }
                        ]
                    ]
                };

                // Set user state to allow custom input if needed
                this.userStates.set(telegramId, {
                    state: 'awaiting_buy_amount_selection',
                    data: { tokenAddress }
                });

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                // If no token address, show token input prompt
                const message = `
*🛒 Buy Token*

Please enter the token address you want to buy:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '❌ Cancel', callback_data: 'trade' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

                // Set user state to await token address and recognize custom input
                this.userStates.set(telegramId, {
                    state: 'awaiting_token_address',
                    data: { action: 'buy', allowCustomInput: true }
                });
            }
        } catch (error) {
            console.error('Error handling buy token:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your buy request.');
        }
    }

    async handleBuyAmount(chatId, telegramId, amount) {
        try {
            const [amountValue, tokenAddress] = amount.split('_');
            const numericAmount = parseFloat(amountValue);

            if (isNaN(numericAmount) || numericAmount <= 0) {
                throw new Error('Invalid amount');
            }

            const message = `
*🛒 Confirm Buy Order*

*Token:* \`${tokenAddress}\`
*Amount:* ${numericAmount} SOL

Please confirm your buy order:`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '✅ Confirm Buy', callback_data: `confirm_buy_${tokenAddress}_${numericAmount}` },
                        { text: '❌ Cancel', callback_data: 'trade' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error handling buy amount:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while processing your buy amount.');
        }
    }

    async handleRetryLastBuy(chatId, telegramId) {
        try {
            if (!this.buyManager) {
                await this.sendAndStoreMessage(chatId, 'Buy manager not available. Please try again.');
                return;
            }

            await this.buyManager.retryLastFailedOrder(chatId, telegramId, this);
        } catch (error) {
            console.error('Error handling retry last buy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while retrying your order. Please try again.');
        }
    }

    async handleSellToken(chatId, telegramId) {
        try {
            await this.sellManager.initiateSell(chatId, telegramId, this);
        } catch (error) {
            console.error('Error in handleSellToken:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while initiating the sell process. Please try again.');
        }
    }

    async handleCustomSellAmountInput(chatId, telegramId, text) {
        try {
            const pendingSell = this.sellManager.pendingSell.get(telegramId);
            console.log('[handleCustomSellAmountInput] Received input:', text, 'for', telegramId, 'pendingSell:', pendingSell);
            const amount = parseFloat(text.trim());
            
            if (isNaN(amount) || amount <= 0) {
                await this.sendAndStoreMessage(chatId, 'Please enter a valid positive number.');
                return;
            }

            if (!pendingSell) {
                await this.sendAndStoreMessage(chatId, 'No pending sell found. Please start again.');
                return;
            }

            if (amount > pendingSell.balance) {
                await this.sendAndStoreMessage(chatId, `You don't have enough tokens. Your balance is ${pendingSell.balance.toFixed(6)} tokens.`);
                return;
            }

            // Proceed with sell confirmation
            await this.sellManager.confirmSell(chatId, telegramId, pendingSell.tokenAddress, amount, amount.toString(), this);

            // Do NOT clear pendingSell or userState here; only clear after actual sell execution

        } catch (error) {
            console.error('Error handling custom sell amount:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong. Please try again.');
        }
    }

    async handleTokenCheck(chatId, telegramId, tokenAddress = null) {
        try {
            if (!tokenAddress) {
                // Request token address from user
                const message = `
*🔍 Token Check*

Please enter the token address you want to analyze:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '❌ Cancel', callback_data: 'trade' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });

                // Store the state to handle the next message as a token address
                this.pendingTokenCheck = {
                    type: 'check',
                    telegramId
                };
                return;
            }

            const report = await this.rugCheck.getTokenReport(tokenAddress);
            
            // Format the token information using the new TokenAnalysis module
            const message = await this.tokenAnalysis.formatTokenInfo(report);
            const keyboard = this.tokenAnalysis.getActionButtons(tokenAddress);

            // Check if message is too long for Telegram (max 4096 characters)
            if (message.length > 4000) {
                // If message is too long, send a shorter version
                const shortMessage = `🔹 *${report.tokenMeta?.name || 'Unknown Token'}*\n📍 \`${tokenAddress}\`\n\n⚠️ Risk Score: ${report.score_normalised || 0}/100\n📊 Supply: ${this.tokenAnalysis.formatNumber(report.token?.supply || 0)}\n\nFull analysis available - message was too long to display.`;
                
                await this.sendAndStoreMessage(chatId, shortMessage, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            }

        } catch (error) {
            console.error('Error checking token:', error);
            // Send a simpler error message without markdown to avoid parsing issues
            await this.sendAndStoreMessage(chatId, `Sorry, couldn't analyze the token. Error: ${error.message}`, {
                reply_markup: {
                    inline_keyboard: [
                        [{ text: '◀️ Back to Trade', callback_data: 'trade' }]
                    ]
                }
            });
        }
    }

    async handleTokenDetails(chatId, telegramId, tokenAddress) {
        try {
            const report = await this.rugCheck.getTokenReport(tokenAddress);
            
            // Format the token information using the new TokenAnalysis module
            const message = await this.tokenAnalysis.formatTokenInfo(report);
            const keyboard = this.tokenAnalysis.getActionButtons(tokenAddress);

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error fetching token details:', error);
            await this.sendAndStoreMessage(chatId, `Sorry, couldn't fetch token details: ${error.message}`);
        }
    }

    async handleTokenReport(chatId, telegramId) {
        const message = `
*📊 Token Report*

Please enter the token address you want to analyze:`;

        const keyboard = {
            inline_keyboard: [
                [
                    { text: '❌ Cancel', callback_data: 'trade' }
                ]
            ]
        };

        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });

        // Store the state to handle the next message as a token address
        this.pendingTokenCheck = {
            type: 'report',
            telegramId
        };
    }

    async handleConfirmBuy(chatId, telegramId, params) {
        try {
            await this.buyManager.executeBuy(chatId, telegramId, params, this);
        } catch (error) {
            console.error('Error in handleConfirmBuy:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong during the buy execution. Please try again.');
        }
    }

    async handleExecuteBuy(chatId, telegramId, params) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                await this.sendAndStoreMessage(chatId, 'No active wallet found. Please create or import a wallet first.');
                return;
            }

            if (activeWallet.is_locked) {
                await this.sendAndStoreMessage(chatId, 'Wallet is locked. Please unlock it first.');
                return;
            }

            // Show processing message
            await this.sendAndStoreMessage(chatId, '⏳ *Processing buy order...*\n\nPlease wait while we execute your trade.', {
                parse_mode: 'Markdown'
            });

            // Set the user wallet in trading execution
            const { Keypair } = require('@solana/web3.js');
            
            // Decrypt the private key
            const decryptedKey = this.decryptPrivateKey(activeWallet.encrypted_private_key, telegramId.toString());
            
            // Convert the decrypted key to Uint8Array
            let walletKeypair;
            try {
                // The decrypted key should be in base64 format
                const secretKey = Buffer.from(decryptedKey, 'base64');
                if (secretKey.length !== 64) {
                    throw new Error('Invalid private key length');
                }
                walletKeypair = Keypair.fromSecretKey(secretKey);
            } catch (error) {
                console.error('Error creating keypair:', error);
                throw new Error('Invalid wallet key format');
            }

            // Set the wallet in trading execution
            this.tradingExecution.setUserWallet(walletKeypair);

            // Execute the buy order through TradingExecution
            const result = await this.tradingExecution.executeBuy(
                user.id,
                params.tokenAddress,
                params.amount
            );

            if (result.success) {
                // Additional verification: Double-check transaction success
                await this.verifyBuyTransaction(result.signature, params.tokenAddress, user.id);

                const message = `
*✅ Buy Order Executed*

*Token:* \`${params.tokenAddress}\`
*Amount:* ${params.amount} SOL
*Transaction:* \`${result.signature}\`
*Tokens Received:* ${result.tokensReceived || 'Calculating...'}

Your buy order has been successfully executed!`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                            { text: '📈 Trade History', callback_data: 'trade_history' }
                        ],
                        [
                            { text: '🛒 Buy More', callback_data: 'buy_token' },
                            { text: '💰 Sell Token', callback_data: 'sell_token' }
                        ],
                        [
                            { text: '◀️ Back to Trade', callback_data: 'trade' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                throw new Error(result.error || 'Buy execution failed');
            }

        } catch (error) {
            console.error('Error executing buy:', error);
            
            // Check if user has a recent failed order for smart retry option
            const hasRecentOrder = this.buyManager && this.buyManager.hasRecentFailedOrder(telegramId);
            
            const message = `\n*❌ Buy Order Failed*\n\n*Error:* ${error.message}\n\nYour buy order could not be completed. Please try again.`;
            const keyboard = {
                inline_keyboard: [
                    hasRecentOrder ? [
                        { text: '🔄 Try Again', callback_data: 'retry_last_buy' },
                        { text: '🛒 New Order', callback_data: 'buy_token' }
                    ] : [
                        { text: '🔄 Try Again', callback_data: 'buy_token' }
                    ],
                    [
                        { text: '◀️ Back to Trade', callback_data: 'trade' }
                    ]
                ]
            };
            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        }
    }

    async handleOrderTypes(chatId, telegramId) {
        try {
            const message = `
*📊 Order Types*

Choose your preferred order type for buying tokens:

*Limit Orders*
• Set a specific price to buy
• Order executes when market hits your price
• You control slippage

*Market Orders*
• Buy at the current market price
• Executes immediately
• May have slippage

💡 Tip: Use limit orders for better price control.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📋 Use Limit Orders', callback_data: 'set_default_limit_orders' },
                        { text: '⚡️ Use Market Orders', callback_data: 'set_default_market_orders' }
                    ],
                    [
                        { text: '💰 Trade Settings', callback_data: 'trade_settings' },
                        { text: '◀️ Back', callback_data: 'trading_settings' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handleOrderTypes:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading order types.');
        }
    }

    async handleTradingSettings(chatId, telegramId, callbackData) {
        try {
            if (callbackData === 'trading_setting_stop_loss') {
                const message = `
*⛔️ Stop Loss Settings*

Configure automatic stop-loss orders to limit your losses.

*Available Options:*
• 5% - Conservative protection
• 10% - Moderate risk tolerance
• 15% - Higher risk tolerance
• 20% - Maximum risk tolerance
• Custom - Set your own percentage

*Current Setting:* Not configured

Choose your preferred stop-loss percentage:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '5%', callback_data: 'set_stop_loss_5' },
                            { text: '10%', callback_data: 'set_stop_loss_10' }
                        ],
                        [
                            { text: '15%', callback_data: 'set_stop_loss_15' },
                            { text: '20%', callback_data: 'set_stop_loss_20' }
                        ],
                        [
                            { text: '🎯 Custom', callback_data: 'set_stop_loss_custom' },
                            { text: '❌ Disable', callback_data: 'disable_stop_loss' }
                        ],
                        [
                            { text: '◀️ Back to Settings', callback_data: 'trade_settings' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else if (callbackData === 'trading_setting_take_profit') {
                const message = `
*✅ Take Profit Settings*

Configure automatic take-profit orders to secure your gains.

*Available Options:*
• 20% - Conservative gains
• 50% - Moderate targets
• 100% - Aggressive targets
• 200% - High-risk targets
• Custom - Set your own percentage

*Current Setting:* Not configured

Choose your preferred take-profit percentage:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '20%', callback_data: 'set_take_profit_20' },
                            { text: '50%', callback_data: 'set_take_profit_50' }
                        ],
                        [
                            { text: '100%', callback_data: 'set_take_profit_100' },
                            { text: '200%', callback_data: 'set_take_profit_200' }
                        ],
                        [
                            { text: '🎯 Custom', callback_data: 'set_take_profit_custom' },
                            { text: '❌ Disable', callback_data: 'disable_take_profit' }
                        ],
                        [
                            { text: '◀️ Back to Settings', callback_data: 'trade_settings' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else if (callbackData === 'trading_setting_trailing_stop') {
                const message = `
*📈 Trailing Stop Settings*

Configure trailing stop-loss orders that follow price movements.

*How it works:*
• Stop-loss adjusts upward as price rises
• Locks in profits while limiting losses
• Triggers when price drops by set percentage

*Available Options:*
• 3% - Tight trailing
• 5% - Moderate trailing
• 10% - Loose trailing
• Custom - Set your own percentage

*Current Setting:* Not configured

Choose your preferred trailing stop percentage:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '3%', callback_data: 'set_trailing_stop_3' },
                            { text: '5%', callback_data: 'set_trailing_stop_5' }
                        ],
                        [
                            { text: '10%', callback_data: 'set_trailing_stop_10' },
                            { text: '🎯 Custom', callback_data: 'set_trailing_stop_custom' }
                        ],
                        [
                            { text: '❌ Disable', callback_data: 'disable_trailing_stop' },
                            { text: '◀️ Back', callback_data: 'trade_settings' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else if (callbackData === 'trading_setting_trail_threshold') {
                const message = `
*🎯 Trail Threshold Settings*

Set the minimum profit required before trailing stop activates.

*Available Options:*
• 5% - Start trailing early
• 10% - Conservative threshold
• 20% - Moderate threshold
• 30% - High threshold

*Current Setting:* Not configured

Choose your preferred trail threshold:`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '5%', callback_data: 'set_trail_threshold_5' },
                            { text: '10%', callback_data: 'set_trail_threshold_10' }
                        ],
                        [
                            { text: '20%', callback_data: 'set_trail_threshold_20' },
                            { text: '30%', callback_data: 'set_trail_threshold_30' }
                        ],
                        [
                            { text: '🎯 Custom', callback_data: 'set_trail_threshold_custom' },
                            { text: '◀️ Back', callback_data: 'trade_settings' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
            } else {
                await this.sendAndStoreMessage(chatId, `Trading setting "${callbackData}" has been configured successfully.`);
                
                // Return to trade settings after a brief delay
                await new Promise(resolve => setTimeout(resolve, 1000));
                await this.sendAndStoreMessage(chatId, 'Please choose another trading setting to configure.', {
                    reply_markup: {
                        inline_keyboard: [
                            [{ text: '💰 Back to Trade Settings', callback_data: 'trade_settings' }]
                        ]
                    }
                });
            }
        } catch (error) {
            console.error('Error in handleTradingSettings:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while configuring trading settings.');
        }
    }

    async handleTradeActions(ctx) {
        const chatId = ctx.chat.id;
        const telegramId = ctx.from.id.toString();
        const action = ctx.callbackQuery.data;

        try {
            if (action === 'trade') {
                await this.handleTrade(chatId, telegramId);
                return;
            }

            if (action === 'buy_token') {
                await this.handleBuyToken(chatId, telegramId);
                return;
            }

            if (action === 'retry_last_buy') {
                await this.handleRetryLastBuy(chatId, telegramId);
                return;
            }

            if (action === 'sell_token') {
                await this.handleSellToken(chatId, telegramId);
                return;
            }

            if (action === 'check_token') {
                await this.handleTokenCheck(chatId, telegramId);
                return;
            }

            if (action === 'token_report') {
                await this.handleTokenReport(chatId, telegramId);
                return;
            }

            if (action.startsWith('buy_token_')) {
                const tokenAddress = action.replace('buy_token_', '');
                await this.handleBuyToken(chatId, telegramId, tokenAddress);
                return;
            }

            if (action.startsWith('buy_amount_')) {
                const amount = action.replace('buy_amount_', '');
                await this.handleBuyAmount(chatId, telegramId, amount);
                return;
            }

            if (action.startsWith('confirm_buy_execute_')) {
                // Handle confirm_buy_execute_ pattern
                const paramString = action.replace('confirm_buy_execute_', '');
                const parts = paramString.split('_');
                const amount = parts.pop();
                const tokenAddress = parts.join('_');
                
                const params = {
                    tokenAddress: tokenAddress,
                    amount: parseFloat(amount)
                };
                
                await this.handleExecuteBuy(chatId, telegramId, params);
                return;
            }

            if (action.startsWith('confirm_buy_')) {
                // Handle confirm_buy_ pattern (like confirm_buy_DYFj4U9V75mXnwg5oofU3TVpFgpddPVBKpUt35MJpump_0.1)
                const paramString = action.replace('confirm_buy_', '');
                const parts = paramString.split('_');
                const amount = parts.pop(); // Last part is the amount
                const tokenAddress = parts.join('_'); // Rejoin the rest as token address
                
                const params = {
                    tokenAddress: tokenAddress,
                    amount: parseFloat(amount)
                };
                
                await this.handleExecuteBuy(chatId, telegramId, params);
                return;
            }

            if (action === 'cancel_buy') {
                // Clear pending buy state
                if (this.buyManager && typeof this.buyManager.clearPendingBuy === 'function') {
                    this.buyManager.clearPendingBuy(telegramId);
                }
                await this.bot.sendMessage(chatId, 'Buy order cancelled.');
                return;
            }

            // Sell-related handlers
            if (action.startsWith('sell_token_')) {
                const tokenAddress = action.replace('sell_token_', '');
                if (this.sellManager && typeof this.sellManager.handleTokenSell === 'function') {
                    await this.sellManager.handleTokenSell(chatId, telegramId, tokenAddress, this.bot);
                }
                return;
            }

            if (action.startsWith('sell_percent_')) {
                // Format: sell_percent_<percent>_<tokenAddress>
                const match = action.match(/^sell_percent_(\d+)_([A-Za-z0-9]+)/);
                if (match) {
                    const percentage = parseInt(match[1], 10);
                    const tokenAddress = match[2];
                    if (this.sellManager && typeof this.sellManager.handleSellPercent === 'function') {
                        await this.sellManager.handleSellPercent(chatId, telegramId, tokenAddress, percentage, this.bot);
                    }
                } else {
                    await this.bot.sendMessage(chatId, 'Invalid sell percent action. Please try again.');
                }
                return;
            }

            if (action.startsWith('sell_custom_')) {
                // Format: sell_custom_<tokenAddress>
                const tokenAddress = action.replace('sell_custom_', '');
                if (tokenAddress && this.sellManager && typeof this.sellManager.handleCustomSell === 'function') {
                    await this.sellManager.handleCustomSell(chatId, telegramId, tokenAddress, this.bot);
                } else {
                    await this.bot.sendMessage(chatId, 'Invalid custom sell action. Please try again.');
                }
                return;
            }

            if (action.startsWith('confirm_sell_execute_')) {
                const parts = action.replace('confirm_sell_execute_', '').split('_');
                const tokenAddress = parts[0];
                const amount = parts[1];
                if (this.sellManager && typeof this.sellManager.executeSell === 'function') {
                    await this.sellManager.executeSell(chatId, telegramId, tokenAddress, amount, this.bot);
                }
                return;
            }

            // Handle confirm_sell (new inline button)
            if (action.startsWith('confirm_sell_')) {
                // Format: confirm_sell_<shortKey>
                const key = action.replace('confirm_sell_', '');
                if (this.sellManager && typeof this.sellManager.getAndClearPendingSellByKey === 'function') {
                    const pending = this.sellManager.getAndClearPendingSellByKey(key);
                    if (pending && typeof this.sellManager.executeSell === 'function') {
                        await this.sellManager.executeSell(chatId, telegramId, pending.tokenAddress, pending.amount, this.bot);
                    } else {
                        await this.bot.sendMessage(chatId, 'Sell session expired or invalid. Please try again.');
                    }
                } else {
                    await this.bot.sendMessage(chatId, 'Sell session expired or invalid. Please try again.');
                }
                return;
            }

            if (action === 'cancel_sell') {
                // Clear pending sell state
                if (this.sellManager && typeof this.sellManager.clearPendingSell === 'function') {
                    this.sellManager.clearPendingSell(telegramId);
                }
                await this.bot.sendMessage(chatId, 'Sell order cancelled.');
                return;
            }

            if (action === 'refresh_holdings') {
                await this.handleSellToken(chatId, telegramId);
                return;
            }

            if (action.startsWith('token_details_')) {
                const tokenAddress = action.replace('token_details_', '');
                await this.handleTokenCheck(chatId, telegramId, tokenAddress);
                return;
            }

            if (action.startsWith('custom_buy_') || action.startsWith('buy_custom_')) {
                // Unified handler for both callback patterns
                const tokenAddress = action.replace('custom_buy_', '').replace('buy_custom_', '');
                await this.handleCustomBuyAmountPrompt(chatId, telegramId, tokenAddress);
                return;
            }

            // Handle other trade-related actions
            console.warn('Unhandled trade action:', action);
            await this.bot.sendMessage(chatId, 'Sorry, this trade action is not supported. Please try again.');
        } catch (error) {
            console.error('Error handling trade action:', error);
            await this.bot.sendMessage(chatId, 'Sorry, there was an error processing your trade request. Please try again.');
            // Clear any pending buy state on error
            if (this.buyManager && typeof this.buyManager.clearPendingBuy === 'function') {
                this.buyManager.clearPendingBuy(telegramId);
            }
        }
    }

    // Utility method to decrypt private keys
    decryptPrivateKey(encryptedData, password) {
        try {
            const crypto = require('crypto');
            const [ivHex, encrypted] = encryptedData.split(':');
            if (!ivHex || !encrypted) {
                throw new Error('Invalid encrypted data format');
            }

            const iv = Buffer.from(ivHex, 'hex');
            const key = crypto.scryptSync(password, 'salt', 32);
            const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return decrypted;
        } catch (error) {
            console.error('Error decrypting private key:', error);
            throw new Error('Failed to decrypt private key');
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        return await TelegramErrorHandler.sendMessage(this.bot, chatId, message, options, this.lastMessageIds);
    }

    async handleCustomBuyAmountPrompt(chatId, telegramId, tokenAddress) {
        const message = `*🛒 Custom Buy Amount*\n\nPlease enter the amount of SOL you want to spend for token:\n\n\`${tokenAddress}\``;
        const keyboard = {
            inline_keyboard: [
                [
                    { text: '❌ Cancel', callback_data: 'trade' }
                ]
            ]
        };
        await this.sendAndStoreMessage(chatId, message, {
            parse_mode: 'Markdown',
            reply_markup: keyboard
        });
        // Set user state to await custom buy amount in the shared bot.userStates map
        if (this.bot && this.bot.userStates) {
            this.bot.userStates.set(telegramId, {
                state: 'awaiting_custom_buy_amount',
                data: { tokenAddress }
            });
        } else {
            // Fallback to local map for legacy support
            this.userStates.set(telegramId, {
                state: 'awaiting_custom_buy_amount',
                data: { tokenAddress }
            });
        }
    }

    async verifyBuyTransaction(signature, tokenAddress, userId) {
        try {
            console.log(`[verifyBuyTransaction] Verifying buy transaction for user ${userId}, signature: ${signature}`);
            
            // Wait a bit for transaction to be fully confirmed
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // Get transaction details
            const { Connection } = require('@solana/web3.js');
            const connection = new Connection(process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com');
            
            const transaction = await connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!transaction) {
                throw new Error('Transaction not found on blockchain');
            }

            if (transaction.meta && transaction.meta.err) {
                throw new Error(`Transaction failed on blockchain: ${JSON.stringify(transaction.meta.err)}`);
            }

            // Verify that tokens were actually received
            if (transaction.meta && transaction.meta.postTokenBalances) {
                const tokenTransfers = transaction.meta.postTokenBalances.filter(
                    balance => balance.mint === tokenAddress
                );
                
                if (tokenTransfers.length === 0) {
                    throw new Error('No token transfer detected in transaction');
                }

                // Check if any token balance increased (indicating successful buy)
                const preBalances = transaction.meta.preTokenBalances || [];
                const postBalances = transaction.meta.postTokenBalances || [];
                
                let tokenReceived = false;
                for (const postBalance of postBalances) {
                    if (postBalance.mint === tokenAddress) {
                        const preBalance = preBalances.find(b => 
                            b.accountIndex === postBalance.accountIndex && 
                            b.mint === tokenAddress
                        );
                        
                        if (!preBalance || parseFloat(postBalance.uiTokenAmount.uiAmount) > parseFloat(preBalance.uiTokenAmount.uiAmount)) {
                            tokenReceived = true;
                            break;
                        }
                    }
                }

                if (!tokenReceived) {
                    throw new Error('No tokens were received in the transaction');
                }
            }

            console.log(`[verifyBuyTransaction] Buy transaction verified successfully for user ${userId}`);
            return true;
        } catch (error) {
            console.error(`[verifyBuyTransaction] Buy transaction verification failed for user ${userId}: ${error.message}`);
            throw new Error(`Buy transaction verification failed: ${error.message}`);
        }
    }
}

module.exports = TradingHandlers;
