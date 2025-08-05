const { PublicKey } = require('@solana/web3.js');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

// Utility sleep function for throttling API calls
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

class ManualManagementService {
    constructor(config, db, tradingExecution, telegramBot) {
        this.config = config;
        this.db = db;
        this.tradingExecution = tradingExecution;
        this.telegramBot = telegramBot;
        this.isMonitoring = false;
        this.monitoringInterval = null;
        this.monitoredTokens = new Map(); // tokenAddress -> { userId, ruleId, conditions, buyPrice, highestPrice }
        this.logger = console;
        this.lastBuyCheck = Date.now(); // Track last time we checked for new buys
        this.buyMonitorInterval = null;
        this.pendingSells = new Set(); // Track tokens currently being sold
    }

    /**
     * Start monitoring all active manual management rules
     */
    async startMonitoring() {
        if (this.isMonitoring) {
            this.logger.info('Manual management monitoring already active');
            return;
        }

        this.isMonitoring = true;
        this.logger.info('Starting manual management monitoring...');

        // Initial load of all active manual management rules
        await this.loadActiveManualManagementRules();

        // Start monitoring interval (check every second)
        this.monitoringInterval = setInterval(async () => {
            try {
                await this.checkAllMonitoredTokens();
            } catch (error) {
                this.logger.error('Error in monitoring interval:', error);
            }
        }, 1000);

        this.buyMonitorInterval = setInterval(async () => {
            try {
                await this.checkForNewBuyTokens();
            } catch (error) {
                this.logger.error('Error in buy monitor interval:', error);
            }
        }, 10000);

        this.logger.info('Manual management monitoring started with 1s sell check and 60s buy check intervals');
    }

    /**
     * Stop monitoring
     */
    stopMonitoring() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
        if (this.buyMonitorInterval) {
            clearInterval(this.buyMonitorInterval);
            this.buyMonitorInterval = null;
        }
        this.isMonitoring = false;
        this.monitoredTokens.clear();
        this.logger.info('Manual management monitoring stopped');
    }

    /**
     * Load all active manual management rules and their associated tokens
     */
    async loadActiveManualManagementRules() {
        try {
            this.logger.info('Loading active manual management rules...');
            
            // Get all users and their active manual management rules
            const users = await this.getAllUsers();
            this.logger.info(`Found ${users.length} users with active wallets`);
            
            for (const user of users) {
                const rules = await this.db.getRulesByUserId(user.id);
                const manualRules = rules.filter(rule => 
                    rule.type === 'manual_management' && rule.is_active === 1);

                this.logger.info(`User ${user.id}: Found ${manualRules.length} active manual management rules`);

                for (const rule of manualRules) {
                    const conditions = await this.db.getRuleConditions(rule.id);
                    const manualConditions = this.parseManualConditions(conditions);
                    
                    this.logger.info(`Rule ${rule.id}: Parsed conditions:`, manualConditions);
                    
                    if (manualConditions) {
                        const activeWallet = await this.db.getActiveWallet(user.id);
                        
                        if (activeWallet) {
                            await this.addTokensToMonitoring(user.id, rule.id, activeWallet.public_key, manualConditions);
                        } else {
                            this.logger.warn(`No active wallet found for user ${user.id}`);
                        }
                    } else {
                        this.logger.warn(`No manual conditions found for rule ${rule.id}`);
                    }
                }
            }
            
            this.logger.info(`Manual management monitoring loaded. Total monitored tokens: ${this.monitoredTokens.size}`);
        } catch (error) {
            this.logger.error('Error loading manual management rules:', error);
        }
    }

    /**
     * Get all users (helper method)
     */
    async getAllUsers() {
        try {
            // Get all users from the database
            // Since we don't have a direct getAllUsers method, well getusers from wallets
            const stmt = this.db.db.prepare(`
                SELECT DISTINCT u.* FROM users u 
                INNER JOIN wallets w ON u.id = w.user_id 
                WHERE w.is_active = 1   `);
            return stmt.all();
        } catch (error) {
            this.logger.error('Error getting all users:', error);
            return [];
        }
    }

    /**
     * Parse manual management conditions from rule conditions
     */
    parseManualConditions(conditions) {
        const manualConditions = {};
        
        for (const condition of conditions) {
            try {
                const value = JSON.parse(condition.condition_value);
                
                switch (condition.condition_type) {
                    case 'manual_take_profit':
                        manualConditions.takeProfit = value.percentage;
                        break;
                    case 'manual_stop_loss':
                        manualConditions.stopLoss = value.percentage;
                        break;
                    case 'manual_trailing_stop':
                        manualConditions.trailingStop = value.percentage;
                        break;
                }
            } catch (error) {
                this.logger.error('Error parsing condition:', condition, error);
            }
        }

        return Object.keys(manualConditions).length > 0 ? manualConditions : null;
    }

    /**
     * Add user's tokens to monitoring based on manual management rules
     */
    async addTokensToMonitoring(userId, ruleId, walletAddress, conditions) {
        try {
            // Get users token holdings
            const PortfolioService = require('./portfolioService');
            const portfolioService = new PortfolioService(this.config);
            const walletBalance = await portfolioService.getWalletBalance(walletAddress);

            // Monitor all tokens with balance >0
            for (const token of walletBalance.tokens) {
                if (token.amount > 0) {
                    // --- Prevent monitoring of already sold tokens ---
                    if (await this.isTokenSold(userId, token.mint)) {
                        this.logger.info(`Token ${token.mint} already sold for user ${userId}, skipping monitoring.`);
                        continue;
                    }
                    // Always fetch the most recent buy trade for this token and user
                    let buyPrice = null;
                    try {
                        const stmt = this.db.db.prepare(`
                            SELECT price FROM trades
                            WHERE user_id = ? AND token_address = ? AND side = 'buy'
                            ORDER BY timestamp DESC LIMIT 1
                        `);
                        const lastBuy = stmt.get(userId, token.mint);
                        if (lastBuy && lastBuy.price) {
                            buyPrice = lastBuy.price;
                        }
                    } catch (e) {
                        this.logger.error(`Error fetching last buy price for ${token.mint}:`, e);
                    }

                    // Always fetch the current price from the API
                    const TokenDataService = require('./tokenDataService');
                    const tokenDataService = new TokenDataService(this.config);
                    const tokenData = await tokenDataService.getTokenData(token.mint);

                    // Fallback: if no buy trade found, use current price (warn)
                    if (!buyPrice && tokenData && tokenData.price) {
                        buyPrice = tokenData.price;
                        this.logger.warn(`No buy trade found for ${token.mint}, using current price (${buyPrice}) as buy price fallback`);
                    }

                    // Only monitor if we have a buy price (from trade or fallback)
                    if (buyPrice && tokenData && tokenData.price) {
                        this.monitoredTokens.set(token.mint, {
                            userId,
                            ruleId,
                            walletAddress,
                            conditions,
                            buyPrice, // from trade or fallback
                            highestPrice: buyPrice,
                            tokenAmount: token.amount,
                            lastChecked: Date.now()
                        });
                        this.logger.info(`Added token ${token.mint} to manual management monitoring (buy price: ${buyPrice}, current price: ${tokenData.price})`);
                    } else {
                        this.logger.warn(`Skipping token ${token.mint}: missing buy price and/or current price from API`);
                    }
                    // Throttle API calls to avoid rate limits
                    await sleep(200);
                }
            }
        } catch (error) {
            this.logger.error('Error adding tokens to monitoring:', error);
        }
    }

    /**
     * Check all monitored tokens for sell conditions
     */
    async checkAllMonitoredTokens() {
        if (this.monitoredTokens.size === 0) {
            return; // No tokens to monitor
        }

        this.logger.info(`Checking ${this.monitoredTokens.size} monitored tokens for sell conditions...`);
        
        const TokenDataService = require('./tokenDataService');
        const tokenDataService = new TokenDataService(this.config);

        for (const [tokenAddress, tokenData] of this.monitoredTokens) {
            try {
                // Prevent duplicate sell execution for the same token
                if (this.pendingSells.has(tokenAddress)) {
                    this.logger.info(`Sell already pending for ${tokenAddress}, skipping this check.`);
                    continue;
                }
                this.logger.info(`Checking token ${tokenAddress} with conditions:`, tokenData.conditions);

                // Get current token price (force refresh from API)
                const TokenDataService = require('./tokenDataService');
                const tokenDataService = new TokenDataService(this.config);
                const currentTokenData = await tokenDataService.getTokenData(tokenAddress, true);
                if (!currentTokenData || !currentTokenData.price) {
                    this.logger.warn(`No price data available for token ${tokenAddress}`);
                    continue;
                }

                const currentPrice = currentTokenData.price;
                const buyPrice = tokenData.buyPrice;
                const priceChange = ((currentPrice - buyPrice) / buyPrice) * 100;

                this.logger.info(`Token ${tokenAddress}: Current price: ${currentPrice}, Buy price: ${buyPrice}, Change: ${priceChange.toFixed(2)}%`);

                // Update highest price for trailing stop
                if (currentPrice > tokenData.highestPrice) {
                    tokenData.highestPrice = currentPrice;
                    this.logger.info(`Updated highest price for ${tokenAddress}: ${currentPrice}`);
                }

                // Check sell conditions
                const shouldSell = await this.checkSellConditions(tokenAddress, tokenData, currentPrice, priceChange);
                if (shouldSell && shouldSell.shouldSell) {
                    this.logger.info(`Sell condition met for ${tokenAddress}: ${shouldSell.reason} (${shouldSell.percentage ? shouldSell.percentage.toFixed(2) : ''}%)`);
                    this.pendingSells.add(tokenAddress); // Mark as pending
                    const sellResult = await this.executeSell(tokenAddress, tokenData, currentPrice, shouldSell);
                    // Only remove from monitoring if sell was successful
                    if (sellResult && sellResult.success) {
                        this.removeTokenFromMonitoring(tokenAddress);
                    }
                    this.pendingSells.delete(tokenAddress); // Remove pending status regardless of result
                }
                // Throttle API calls to avoid rate limits
                await sleep(200);
            } catch (error) {
                this.logger.error(`Error checking monitored token ${tokenAddress}:`, error);
                // Remove from monitoring to avoid repeated errors
                this.removeTokenFromMonitoring(tokenAddress);
                this.pendingSells.delete(tokenAddress); // Clean up pending status if error
            }
        }
    }

    /**
     * Check if sell conditions are met
     */
    async checkSellConditions(tokenAddress, tokenData, currentPrice, priceChange) {
        const { conditions, buyPrice, highestPrice } = tokenData;

        // Check take profit
        if (conditions.takeProfit && priceChange >= conditions.takeProfit) {
            this.logger.info(`Take profit triggered for ${tokenAddress}: ${priceChange.toFixed(2)}% >= ${conditions.takeProfit}%`);
            return { shouldSell: true, reason: 'take_profit', percentage: priceChange };
        }

        // Check stop loss
        if (conditions.stopLoss && priceChange <= -conditions.stopLoss) {
            this.logger.info(`Stop loss triggered for ${tokenAddress}: ${priceChange.toFixed(2)}% <= -${conditions.stopLoss}%`);
            return { shouldSell: true, reason: 'stop_loss', percentage: priceChange };
        }

        // Check trailing stop
        if (conditions.trailingStop) {
            const trailingStopPrice = highestPrice * (1 - conditions.trailingStop / 100);
            if (currentPrice <= trailingStopPrice) {
                const trailingDrop = ((currentPrice - highestPrice) / highestPrice) * 100;
                this.logger.info(`Trailing stop triggered for ${tokenAddress}: ${trailingDrop.toFixed(2)}% <= -${conditions.trailingStop}%`);
                return { shouldSell: true, reason: 'trailing_stop', percentage: trailingDrop };
            }
        }

        return { shouldSell: false };
    }

    /**
     * Execute sell order when conditions are met
     */
    async executeSell(tokenAddress, tokenData, currentPrice, sellReason) {
        try {
            const { userId, walletAddress, tokenAmount, conditions, telegramId } = tokenData;

            // Get user's wallet (userId is already the user ID, not telegram ID)
            const activeWallet = await this.db.getActiveWallet(userId);

            if (!activeWallet || activeWallet.is_locked) {
                this.logger.error(`Cannot execute sell: wallet not available or locked for user ${userId}`);
                return { success: false, error: 'Wallet not available or locked' };
            }

            // You need to get telegramId for this user
            let userTelegramId = telegramId;
            if (!userTelegramId) {
                // Fetch from users table if not present
                const stmt = this.db.db.prepare('SELECT telegram_id FROM users WHERE id = ?');
                const user = stmt.get(userId);
                if (!user) {
                    this.logger.error(`User not found for ID: ${userId}`);
                    return { success: false, error: 'User not found' };
                }
                userTelegramId = user.telegram_id;
            }

            // Decrypt wallet
            const decryptedKey = this.decryptPrivateKey(activeWallet.encrypted_private_key, userTelegramId);
            const privateKeyBuffer = Buffer.from(decryptedKey, 'base64');
            const keypair = Keypair.fromSecretKey(privateKeyBuffer);

            // Set wallet in trading execution
            this.tradingExecution.setUserWallet(keypair);

            // Execute sell
            const result = await this.tradingExecution.executeSell(
                userId,
                tokenAddress,
                tokenAmount,
                keypair
            );

            if (result.success) {
                // Record the trade
                await this.db.createTrade(
                    userId,
                    tokenAddress,
                    tokenAmount,
                    result.tokenPrice,
                    'sell'
                );

                // Send notification
                await this.sendSellNotification(userId, {
                    tokenAddress,
                    tokenAmount,
                    price: result.tokenPrice,
                    solReceived: result.solReceived,
                    reason: sellReason.reason,
                    conditions,
                    signature: result.signature
                });

                // --- Mark as sold in DB to prevent re-monitoring ---
                await this.markTokenAsSold(userId, tokenAddress);

                // --- Charge fees only on successful trade ---
                if (this.feeService && typeof this.feeService.chargeFee === 'function') {
                    try {
                        await this.feeService.chargeFee(userId, tokenAddress, result.tokenPrice, 'sell');
                        this.logger.info(`Fee charged for user ${userId}, token ${tokenAddress}`);
                    } catch (feeError) {
                        this.logger.error('Error charging fee:', feeError);
                    }
                }

                this.logger.info(`Manual management sell executed successfully for ${tokenAddress}`);
            } else {
                this.logger.error(`Manual management sell failed for ${tokenAddress}:`, result.error);
            }

            return result;
        } catch (error) {
            this.logger.error(`Error executing manual management sell for ${tokenAddress}:`, error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send notification about executed sell
     */
    async sendSellNotification(userId, sellData) {
        try {
            // Get user by ID (userId is already the user ID, not telegram ID)
            const stmt = this.db.db.prepare('SELECT * FROM users WHERE id = ?');
            const user = stmt.get(userId);
            
            if (!user) {
                this.logger.error(`User not found for ID: ${userId}`);
                return;
            }

            // Ensure signature is a string
            let signatureStr = 'N/A';
            if (typeof sellData.signature === 'string') {
                signatureStr = sellData.signature;
            } else if (sellData.signature && typeof sellData.signature.signature === 'string') {
                signatureStr = sellData.signature.signature;
            }

            const message = `
*🤖 Manual Management Sell Executed*

*Token:* ${sellData.tokenAddress.slice(0, 8)}...${sellData.tokenAddress.slice(-8)}
*Amount Sold:* ${sellData.tokenAmount.toFixed(6)}
*Price:* ${sellData.price.toFixed(8)} SOL
*SOL Received:* ${sellData.solReceived.toFixed(4)} SOL

*Reason:* ${sellData.reason.replace('_', ' ').toUpperCase()}

*Conditions Applied:*
${sellData.conditions.takeProfit ? `• Take Profit: ${sellData.conditions.takeProfit}%` : ''}
${sellData.conditions.stopLoss ? `• Stop Loss: ${sellData.conditions.stopLoss}%` : ''}
${sellData.conditions.trailingStop ? `• Trailing Stop: ${sellData.conditions.trailingStop}%` : ''}

*Transaction:* [View on Solscan](https://solscan.io/tx/${signatureStr})`;
            
            await this.telegramBot.sendMessage(user.telegram_id, message, {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            });

        } catch (error) {
            this.logger.error('Error sending sell notification:', error);
        }
    }

    /**
     * Decrypt private key (always use telegramId as password)
     */
    decryptPrivateKey(encryptedPrivateKey, telegramId) {
        if (!encryptedPrivateKey) throw new Error('No private key provided');
        const crypto = require('crypto');
        const [ivHex, encrypted] = encryptedPrivateKey.split(':');
        if (!ivHex || !encrypted) {
            throw new Error('Invalid encrypted data format');
        }
        const iv = Buffer.from(ivHex, 'hex');
        const key = crypto.scryptSync(telegramId.toString(), 'salt', 32);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted; // base64 string
    }

    /**
     * Add a specific token to monitoring after a manual buy
     */
    async addTokenToMonitoring(userId, tokenAddress, buyPrice, tokenAmount) {
        try {
            // --- Prevent monitoring of already sold tokens ---
            if (await this.isTokenSold(userId, tokenAddress)) {
                this.logger.info(`Token ${tokenAddress} already sold for user ${userId}, skipping monitoring.`);
                return;
            }
            // Get user's active manual management rules
            const rules = await this.db.getRulesByUserId(userId);
            const manualRules = rules.filter(rule => 
                rule.type === 'manual_management' && rule.is_active === 1);

            if (manualRules.length === 0) {
                this.logger.info(`No active manual management rules found for user ${userId}`);
                return;
            }

            // Use the first active manual management rule
            const rule = manualRules[0];
            const conditions = await this.db.getRuleConditions(rule.id);
            const manualConditions = this.parseManualConditions(conditions);

            if (!manualConditions) {
                this.logger.info(`No manual management conditions found for rule ${rule.id}`);
                return;
            }

            // Get user's active wallet
            const activeWallet = await this.db.getActiveWallet(userId);
            if (!activeWallet) {
                this.logger.error(`No active wallet found for user ${userId}`);
                return;
            }

            // Add token to monitoring
            this.monitoredTokens.set(tokenAddress, {
                userId,
                ruleId: rule.id,
                walletAddress: activeWallet.public_key,
                conditions: manualConditions,
                buyPrice,
                highestPrice: buyPrice,
                tokenAmount,
                lastChecked: Date.now()
            });

            this.logger.info(`Added token ${tokenAddress} to manual management monitoring for user ${userId}`);
            this.logger.info(`Monitoring conditions:`, manualConditions);

        } catch (error) {
            this.logger.error('Error adding token to monitoring:', error);
        }
    }

    /**
     * Remove token from monitoring (called when user manually sells)
     */
    removeTokenFromMonitoring(tokenAddress) {
        if (this.monitoredTokens.has(tokenAddress)) {
            this.monitoredTokens.delete(tokenAddress);
            this.logger.info(`Removed token ${tokenAddress} from manual management monitoring`);
        }
    }

    /**
     * Periodically check for new buy trades and add new tokens to monitoring
     */
    async checkForNewBuyTokens() {
        // Get all users with active wallets
        const users = await this.getAllUsers();
        const since = this.lastBuyCheck;
        this.lastBuyCheck = Date.now();
        for (const user of users) {
            // Get new buy trades since last check
            const stmt = this.db.db.prepare(`
                SELECT * FROM trades
                WHERE user_id = ? AND side = 'buy' AND timestamp > ?
            `);
            const newBuys = stmt.all(user.id, since);
            for (const trade of newBuys) {
                // Only add if not already monitored
                if (!this.monitoredTokens.has(trade.token_address)) {
                    // Get token amount from portfolio (fallback to trade.amount if needed)
                    let tokenAmount = trade.amount;
                    try {
                        const PortfolioService = require('./portfolioService');
                        const portfolioService = new PortfolioService(this.config);
                        const wallet = await this.db.getActiveWallet(user.id);
                        if (wallet) {
                            const balance = await portfolioService.getWalletBalance(wallet.public_key);
                            const token = balance.tokens.find(t => t.mint === trade.token_address);
                            if (token) tokenAmount = token.amount;
                        }
                    } catch (e) {
                        this.logger.warn('Could not get token amount from portfolio:', e);
                    }
                    await this.addTokenToMonitoring(user.id, trade.token_address, trade.price, tokenAmount);
                }
            }
        }
    }

    // --- Persistent Sold Token Tracking ---
    /**
     * Mark a token as sold for a user (persistent DB)
     */
    async markTokenAsSold(userId, tokenAddress) {
        try {
            const stmt = this.db.db.prepare(
                'INSERT OR REPLACE INTO sold_tokens (user_id, token_address, sold_at) VALUES (?, ?, ?)' 
            );
            stmt.run(userId, tokenAddress, Date.now());
            this.logger.info(`Marked token ${tokenAddress} as sold for user ${userId}`);
        } catch (error) {
            this.logger.error('Error marking token as sold:', error);
        }
    }

    /**
     * Check if a token is already sold for a user (persistent DB)
     */
    async isTokenSold(userId, tokenAddress) {
        try {
            const stmt = this.db.db.prepare(
                'SELECT 1 FROM sold_tokens WHERE user_id = ? AND token_address = ?'
            );
            return !!stmt.get(userId, tokenAddress);
        } catch (error) {
            this.logger.error('Error checking if token is sold:', error);
            return false;
        }
    }

    /**
     * Get monitoring status
     */
    getMonitoringStatus() {
        return {
            isMonitoring: this.isMonitoring,
            monitoredTokensCount: this.monitoredTokens.size,
            monitoredTokens: Array.from(this.monitoredTokens.keys())
        };
    }
}

module.exports = ManualManagementService;