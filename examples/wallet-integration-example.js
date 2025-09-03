/**
 * Example integration of HeliusWalletService into your trading bot
 * This file demonstrates how to use the wallet service in various scenarios
 */

const HeliusWalletService = require('../src/services/heliusWalletService');

class WalletIntegrationExample {
    constructor() {
        // Initialize the wallet service
        this.walletService = new HeliusWalletService({
            apiKey: process.env.HELIUS_API_KEY || '35d3d141-6c2d-46ac-956a-b9748f91d6ca'
        });
        
        // Example wallet addresses
        this.wallets = [
            'oQPnhXAbLbMuKHESaGrbXT17CyvWCpLyERSJA9HCYd7',
            // Add more wallet addresses as needed
        ];
    }

    /**
     * Example: Monitor multiple wallets for trading opportunities
     */
    async monitorWalletsForTrading() {
        console.log('🔍 Monitoring wallets for trading opportunities...\n');
        
        for (const walletAddress of this.wallets) {
            try {
                const summary = await this.walletService.getWalletSummary(walletAddress);
                
                console.log(`📊 Wallet: ${walletAddress}`);
                console.log(`  SOL Balance: ${summary.summary.nativeBalance / 1e9} SOL`);
                console.log(`  Token Count: ${summary.summary.fungibleTokenCount}`);
                console.log(`  Estimated Value: $${summary.summary.totalEstimatedValue.toFixed(2)}`);
                
                // Example trading logic based on wallet state
                if (summary.summary.nativeBalance > 1e9) { // More than 1 SOL
                    console.log('  💡 High SOL balance - potential for trading');
                }
                
                if (summary.summary.fungibleTokenCount > 5) {
                    console.log('  💡 High token diversity - potential for arbitrage');
                }
                
                console.log('');
                
            } catch (error) {
                console.error(`❌ Error monitoring wallet ${walletAddress}:`, error.message);
            }
        }
    }

    /**
     * Example: Check if wallet has sufficient balance for a trade
     */
    async checkTradeReadiness(walletAddress, requiredSOL = 0.1) {
        try {
            const nativeBalance = await this.walletService.getNativeBalance(walletAddress);
            const solBalance = nativeBalance.nativeBalance / 1e9;
            
            const isReady = solBalance >= requiredSOL;
            
            console.log(`💰 Trade Readiness Check for ${walletAddress}:`);
            console.log(`  Current SOL: ${solBalance.toFixed(4)} SOL`);
            console.log(`  Required SOL: ${requiredSOL} SOL`);
            console.log(`  Ready to trade: ${isReady ? '✅ Yes' : '❌ No'}\n`);
            
            return isReady;
            
        } catch (error) {
            console.error(`❌ Error checking trade readiness:`, error.message);
            return false;
        }
    }

    /**
     * Example: Analyze token portfolio for rebalancing
     */
    async analyzePortfolioForRebalancing(walletAddress) {
        try {
            const fungibleTokens = await this.walletService.getFungibleTokens(walletAddress);
            
            console.log(`📊 Portfolio Analysis for ${walletAddress}:`);
            console.log(`  Total tokens: ${fungibleTokens.totalTokens}\n`);
            
            if (fungibleTokens.fungibleTokens.length === 0) {
                console.log('  No fungible tokens found');
                return;
            }
            
            // Group tokens by balance
            const highBalanceTokens = [];
            const lowBalanceTokens = [];
            
            fungibleTokens.fungibleTokens.forEach(token => {
                const balance = token.token_info?.balance_info?.current_balance || 0;
                const decimals = token.token_info?.decimals || 0;
                const actualBalance = balance / Math.pow(10, decimals);
                
                const tokenInfo = {
                    name: token.content?.metadata?.name || 'Unknown',
                    symbol: token.content?.metadata?.symbol || 'N/A',
                    balance: actualBalance,
                    address: token.id
                };
                
                if (actualBalance > 1000) { // Arbitrary threshold
                    highBalanceTokens.push(tokenInfo);
                } else if (actualBalance < 10) {
                    lowBalanceTokens.push(tokenInfo);
                }
            });
            
            // Display analysis
            if (highBalanceTokens.length > 0) {
                console.log('  🟢 High Balance Tokens (potential for selling):');
                highBalanceTokens.forEach(token => {
                    console.log(`    - ${token.name} (${token.symbol}): ${token.balance.toFixed(2)}`);
                });
            }
            
            if (lowBalanceTokens.length > 0) {
                console.log('  🟡 Low Balance Tokens (potential for buying):');
                lowBalanceTokens.forEach(token => {
                    console.log(`    - ${token.name} (${token.symbol}): ${token.balance.toFixed(2)}`);
                });
            }
            
            console.log('');
            
        } catch (error) {
            console.error(`❌ Error analyzing portfolio:`, error.message);
        }
    }

    /**
     * Example: Batch wallet operations for efficiency
     */
    async batchWalletOperations() {
        console.log('⚡ Performing batch wallet operations...\n');
        
        try {
            // Perform multiple operations in parallel
            const operations = this.wallets.map(async (walletAddress) => {
                const [summary, fungibleTokens] = await Promise.all([
                    this.walletService.getWalletSummary(walletAddress),
                    this.walletService.getFungibleTokens(walletAddress)
                ]);
                
                return {
                    address: walletAddress,
                    summary,
                    fungibleTokens
                };
            });
            
            const results = await Promise.all(operations);
            
            // Process results
            results.forEach(result => {
                console.log(`📊 ${result.address}:`);
                console.log(`  SOL: ${result.summary.summary.nativeBalance / 1e9} SOL`);
                console.log(`  Tokens: ${result.summary.summary.fungibleTokenCount}`);
                console.log(`  Value: $${result.summary.summary.totalEstimatedValue.toFixed(2)}`);
                console.log('');
            });
            
        } catch (error) {
            console.error('❌ Error in batch operations:', error.message);
        }
    }

    /**
     * Example: Cache management for performance
     */
    async demonstrateCacheManagement() {
        console.log('🗄️ Demonstrating cache management...\n');
        
        // Show initial cache stats
        let stats = this.walletService.getCacheStats();
        console.log('Initial cache stats:', stats);
        
        // Query a wallet (this will populate cache)
        await this.walletService.getWalletSummary(this.wallets[0]);
        
        // Show updated cache stats
        stats = this.walletService.getCacheStats();
        console.log('After query cache stats:', stats);
        
        // Clear cache for specific wallet
        this.walletService.clearCache(this.wallets[0]);
        console.log(`Cleared cache for wallet: ${this.wallets[0]}`);
        
        // Show final cache stats
        stats = this.walletService.getCacheStats();
        console.log('Final cache stats:', stats);
        console.log('');
    }

    /**
     * Run all examples
     */
    async runAllExamples() {
        console.log('🚀 Running Helius Wallet Service Integration Examples\n');
        console.log('=' .repeat(60) + '\n');
        
        await this.monitorWalletsForTrading();
        await this.checkTradeReadiness(this.wallets[0], 0.5);
        await this.analyzePortfolioForRebalancing(this.wallets[0]);
        await this.batchWalletOperations();
        await this.demonstrateCacheManagement();
        
        console.log('✅ All examples completed successfully!');
    }
}

// Run examples if this file is executed directly
if (require.main === module) {
    const example = new WalletIntegrationExample();
    example.runAllExamples().catch(console.error);
}

module.exports = WalletIntegrationExample; 