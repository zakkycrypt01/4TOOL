#!/usr/bin/env node

const HeliusWalletService = require('./src/services/heliusWalletService');
const readline = require('readline');

class WalletCLI {
    constructor() {
        this.walletService = new HeliusWalletService({
            apiKey: process.env.HELIUS_API_KEY || '35d3d141-6c2d-46ac-956a-b9748f91d6ca'
        });
        
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async start() {
        console.log('🚀 Helius Wallet Service CLI');
        console.log('================================\n');
        
        // Check if wallet address is provided as command line argument
        const args = process.argv.slice(2);
        if (args.length > 0) {
            await this.processWalletAddress(args[0]);
            this.rl.close();
            return;
        }

        // Interactive mode
        await this.showMenu();
    }

    async showMenu() {
        console.log('Available commands:');
        console.log('1. Query wallet assets');
        console.log('2. Get fungible tokens only');
        console.log('3. Get native SOL balance');
        console.log('4. Get comprehensive summary');
        console.log('5. Clear cache');
        console.log('6. Show cache stats');
        console.log('7. Exit');
        console.log('');

        this.rl.question('Enter your choice (1-7): ', async (choice) => {
            switch (choice.trim()) {
                case '1':
                    await this.queryWalletAssets();
                    break;
                case '2':
                    await this.queryFungibleTokens();
                    break;
                case '3':
                    await this.queryNativeBalance();
                    break;
                case '4':
                    await this.queryWalletSummary();
                    break;
                case '5':
                    await this.clearCache();
                    break;
                case '6':
                    await this.showCacheStats();
                    break;
                case '7':
                    console.log('👋 Goodbye!');
                    this.rl.close();
                    return;
                default:
                    console.log('❌ Invalid choice. Please try again.\n');
                    await this.showMenu();
                    return;
            }
            
            // Show menu again after operation
            await this.showMenu();
        });
    }

    async queryWalletAssets() {
        this.rl.question('Enter wallet address: ', async (address) => {
            try {
                console.log('\n🔍 Fetching wallet assets...');
                const assets = await this.walletService.getWalletAssets(address.trim());
                
                console.log(`\n📊 Wallet Assets for ${address}:`);
                console.log(`Total items: ${assets.totalItems}`);
                console.log(`Native SOL: ${assets.nativeBalance / 1e9} SOL`);
                console.log(`Timestamp: ${assets.timestamp}\n`);
                
                if (assets.items.length > 0) {
                    console.log('Items:');
                    assets.items.slice(0, 10).forEach((item, index) => {
                        const name = item.content?.metadata?.name || 'Unknown';
                        const symbol = item.content?.metadata?.symbol || 'N/A';
                        const interface = item.interface || 'Unknown';
                        console.log(`  ${index + 1}. ${name} (${symbol}) - ${interface}`);
                    });
                    
                    if (assets.items.length > 10) {
                        console.log(`  ... and ${assets.items.length - 10} more items`);
                    }
                }
                
            } catch (error) {
                console.error(`❌ Error: ${error.message}`);
            }
            console.log('');
        });
    }

    async queryFungibleTokens() {
        this.rl.question('Enter wallet address: ', async (address) => {
            try {
                console.log('\n🪙 Fetching fungible tokens...');
                const tokens = await this.walletService.getFungibleTokens(address.trim());
                
                console.log(`\n📊 Fungible Tokens for ${address}:`);
                console.log(`Total tokens: ${tokens.totalTokens}`);
                console.log(`Timestamp: ${tokens.timestamp}\n`);
                
                if (tokens.fungibleTokens.length > 0) {
                    console.log('Tokens:');
                    tokens.fungibleTokens.forEach((token, index) => {
                        const name = token.content?.metadata?.name || 'Unknown';
                        const symbol = token.content?.metadata?.symbol || 'N/A';
                        const balance = token.token_info?.balance_info?.current_balance || 0;
                        const decimals = token.token_info?.decimals || 0;
                        const actualBalance = balance / Math.pow(10, decimals);
                        console.log(`  ${index + 1}. ${name} (${symbol}) - Balance: ${actualBalance}`);
                    });
                }
                
            } catch (error) {
                console.error(`❌ Error: ${error.message}`);
            }
            console.log('');
        });
    }

    async queryNativeBalance() {
        this.rl.question('Enter wallet address: ', async (address) => {
            try {
                console.log('\n💰 Fetching native SOL balance...');
                const balance = await this.walletService.getNativeBalance(address.trim());
                
                console.log(`\n📊 Native Balance for ${address}:`);
                console.log(`SOL Balance: ${balance.nativeBalance / 1e9} SOL`);
                console.log(`Timestamp: ${balance.timestamp}\n`);
                
            } catch (error) {
                console.error(`❌ Error: ${error.message}`);
            }
            console.log('');
        });
    }

    async queryWalletSummary() {
        this.rl.question('Enter wallet address: ', async (address) => {
            try {
                console.log('\n📋 Fetching comprehensive wallet summary...');
                const summary = await this.walletService.getWalletSummary(address.trim());
                
                console.log(`\n📊 Wallet Summary for ${address}:`);
                console.log(`Native SOL: ${summary.summary.nativeBalance / 1e9} SOL`);
                console.log(`Fungible Tokens: ${summary.summary.fungibleTokenCount}`);
                console.log(`Estimated Total Value: $${summary.summary.totalEstimatedValue.toFixed(2)}`);
                console.log(`Last Updated: ${summary.summary.lastUpdated}\n`);
                
            } catch (error) {
                console.error(`❌ Error: ${error.message}`);
            }
            console.log('');
        });
    }

    async clearCache() {
        this.rl.question('Enter wallet address to clear cache for (or press Enter to clear all): ', async (address) => {
            try {
                if (address.trim()) {
                    this.walletService.clearCache(address.trim());
                    console.log(`✅ Cache cleared for wallet: ${address.trim()}`);
                } else {
                    this.walletService.clearCache();
                    console.log('✅ All cache cleared');
                }
            } catch (error) {
                console.error(`❌ Error: ${error.message}`);
            }
            console.log('');
        });
    }

    async showCacheStats() {
        try {
            const stats = this.walletService.getCacheStats();
            console.log('\n📈 Cache Statistics:');
            console.log(`Total entries: ${stats.totalEntries}`);
            console.log(`Cache expiry: ${stats.cacheExpiry / 1000} seconds`);
            console.log(`Timestamp: ${stats.timestamp}\n`);
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
        }
    }

    async processWalletAddress(address) {
        try {
            console.log(`🔍 Processing wallet: ${address}\n`);
            
            // Get comprehensive summary
            const summary = await this.walletService.getWalletSummary(address);
            
            console.log('📊 Wallet Summary:');
            console.log(`Owner: ${summary.ownerAddress}`);
            console.log(`Native SOL: ${summary.summary.nativeBalance / 1e9} SOL`);
            console.log(`Fungible Tokens: ${summary.summary.fungibleTokenCount}`);
            console.log(`Estimated Total Value: $${summary.summary.totalEstimatedValue.toFixed(2)}`);
            console.log(`Last Updated: ${summary.summary.lastUpdated}\n`);
            
            // Show sample tokens if any
            if (summary.details.fungibleTokens.fungibleTokens.length > 0) {
                console.log('🪙 Sample Fungible Tokens:');
                summary.details.fungibleTokens.fungibleTokens.slice(0, 5).forEach((token, index) => {
                    const name = token.content?.metadata?.name || 'Unknown';
                    const symbol = token.content?.metadata?.symbol || 'N/A';
                    const balance = token.token_info?.balance_info?.current_balance || 0;
                    const decimals = token.token_info?.decimals || 0;
                    const actualBalance = balance / Math.pow(10, decimals);
                    console.log(`  ${index + 1}. ${name} (${symbol}) - Balance: ${actualBalance}`);
                });
                
                if (summary.details.fungibleTokens.fungibleTokens.length > 5) {
                    console.log(`  ... and ${summary.details.fungibleTokens.fungibleTokens.length - 5} more tokens`);
                }
            }
            
        } catch (error) {
            console.error(`❌ Error: ${error.message}`);
            process.exit(1);
        }
    }
}

// Run CLI if this file is executed directly
if (require.main === module) {
    const cli = new WalletCLI();
    cli.start().catch(console.error);
}

module.exports = WalletCLI; 