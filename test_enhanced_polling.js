const Database = require('./src/modules/database');
const ManualManagementService = require('./src/services/manualManagementService');

async function testEnhancedPolling() {
    const db = new Database();
    const logger = console;
    
    // Mock config
    const mockConfig = {
        solana: {
            connection: null // We won't use actual connection
        }
    };
    
    // Mock services
    const mockPortfolioService = {
        getUserPortfolio: async (userId) => {
            return [
                {
                    mint: 'So11111111111111111111111111111111111111112', // SOL
                    symbol: 'SOL',
                    amount: 1.5,
                    price: 95.50
                },
                {
                    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                    symbol: 'USDC', 
                    amount: 100.0,
                    price: 1.0
                }
            ];
        }
    };

    const mockTokenDataService = {
        getTokenPrice: async (tokenAddress) => {
            // Return mock prices
            const prices = {
                'So11111111111111111111111111111111111111112': 95.50,
                'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 1.0
            };
            return prices[tokenAddress] || Math.random() * 100;
        }
    };

    const mockTradingExecution = {
        sell: async (params) => {
            logger.info(`Mock sell executed: ${params.tokenAddress} amount: ${params.amount}`);
            return { success: true, signature: 'mock_signature' };
        }
    };

    const mockTelegramBot = {
        sendMessage: async (chatId, message) => {
            logger.info(`Telegram: ${message}`);
        }
    };

    const service = new ManualManagementService(
        mockConfig,
        db,
        mockTradingExecution, 
        mockTelegramBot
    );

    // Mock the services that are injected in the main app
    service.portfolioService = mockPortfolioService;
    service.tokenDataService = mockTokenDataService;

    try {
        console.log('=== Testing Enhanced Polling System ===\n');

        // Test rule loading (no initialization needed)
        await service.loadActiveManualManagementRules(); // This doesn't return rules, just loads them into monitoring
        console.log(`✅ Manual management rules loaded and tokens added to monitoring\n`);

        // Get count of currently monitored tokens
        console.log(`Current monitored tokens: ${service.monitoredTokens.size}`);
        
        if (service.monitoredTokens.size > 0) {
            console.log('\nInitially monitored tokens:');
            for (const [tokenKey, tokenData] of service.monitoredTokens.entries()) {
                console.log(`  ${tokenKey}: ${tokenData.symbol || 'UNKNOWN'} - Buy: $${tokenData.buyPrice || 'N/A'}, Amount: ${tokenData.tokenAmount || 'N/A'}`);
            }
        }
        console.log();

        // Test token discovery
        console.log('Testing token discovery...');
        await service.checkForNewBuyTokens();
        console.log(`✅ Token discovery completed\n`);

        // Show current monitoring state
        console.log(`Current monitored tokens: ${service.monitoredTokens.size}`);
        
        if (service.monitoredTokens.size > 0) {
            console.log('\nMonitored tokens:');
            for (const [tokenKey, tokenData] of service.monitoredTokens.entries()) {
                console.log(`  ${tokenKey}: ${tokenData.symbol || 'UNKNOWN'} - Buy: $${tokenData.buyPrice}, Amount: ${tokenData.tokenAmount}`);
            }
        }

        console.log('\n=== Enhanced Polling Test Complete ===');

    } catch (error) {
        console.error('Error during enhanced polling test:', error);
    } finally {
        // Database cleanup is handled automatically
        console.log('Test cleanup completed');
    }
}

if (require.main === module) {
    testEnhancedPolling();
}

module.exports = testEnhancedPolling;
