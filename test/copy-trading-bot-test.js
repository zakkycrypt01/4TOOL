const CopyTradingBot = require('../src/modules/copyTradingBot');

// Test configuration
const testConfig = {
    heliusApiKey: 'demo-api-key', // Using demo key for testing
    copyTrading: {
        pollInterval: 5000 // 5 seconds for testing
    },
    // Add other required config properties
    rpcUrl: 'https://mainnet.helius-rpc.com/',
    wsUrl: 'wss://atlas-mainnet.helius-rpc.com/',
    solanaPrivateKey: process.env.SOLANA_PRIVATE_KEY || 'demo-key',
    jupiterApiUrl: 'https://quote-api.jup.ag/v6'
};

async function testCopyTradingBot() {
    console.log('🧪 Starting Copy Trading Bot Test');
    console.log('===================================\n');

    try {
        // Initialize the bot
        const bot = new CopyTradingBot(testConfig);
        console.log('✅ CopyTradingBot initialized successfully');

        // Test bot status
        console.log('\n📊 Initial Bot Status:');
        console.log(bot.getStatus());

        // Test wallet monitor creation
        console.log('\n🔍 Testing WalletTokenMonitor creation...');
        const testWalletAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'; // Example wallet
        const testUserId = 1;

        const monitor = bot.createWalletMonitor(testWalletAddress, testUserId);
        console.log('✅ WalletTokenMonitor created successfully');
        console.log(`   - Monitoring wallet: ${testWalletAddress}`);
        console.log(`   - For user ID: ${testUserId}`);

        // Test callback setup
        let callbackTriggered = false;
        monitor.onTokenPurchase = async (purchaseData) => {
            console.log('\n🎯 Token Purchase Callback Triggered!');
            console.log('Purchase Data:', purchaseData);
            callbackTriggered = true;
        };
        console.log('✅ Purchase callback configured');

        // Test monitoring methods
        console.log('\n🚀 Testing monitoring methods...');
        
        // Test polling (short duration for testing)
        console.log('   Starting polling...');
        monitor.startPolling(3000); // 3 second intervals
        console.log('   ✅ Polling started');

        // Test WebSocket monitoring
        console.log('   Starting WebSocket monitoring...');
        monitor.startWebSocketMonitoring();
        console.log('   ✅ WebSocket monitoring started');

        // Let it run for a short time
        console.log('\n⏱️  Running monitors for 15 seconds...');
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Test stopping individual monitor
        console.log('\n🛑 Stopping individual monitor...');
        monitor.stop();
        console.log('✅ Monitor stopped successfully');

        // Test the full bot workflow (without actually starting the main loop)
        console.log('\n🤖 Testing bot workflow methods...');
        
        // Mock database methods for testing
        bot.db = {
            getActiveStrategy: async (userId) => {
                console.log(`   📋 Mock: Getting active strategy for user ${userId}`);
                return { id: 1, name: 'Test Strategy', active: true };
            },
            getExternalWallets: async (userId) => {
                console.log(`   💰 Mock: Getting external wallets for user ${userId}`);
                return [
                    { 
                        id: 1, 
                        wallet_address: testWalletAddress, 
                        is_active: true,
                        label: 'Test Wallet'
                    }
                ];
            },
            getUserSettings: async (userId) => {
                console.log(`   ⚙️  Mock: Getting user settings for user ${userId}`);
                return {
                    auto_confirm_trades: true,
                    min_trade_amount: 100000, // Adjusted for SOL lamports (0.0001 SOL)
                    max_trade_amount: 10000000, // Adjusted for SOL lamports (0.01 SOL)
                    max_daily_trades: 10
                };
            },
            updateExternalWalletLastTrade: async (walletId) => {
                console.log(`   📝 Mock: Updating last trade time for wallet ${walletId}`);
            },
            createTrade: async (userId, tokenMint, amount, price, type) => {
                console.log(`   💾 Mock: Creating trade record - User: ${userId}, Token: ${tokenMint}, Amount: ${amount}, Type: ${type}`);
            }
        };

        // Mock BuyManager for testing
        bot.buyManager = {
            executeBuy: async (chatId, telegramId, amount, botInstance) => {
                console.log(`   🔄 Mock: Executing buy - User: ${telegramId}, Amount: ${amount}`);
                return {
                    success: true,
                    tokenPrice: 0.000001,
                    txHash: 'mock_transaction_hash_123',
                    amount: amount
                };
            }
        };

        // Test monitoring for user
        console.log('\n👤 Testing startMonitoringForUser...');
        await bot.startMonitoringForUser(testUserId);
        console.log('✅ User monitoring started');

        // Test token purchase handling
        console.log('\n💰 Testing handleTokenPurchase...');
        const mockPurchaseData = {
            walletAddress: testWalletAddress,
            tokenMint: 'So11111111111111111111111111111111111111112',
            amount: 1000000,
            signature: 'test_signature_123',
            timestamp: Math.floor(Date.now() / 1000),
            transaction: { test: true }
        };

        await bot.handleTokenPurchase(testUserId, mockPurchaseData);
        console.log('✅ Token purchase handling tested');

        // Test swap processing
        console.log('\n🔄 Testing processSwap...');
        const mockSwapData = {
            signature: 'test_swap_signature_456',
            timestamp: new Date(),
            tokenIn: 'So11111111111111111111111111111111111111112',
            tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            amountIn: 1000000,
            amountOut: 500000,
            dex: 'Jupiter'
        };

        const mockUserSettings = {
            auto_confirm_trades: true,
            min_trade_amount: 100000, // Adjusted for SOL lamports
            max_trade_amount: 10000000 // Adjusted for SOL lamports
        };

        await bot.processSwap(testUserId, mockSwapData, mockUserSettings);
        console.log('✅ Swap processing tested');

        // Test trade validation
        console.log('\n✅ Testing shouldExecuteTrade...');
        const shouldExecute = bot.shouldExecuteTrade(mockSwapData, mockUserSettings);
        console.log(`   Trade execution decision: ${shouldExecute}`);

        // Test amount calculation
        console.log('\n🧮 Testing calculateTradeAmount...');
        const tradeAmount = bot.calculateTradeAmount(mockSwapData, mockUserSettings);
        console.log(`   Calculated trade amount: ${tradeAmount}`);

        // Test final status
        console.log('\n📊 Final Bot Status:');
        const finalStatus = bot.getStatus();
        console.log(finalStatus);

        // Cleanup
        console.log('\n🧹 Cleaning up...');
        bot.stopAllMonitoring();
        console.log('✅ All monitoring stopped');

        console.log('\n🎉 All tests completed successfully!');
        console.log('===================================');

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Check if script is run directly
if (require.main === module) {
    testCopyTradingBot().catch(console.error);
}

module.exports = { testCopyTradingBot };
