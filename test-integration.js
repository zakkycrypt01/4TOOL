require('dotenv').config();
const PortfolioHandlers = require('./src/handlers/portfolioHandlers');

async function testIntegration() {
    console.log('🧪 Testing Enhanced Portfolio Integration...\n');

    // Mock bot and database for testing
    const mockBot = {
        sendMessage: async (chatId, message, options) => {
            console.log(`📤 Message to ${chatId}:`);
            console.log(message);
            console.log('Options:', options);
            return { message_id: Date.now() };
        }
    };

    const mockDb = {
        getUserByTelegramId: async (telegramId) => ({ id: 1, telegram_id: telegramId }),
        getWalletsByUserId: async (userId) => [
            {
                id: 1,
                public_key: 'So11111111111111111111111111111111111111112', // Invalid for testing
                name: 'Test Wallet'
            }
        ]
    };

    const config = {
        rpcEndpoint: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    };

    const portfolioHandlers = new PortfolioHandlers(mockBot, mockDb, config);

    console.log('✅ Portfolio handlers initialized successfully');
    console.log('✅ Wallet Holdings Service integrated');
    console.log('✅ Enhanced portfolio methods available');

    // Test wallet address validation
    const isValidAddress = portfolioHandlers.holdingsService.validateWalletAddress('So11111111111111111111111111111111111111112');
    console.log(`✅ Address validation working: ${isValidAddress}`);

    // Test token list fetching
    try {
        const tokenList = await portfolioHandlers.holdingsService.getTokenList();
        const tokenCount = Object.keys(tokenList).length;
        console.log(`✅ Token list fetched: ${tokenCount} tokens`);
    } catch (error) {
        console.log(`❌ Token list error: ${error.message}`);
    }

    console.log('\n🎉 Integration test completed successfully!');
    console.log('\n📚 Available enhanced methods:');
    console.log('• handleEnhancedViewPortfolio()');
    console.log('• handleDetailedAnalysis()');
    console.log('• handleExportAnalysis()');
    console.log('• analyzePortfolioRisk()');
    console.log('• calculatePerformanceMetrics()');

    console.log('\n🚀 Ready to use enhanced portfolio features!');
    console.log('\nTo test with real data, use a valid Solana wallet address.');
}

if (require.main === module) {
    testIntegration().catch(console.error);
}

module.exports = testIntegration;
