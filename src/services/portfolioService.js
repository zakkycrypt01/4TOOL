const winston = require('winston');
const DatabaseManager = require('../modules/database');
const TokenDataService = require('./tokenDataService');
const TradingService = require('./tradingService');
const solanaWeb3 = require('@solana/web3.js');
const { Connection, PublicKey, LAMPORTS_PER_SOL, clusterApiUrl } = require('@solana/web3.js');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');

class PortfolioService {
    constructor(config) {
        this.config = config;
        this.db = new DatabaseManager();
        this.tokenDataService = new TokenDataService(config);
        this.tradingService = new TradingService(config);
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
    }

    async rebalancePortfolio(userId) {
        try {
            const allocations = await this.db.getPortfolioAllocations(userId);
            const currentHoldings = await this.getCurrentHoldings(userId);
            const totalValue = this.calculateTotalPortfolioValue(currentHoldings);
            
            const rebalanceActions = [];
            
            for (const allocation of allocations) {
                const currentValue = this.getCategoryValue(currentHoldings, allocation.category);
                const currentPercentage = (currentValue / totalValue) * 100;
                const targetValue = (totalValue * allocation.target_percentage) / 100;
                
                if (Math.abs(currentPercentage - allocation.target_percentage) > 5) { // 5% threshold
                    const difference = targetValue - currentValue;
                    if (difference > 0) {
                        // Need to buy more tokens in this category
                        const tokensToBuy = await this.findTokensToBuy(allocation.category, difference);
                        rebalanceActions.push({
                            type: 'BUY',
                            category: allocation.category,
                            tokens: tokensToBuy,
                            value: difference
                        });
                    } else {
                        // Need to sell tokens in this category
                        const tokensToSell = this.findTokensToSell(currentHoldings, allocation.category, Math.abs(difference));
                        rebalanceActions.push({
                            type: 'SELL',
                            category: allocation.category,
                            tokens: tokensToSell,
                            value: Math.abs(difference)
                        });
                    }
                }
            }
            
            // Execute rebalancing actions
            for (const action of rebalanceActions) {
                await this.executeRebalanceAction(userId, action);
            }
            
            await this.db.updateLastRebalance(userId);
            
            return {
                success: true,
                message: 'Portfolio rebalanced successfully',
                actions: rebalanceActions
            };
        } catch (error) {
            this.logger.error(`Error rebalancing portfolio: ${error.message}`);
            throw error;
        }
    }

    async executeMomentumStrategy(userId) {
        try {
            const userSettings = await this.db.getUserSettings(userId);
            const categories = await this.db.getPortfolioAllocations(userId);
            
            for (const category of categories) {
                const topTokens = await this.findTopPerformingTokens(category.category);
                const bottomTokens = await this.findBottomPerformingTokens(category.category);
                
                // Sell bottom performers
                for (const token of bottomTokens) {
                    await this.tradingService.executeTrade(userId, token.address, 'SELL', token.price);
                }
                
                // Buy top performers
                for (const token of topTokens) {
                    await this.tradingService.executeTrade(userId, token.address, 'BUY', token.price);
                }
            }
            
            return {
                success: true,
                message: 'Momentum strategy executed successfully'
            };
        } catch (error) {
            this.logger.error(`Error executing momentum strategy: ${error.message}`);
            throw error;
        }
    }

    async executeVolatilityStrategy(userId) {
        try {
            const userSettings = await this.db.getUserSettings(userId);
            const trackedTokens = await this.db.getTrackedTokens(userId);
            
            for (const token of trackedTokens) {
                const tokenData = await this.tokenDataService.getTokenData(token.token_address);
                const volatility = this.calculateVolatility(tokenData.priceHistory);
                
                if (volatility > userSettings.volatility_threshold) {
                    // Price is volatile, implement mean reversion strategy
                    const meanPrice = this.calculateMeanPrice(tokenData.priceHistory);
                    
                    if (tokenData.price > meanPrice * 1.1) { // 10% above mean
                        await this.tradingService.executeTrade(userId, token.token_address, 'SELL', tokenData.price);
                    } else if (tokenData.price < meanPrice * 0.9) { // 10% below mean
                        await this.tradingService.executeTrade(userId, token.token_address, 'BUY', tokenData.price);
                    }
                }
            }
            
            return {
                success: true,
                message: 'Volatility strategy executed successfully'
            };
        } catch (error) {
            this.logger.error(`Error executing volatility strategy: ${error.message}`);
            throw error;
        }
    }

    async executeNarrativeRotation(userId) {
        try {
            const trendingCategories = await this.analyzeTrendingCategories();
            const currentAllocations = await this.db.getPortfolioAllocations(userId);
            
            // Adjust allocations based on trending categories
            for (const category of currentAllocations) {
                const trendScore = trendingCategories[category.category] || 0;
                const newTargetPercentage = this.calculateNewTargetPercentage(category.target_percentage, trendScore);
                
                await this.db.updatePortfolioAllocation(userId, category.category, newTargetPercentage);
            }
            
            // Rebalance portfolio with new allocations
            await this.rebalancePortfolio(userId);
            
            return {
                success: true,
                message: 'Narrative rotation executed successfully',
                newAllocations: await this.db.getPortfolioAllocations(userId)
            };
        } catch (error) {
            this.logger.error(`Error executing narrative rotation: ${error.message}`);
            throw error;
        }
    }

    async executeSmartWalletCopyTrading(userId) {
        try {
        const externalWallets = await this.db.getExternalWallets(userId);
        const userSettings = await this.db.getUserSettings(userId);
        
        for (const wallet of externalWallets) {
            if (!wallet.is_active) continue;
            
            const recentTrades = await this.getRecentWalletTrades(wallet.wallet_address);
            
            for (const trade of recentTrades) {
                // Check if we should copy this trade
                if (this.shouldCopyTrade(trade, userSettings)) {
                    await this.tradingService.executeTrade(
                        userId,
                        trade.token_address,
                        trade.trade_type,
                        trade.price
                    );
                }
            }
            
            await this.db.updateExternalWalletLastTrade(wallet.id);
        }
        
        return {
            success: true,
            message: 'Smart wallet copy trading executed successfully'
        };
        } catch (error) {
            this.logger.error(`Error executing smart wallet copy trading: ${error.message}`);
            throw error;
        }
    }

    // Helper methods
    async getCurrentHoldings(userId) {
        const trackedTokens = await this.db.getTrackedTokens(userId);
        const holdings = [];
        
        for (const token of trackedTokens) {
            const tokenData = await this.tokenDataService.getTokenData(token.token_address);
            holdings.push({
                address: token.token_address,
                amount: token.amount,
                price: tokenData.price,
                category: tokenData.category
            });
        }
        
        return holdings;
    }

    calculateTotalPortfolioValue(holdings) {
        return holdings.reduce((total, holding) => total + (holding.amount * holding.price), 0);
    }

    getCategoryValue(holdings, category) {
        return holdings
            .filter(holding => holding.category === category)
            .reduce((total, holding) => total + (holding.amount * holding.price), 0);
    }

    async findTokensToBuy(category, value) {
        // Implement token discovery logic based on category and value
        // This would involve querying token data sources and applying filters
        return [];
    }

    findTokensToSell(holdings, category, value) {
        return holdings
            .filter(holding => holding.category === category)
            .sort((a, b) => b.price - a.price)
            .slice(0, Math.ceil(value / 1000)); // Assuming minimum $1000 per trade
    }

    async executeRebalanceAction(userId, action) {
        for (const token of action.tokens) {
            await this.tradingService.executeTrade(
                userId,
                token.address,
                action.type,
                token.price
            );
        }
    }

    calculateVolatility(priceHistory) {
        if (priceHistory.length < 2) return 0;
        
        const returns = [];
        for (let i = 1; i < priceHistory.length; i++) {
            returns.push((priceHistory[i] - priceHistory[i-1]) / priceHistory[i-1]);
        }
        
        const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
        const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
        
        return Math.sqrt(variance);
    }

    calculateMeanPrice(priceHistory) {
        return priceHistory.reduce((a, b) => a + b, 0) / priceHistory.length;
    }

    async analyzeTrendingCategories() {
        // Implement category trend analysis
        // This would involve analyzing social media, news, and market data
        return {};
    }

    calculateNewTargetPercentage(currentPercentage, trendScore) {
        // Implement target percentage adjustment logic based on trend score
        return currentPercentage;
    }

    async getRecentWalletTrades(walletAddress) {
        // Implement logic to fetch recent trades from a wallet
        return [];
    }

    shouldCopyTrade(trade, userSettings) {
        // Implement logic to determine if a trade should be copied
        // This would involve checking trade size, token type, etc.
        return true;
    }

    async getWalletBalance(walletAddress) {
        try {
            if (!walletAddress || typeof walletAddress !== 'string') {
                throw new Error('Invalid wallet address');
            }
            let publicKey;
            try {
                publicKey = new PublicKey(walletAddress);
            } catch (err) {
                this.logger.error('Invalid wallet address:', walletAddress);
                return { lamports: 0, sol: 0, tokens: [] };
            }
            const connection = new Connection(clusterApiUrl('mainnet-beta'));
            const balanceInLamports = await connection.getBalance(publicKey);
            const balanceInSol = balanceInLamports / LAMPORTS_PER_SOL;

            // Fetch SPL token balances
            let tokens = [];
            try {
                const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                    publicKey,
                    { programId: TOKEN_PROGRAM_ID }
                );
                for (const tokenAccount of tokenAccounts.value) {
                    const info = tokenAccount.account.data.parsed.info;
                    if (parseFloat(info.tokenAmount.uiAmount) > 0) {
                        tokens.push({
                            mint: info.mint,
                            address: tokenAccount.pubkey.toString(),
                            amount: info.tokenAmount.uiAmount,
                            decimals: info.tokenAmount.decimals,
                            rawAmount: info.tokenAmount.amount
                        });
                    }
                }
            } catch (err) {
                this.logger.error('Error fetching SPL token balances:', err);
            }
            return {
                lamports: balanceInLamports,
                sol: balanceInSol,
                tokens
            };
        } catch (error) {
            this.logger.error('Error fetching wallet balance:', error);
            return { lamports: 0, sol: 0, tokens: [] };
        }
    }
}

module.exports = PortfolioService;