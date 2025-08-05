const CopyTradingBot = require('../src/modules/copyTradingBot');

// Mock fetch to avoid network calls during testing
global.fetch = async (url, options) => {
    console.log(`📡 Mock fetch called: ${url}`);
    
    // Mock different responses based on URL
    if (url.includes('transactions')) {
        return {
            json: async () => ([
                {
                    signature: 'mock_signature_123',
                    timestamp: Math.floor(Date.now() / 1000),
                    type: 'SWAP',
                    success: true,
                    events: {
                        swap: {
                            tokenOutputs: [{
                                userAccount: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
                                mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                                tokenAmount: 1000000
                            }]
                        }
                    }
                }
            ])
        };
    }
    
    if (url.includes('getAsset')) {
        return {
            json: async () => ({
                result: {
                    token_info: {
                        symbol: 'USDC',
                        name: 'USD Coin',
                        decimals: 6,
                        price_info: {
                            price_per_token: 1.0
                        }
                    }
                }
            })
        };
    }
    
    return { json: async () => ({}) };
};

// Test configuration
const testConfig = {
    heliusApiKey: 'dba7c787-5e45-47fc-a0f8-e25a4137807c',
    copyTrading: {
        pollInterval: 2000 // 2 seconds for testing
    },
    rpcUrl: 'https://mainnet.helius-rpc.com/',
    wsUrl: 'wss://atlas-mainnet.helius-rpc.com/',
    solanaPrivateKey: 'demo-key',
    jupiterApiUrl: 'https://quote-api.jup.ag/v6'
};

async function testCopyTradingBotCore() {
    console.log('🧪 Starting Copy Trading Bot Core Test (No Network Calls)');
    console.log('========================================================\n');

    try {
        // Initialize the bot
        const bot = new CopyTradingBot(testConfig);
        console.log('✅ CopyTradingBot initialized successfully');

        // Test initial status
        console.log('\n📊 Initial Bot Status:');
        console.log(bot.getStatus());

        // Test wallet monitor creation
        console.log('\n🔍 Testing WalletTokenMonitor creation...');
        const testWalletAddress = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';
        const testUserId = 1;

        const monitor = bot.createWalletMonitor(testWalletAddress, testUserId);
        console.log('✅ WalletTokenMonitor created successfully');

        // Setup mock database
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
                    min_trade_amount: 100000, // 0.0001 SOL in lamports
                    max_trade_amount: 10000000, // 0.01 SOL in lamports
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

        // Setup mock BuyManager
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

        // Test token purchase handling
        console.log('\n💰 Testing handleTokenPurchase...');
        const mockPurchaseData = {
            walletAddress: testWalletAddress,
            tokenMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            amount: 1000000, // 1 USDC (6 decimals)
            signature: 'test_signature_123',
            timestamp: Math.floor(Date.now() / 1000),
            transaction: { test: true }
        };

        await bot.handleTokenPurchase(testUserId, mockPurchaseData);
        console.log('✅ Token purchase handling tested');

        // Test swap processing with proper amounts
        console.log('\n🔄 Testing processSwap...');
        const mockSwapData = {
            signature: 'test_swap_signature_456',
            timestamp: new Date(),
            tokenIn: 'So11111111111111111111111111111111111111112', // SOL
            tokenOut: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
            amountIn: 1000000, // 0.001 SOL in lamports
            amountOut: 500000, // 0.5 USDC
            dex: 'Jupiter'
        };

        const mockUserSettings = {
            auto_confirm_trades: true,
            min_trade_amount: 100000, // 0.0001 SOL in lamports
            max_trade_amount: 10000000 // 0.01 SOL in lamports
        };

        await bot.processSwap(testUserId, mockSwapData, mockUserSettings);
        console.log('✅ Swap processing tested');

        // Test trade validation
        console.log('\n✅ Testing shouldExecuteTrade...');
        const shouldExecute = bot.shouldExecuteTrade(mockSwapData, mockUserSettings);
        console.log(`   Trade execution decision: ${shouldExecute}`);
        console.log(`   Amount in: ${mockSwapData.amountIn} lamports`);
        console.log(`   Min required: ${mockUserSettings.min_trade_amount} lamports`);
        console.log(`   Max allowed: ${mockUserSettings.max_trade_amount} lamports`);

        // Test amount calculation
        console.log('\n🧮 Testing calculateTradeAmount...');
        const tradeAmount = bot.calculateTradeAmount(mockSwapData, mockUserSettings);
        console.log(`   Calculated trade amount: ${tradeAmount} lamports`);

        // Test monitoring workflow (without network calls)
        console.log('\n🔍 Testing polling with mock data...');
        monitor.startPolling(1000); // 1 second for quick test
        
        // Let it run briefly to see mock data processing
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        monitor.stopPolling();
        console.log('✅ Polling test completed');

        // Test analyzeSwapForCopying
        console.log('\n🔄 Testing analyzeSwapForCopying...');
        const mockSwapTransaction = {
            signature: 'test_analyze_signature',
            timestamp: Math.floor(Date.now() / 1000),
            success: true,
            source: 'Jupiter',
            events: {
                swap: {
                    tokenIn: {
                        mint: 'So11111111111111111111111111111111111111112',
                        amount: '1000000'
                    },
                    tokenOut: {
                        mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
                        amount: '500000'
                    }
                }
            }
        };

        const analyzedSwap = bot.analyzeSwapForCopying(mockSwapTransaction);
        console.log('   Analyzed swap data:', analyzedSwap);
        console.log('✅ Swap analysis tested');

        // Test final status
        console.log('\n📊 Final Bot Status:');
        const finalStatus = bot.getStatus();
        console.log(finalStatus);

        console.log('\n🎉 All core tests completed successfully!');
        console.log('========================================================');

        return true;

    } catch (error) {
        console.error('❌ Test failed:', error);
        console.error('Stack trace:', error.stack);
        return false;
    }
}

// Run the test
if (require.main === module) {
    testCopyTradingBotCore()
        .then(success => {
            if (success) {
                console.log('\n✅ All tests passed!');
                process.exit(0);
            } else {
                console.log('\n❌ Some tests failed!');
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('❌ Test runner failed:', error);
            process.exit(1);
        });
}

module.exports = { testCopyTradingBotCore };
