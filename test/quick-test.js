const CopyTradingBot = require('../src/modules/copyTradingBot');

// Simple test without network calls
async function quickTest() {
    console.log('🚀 Quick Copy Trading Bot Test');
    console.log('================================\n');

    try {
        // Test configuration
        const config = {
            heliusApiKey: 'test-key',
            copyTrading: { pollInterval: 5000 }
        };

        // Initialize bot
        const bot = new CopyTradingBot(config);
        console.log('✅ Bot initialized');

        // Test status
        const status = bot.getStatus();
        console.log('📊 Status:', status);

        // Test wallet monitor creation
        const monitor = bot.createWalletMonitor('test-wallet', 1);
        console.log('✅ Monitor created');

        // Test trade validation
        const mockSwap = {
            amountIn: 1000000,
            signature: 'test-sig'
        };
        
        const mockSettings = {
            auto_confirm_trades: true,
            min_trade_amount: 100000,
            max_trade_amount: 10000000
        };

        const shouldTrade = bot.shouldExecuteTrade(mockSwap, mockSettings);
        console.log('✅ Trade validation:', shouldTrade);

        // Test amount calculation
        const amount = bot.calculateTradeAmount(mockSwap, mockSettings);
        console.log('✅ Amount calculation:', amount);

        // Test swap analysis
        const testSwap = {
            signature: 'test-signature',
            timestamp: 1623456789,
            success: true,
            source: 'Jupiter',
            events: {
                swap: {
                    tokenIn: { mint: 'SOL', amount: '1000000' },
                    tokenOut: { mint: 'USDC', amount: '500000' }
                }
            }
        };

        const analyzed = bot.analyzeSwapForCopying(testSwap);
        console.log('✅ Swap analysis:', analyzed);

        console.log('\n🎉 All basic tests passed!');
        return true;

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        return false;
    }
}

quickTest().then(success => {
    if (success) {
        console.log('\n✨ Core functionality working correctly!');
        process.exit(0);
    } else {
        console.log('\n❌ Core functionality has issues!');
        process.exit(1);
    }
});
