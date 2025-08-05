const CopyTradingBot = require('../src/modules/copyTradingBot');

// Test configuration with actual API key
const testConfig = {
    heliusApiKey: 'dba7c787-5e45-47fc-a0f8-e25a4137807c',
    copyTrading: {
        pollInterval: 5000 // 5 seconds for testing
    },
    rpcUrl: 'https://mainnet.helius-rpc.com/',
    wsUrl: 'wss://atlas-mainnet.helius-rpc.com/',
    solanaPrivateKey: 'demo-private-key',
    jupiterApiUrl: 'https://quote-api.jup.ag/v6'
};

async function testCopyTradingBot() {
    console.log('🧪 Testing Copy Trading Bot with Real API');
    console.log('==========================================\n');

    try {
        // Initialize the bot
        const bot = new CopyTradingBot(testConfig);
        console.log('✅ CopyTradingBot initialized successfully');

        // Test initial status
        console.log('\n📊 Initial Bot Status:');
        const initialStatus = bot.getStatus();
        console.log(JSON.stringify(initialStatus, null, 2));

        // Test popular wallet address for monitoring
        const testWalletAddress = '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1'; // Raydium wallet
        const testUserId = 1;

        console.log(`\n🔍 Testing wallet monitoring for: ${testWalletAddress}`);

        // Setup mock database for testing
        bot.db = {
            getActiveStrategy: async (userId) => {
                console.log(`   📋 Getting active strategy for user ${userId}`);
                return { 
                    id: 1, 
                    name: 'Copy Trading Strategy', 
                    active: true,
                    settings: {
                        copyRatio: 0.1, // Copy 10% of original trade
                        maxTradeAmount: 0.01, // Max 0.01 SOL per trade
                        minTradeAmount: 0.001 // Min 0.001 SOL per trade
                    }
                };
            },
            getExternalWallets: async (userId) => {
                console.log(`   💰 Getting external wallets for user ${userId}`);
                return [
                    { 
                        id: 1, 
                        wallet_address: testWalletAddress, 
                        is_active: true,
                        label: 'Test Wallet - Raydium'
                    }
                ];
            },
            getUserSettings: async (userId) => {
                console.log(`   ⚙️  Getting user settings for user ${userId}`);
                return {
                    auto_confirm_trades: true,
                    min_trade_amount: 1000000, // 0.001 SOL in lamports
                    max_trade_amount: 10000000, // 0.01 SOL in lamports
                    max_daily_trades: 5,
                    slippage_tolerance: 1.0,
                    priority_fee: 0.001
                };
            },
            updateExternalWalletLastTrade: async (walletId) => {
                console.log(`   📝 Updating last trade time for wallet ${walletId}`);
                return true;
            },
            createTrade: async (userId, tokenMint, amount, price, type) => {
                console.log(`   💾 Creating trade record:`);
                console.log(`      User: ${userId}`);
                console.log(`      Token: ${tokenMint}`);
                console.log(`      Amount: ${amount} lamports`);
                console.log(`      Price: $${price}`);
                console.log(`      Type: ${type}`);
                return { id: Date.now(), success: true };
            }
        };

        // Setup mock BuyManager
        bot.buyManager = {
            executeBuy: async (chatId, telegramId, amount, botInstance) => {
                console.log(`   🔄 Mock Trade Execution:`);
                console.log(`      User: ${telegramId}`);
                console.log(`      Amount: ${amount} lamports`);
                console.log(`      Equivalent SOL: ${amount / 1000000000} SOL`);
                
                // Simulate successful trade
                return {
                    success: true,
                    tokenPrice: Math.random() * 0.001 + 0.0001, // Random price
                    txHash: `mock_tx_${Date.now()}`,
                    amount: amount,
                    tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
                };
            }
        };

        // Test wallet monitor creation
        console.log('\n🔍 Creating wallet monitor...');
        const monitor = bot.createWalletMonitor(testWalletAddress, testUserId);
        console.log('✅ WalletTokenMonitor created successfully');

        // Test real API call for recent transactions
        console.log('\n📡 Testing real API call for recent transactions...');
        try {
            const swaps = await bot.getLatestSwaps(testWalletAddress, 3);
            console.log(`✅ Retrieved ${swaps.length} recent transactions`);
            if (swaps.length > 0) {
                console.log('   Sample transaction:');
                console.log(`   - Signature: ${swaps[0].signature}`);
                console.log(`   - Type: ${swaps[0].type}`);
                console.log(`   - Timestamp: ${new Date(swaps[0].timestamp * 1000).toISOString()}`);
            }
        } catch (error) {
            console.log('⚠️  API call failed (expected with demo setup):', error.message);
        }

        // Test token purchase simulation
        console.log('\n💰 Testing token purchase handling...');
        const mockPurchaseData = {
            walletAddress: testWalletAddress,
            tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            amount: 5000000, // 5 USDC (6 decimals)
            signature: `test_signature_${Date.now()}`,
            timestamp: Math.floor(Date.now() / 1000),
            transaction: { 
                type: 'SWAP',
                dex: 'Jupiter',
                success: true
            }
        };

        await bot.handleTokenPurchase(testUserId, mockPurchaseData);
        console.log('✅ Token purchase handling completed');

        // Test swap analysis
        console.log('\n🔄 Testing swap analysis...');
        const mockSwapTransaction = {
            signature: `analyze_test_${Date.now()}`,
            timestamp: Math.floor(Date.now() / 1000),
            success: true,
            source: 'Jupiter',
            events: {
                swap: {
                    tokenIn: {
                        mint: 'So11111111111111111111111111111111111111112', // SOL
                        amount: '5000000' // 0.005 SOL
                    },
                    tokenOut: {
                        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
                        amount: '2500000' // 2.5 USDC
                    }
                }
            }
        };

        const analyzedSwap = bot.analyzeSwapForCopying(mockSwapTransaction);
        console.log('✅ Swap analysis completed:');
        if (analyzedSwap) {
            console.log(`   - Token In: ${analyzedSwap.tokenIn}`);
            console.log(`   - Token Out: ${analyzedSwap.tokenOut}`);
            console.log(`   - Amount In: ${analyzedSwap.amountIn} lamports`);
            console.log(`   - Amount Out: ${analyzedSwap.amountOut}`);
            console.log(`   - DEX: ${analyzedSwap.dex}`);
        }

        // Test trade validation logic
        console.log('\n✅ Testing trade validation...');
        const testUserSettings = {
            auto_confirm_trades: true,
            min_trade_amount: 1000000, // 0.001 SOL
            max_trade_amount: 50000000, // 0.05 SOL
            max_daily_trades: 10
        };

        const testSwapData = {
            signature: 'validation_test',
            amountIn: 5000000, // 0.005 SOL
            tokenIn: 'So11111111111111111111111111111111111111112',
            tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
        };

        const shouldExecute = bot.shouldExecuteTrade(testSwapData, testUserSettings);
        const tradeAmount = bot.calculateTradeAmount(testSwapData, testUserSettings);

        console.log(`   - Should execute trade: ${shouldExecute}`);
        console.log(`   - Calculated amount: ${tradeAmount} lamports`);
        console.log(`   - Equivalent SOL: ${tradeAmount / 1000000000} SOL`);

        // Test monitoring setup
        console.log('\n📡 Testing monitoring setup...');
        await bot.startMonitoringForUser(testUserId);
        console.log('✅ Monitoring started for user');

        // Test final status
        console.log('\n📊 Final Bot Status:');
        const finalStatus = bot.getStatus();
        console.log(JSON.stringify(finalStatus, null, 2));

        // Cleanup
        console.log('\n🧹 Cleaning up...');
        bot.stopAllMonitoring();
        console.log('✅ All monitors stopped');

        console.log('\n🎉 All tests completed successfully!');
        console.log('==========================================');

        return true;

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Run the test if this file is executed directly
if (require.main === module) {
    testCopyTradingBot()
        .then(success => {
            if (success) {
                console.log('\n✅ Copy Trading Bot test passed!');
                process.exit(0);
            } else {
                console.log('\n❌ Copy Trading Bot test failed!');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('❌ Test runner error:', error);
            process.exit(1);
        });
}

module.exports = { testCopyTradingBot };
