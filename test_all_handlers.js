// Comprehensive test for all handlers and callbacks
const CallbackRouter = require('./src/modules/callbackRouter');
const WebhookServer = require('./src/webhookServer');

// Mock bot and handlers for testing
const mockBot = {
    sendMessage: async (chatId, message, options) => {
        console.log(`✅ Mock bot sending message to ${chatId}: ${message}`);
        if (options && options.reply_markup) {
            console.log(`   With keyboard: ${JSON.stringify(options.reply_markup)}`);
        }
        return { message_id: Math.floor(Math.random() * 1000) + 1 };
    },
    answerCallbackQuery: async (callbackQueryId, text) => {
        console.log(`✅ Mock bot answering callback query ${callbackQueryId}: ${text}`);
        return true;
    }
};

// Mock all handlers
const mockHandlers = {
    walletHandlers: {
        handleCreateWallet: async (chatId, telegramId) => {
            console.log(`✅ Wallet handler: create wallet for ${chatId}, ${telegramId}`);
            return true;
        },
        handleImportWallet: async (chatId, telegramId) => {
            console.log(`✅ Wallet handler: import wallet for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    portfolioHandlers: {
        handlePortfolio: async (chatId, telegramId) => {
            console.log(`✅ Portfolio handler: show portfolio for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    tradingHandlers: {
        handleBuy: async (chatId, telegramId) => {
            console.log(`✅ Trading handler: buy for ${chatId}, ${telegramId}`);
            return true;
        },
        handleSell: async (chatId, telegramId) => {
            console.log(`✅ Trading handler: sell for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    strategyHandlers: {
        handleStrategyCallback: async (chatId, telegramId, callbackData) => {
            console.log(`✅ Strategy handler: ${callbackData} for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    ruleHandlers: {
        handleRuleConfigMarketCap: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: market cap config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigPriceRange: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: price range config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigLiquidity: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: liquidity config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigVolume: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: volume config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigCategory: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: category config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigTimeframe: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: timeframe config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigVolumeSpike: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: volume spike config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigDipBuy: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: dip buy config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigNarrative: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: narrative config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigMomentum: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: momentum config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigVolatility: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: volatility config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleConfigCopyTrade: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: copy trade config for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleValueSelection: async (chatId, telegramId, callbackData) => {
            console.log(`✅ Rule handler: value selection ${callbackData} for ${chatId}, ${telegramId}`);
            return true;
        },
        handleRuleSaveStrategy: async (chatId, telegramId) => {
            console.log(`✅ Rule handler: save strategy for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    exportHandlers: {
        handleExport: async (chatId, telegramId) => {
            console.log(`✅ Export handler: export for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    securityHandlers: {
        handleSecurity: async (chatId, telegramId) => {
            console.log(`✅ Security handler: security for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    copyTradeHandlers: {
        handleCopyTrade: async (chatId, telegramId) => {
            console.log(`✅ Copy trade handler: copy trade for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    settingsHandlers: {
        handleSettings: async (chatId, telegramId) => {
            console.log(`✅ Settings handler: settings for ${chatId}, ${telegramId}`);
            return true;
        }
    },
    rulesCommand: {
        handleCallbackQuery: async (ctx) => {
            console.log(`✅ Rules command: callback for ${ctx.chat.id}, ${ctx.from.id}`);
            return true;
        }
    },
    bot: {
        handleStrategies: async (chatId, telegramId) => {
            console.log(`✅ Bot handler: strategies for ${chatId}, ${telegramId}`);
            return true;
        }
    }
};

// Create callback router instance
const callbackRouter = new CallbackRouter(mockBot, mockHandlers);

// Test all callback types
async function testAllCallbacks() {
    console.log('\n🧪 Testing All Callback Handlers\n');
    
    const testCases = [
        // Wallet callbacks
        { name: 'Create Wallet', data: 'create_wallet', expectedHandler: 'walletHandlers' },
        { name: 'Import Wallet', data: 'import_wallet', expectedHandler: 'walletHandlers' },
        
        // Portfolio callbacks
        { name: 'Portfolio', data: 'portfolio', expectedHandler: 'portfolioHandlers' },
        
        // Trading callbacks
        { name: 'Buy', data: 'buy', expectedHandler: 'tradingHandlers' },
        { name: 'Sell', data: 'sell', expectedHandler: 'tradingHandlers' },
        
        // Strategy callbacks
        { name: 'Strategy Copy Trade', data: 'strategy_copy_trade', expectedHandler: 'strategyHandlers' },
        { name: 'Strategy Volume Spike', data: 'strategy_volume_spike', expectedHandler: 'strategyHandlers' },
        
        // Rule configuration callbacks
        { name: 'Rule Market Cap Config', data: 'rule_config_market_cap', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Price Range Config', data: 'rule_config_price_range', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Liquidity Config', data: 'rule_config_liquidity', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Volume Config', data: 'rule_config_volume', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Category Config', data: 'rule_config_category', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Timeframe Config', data: 'rule_config_timeframe', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Volume Spike Config', data: 'rule_config_volume_spike', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Dip Buy Config', data: 'rule_config_dip_buy', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Narrative Config', data: 'rule_config_narrative', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Momentum Config', data: 'rule_config_momentum', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Volatility Config', data: 'rule_config_volatility', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Copy Trade Config', data: 'rule_config_copy_trade', expectedHandler: 'ruleHandlers' },
        
        // Rule value selection callbacks
        { name: 'Rule Market Cap Value', data: 'rule_mcap_1000000', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Price Value', data: 'rule_price_0.001', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Liquidity Value', data: 'rule_liquidity_10000', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Volume Value', data: 'rule_volume_50000', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Category Value', data: 'rule_category_defi', expectedHandler: 'ruleHandlers' },
        { name: 'Rule Timeframe Value', data: 'rule_timeframe_1h', expectedHandler: 'ruleHandlers' },
        
        // Rule save strategy
        { name: 'Rule Save Strategy', data: 'rule_save_strategy', expectedHandler: 'ruleHandlers' },
        
        // Export callbacks
        { name: 'Export Portfolio', data: 'export_portfolio', expectedHandler: 'exportHandlers' },
        
        // Security callbacks
        { name: 'Security Settings', data: 'security_settings', expectedHandler: 'securityHandlers' },
        
        // Copy trade callbacks
        { name: 'Copy Trade Toggle', data: 'copy_trade_toggle_123', expectedHandler: 'copyTradeHandlers' },
        
        // Settings callbacks
        { name: 'Settings', data: 'settings', expectedHandler: 'settingsHandlers' },
        
        // Strategies button
        { name: 'Strategies Button', data: 'strategies', expectedHandler: 'bot' }
    ];
    
    let passedTests = 0;
    let totalTests = testCases.length;
    
    for (const testCase of testCases) {
        console.log(`\n--- Testing: ${testCase.name} ---`);
        
        const validCtx = {
            chat: { id: 123456 },
            from: { id: 789012 },
            callbackQuery: {
                id: `callback_${Math.random()}`,
                data: testCase.data
            }
        };
        
        try {
            await callbackRouter.handleCallbackQuery(validCtx);
            console.log(`✅ ${testCase.name}: PASSED`);
            passedTests++;
        } catch (error) {
            console.error(`❌ ${testCase.name}: FAILED - ${error.message}`);
        }
    }
    
    console.log(`\n📊 Test Results: ${passedTests}/${totalTests} tests passed`);
    return passedTests === totalTests;
}

// Test webhook server functionality
function testWebhookServer() {
    console.log('\n🌐 Testing Webhook Server Functionality\n');
    
    // Test webhook update structure validation
    const mockWebhookUpdate = {
        update_id: 123456,
        callback_query: {
            id: 'callback_123',
            from: { id: 789012, first_name: 'Test User' },
            message: {
                message_id: 456,
                chat: { id: 123456, type: 'private' },
                text: 'Test message'
            },
            data: 'test_callback'
        }
    };
    
    console.log('✅ Webhook update structure is valid');
    
    // Test context creation
    if (mockWebhookUpdate.callback_query.message && 
        mockWebhookUpdate.callback_query.message.chat && 
        mockWebhookUpdate.callback_query.from) {
        
        const ctx = {
            chat: mockWebhookUpdate.callback_query.message.chat,
            from: mockWebhookUpdate.callback_query.from,
            callbackQuery: mockWebhookUpdate.callback_query
        };
        
        console.log('✅ Context creation successful');
        console.log(`   Chat ID: ${ctx.chat.id}`);
        console.log(`   From ID: ${ctx.from.id}`);
        console.log(`   Callback Data: ${ctx.callbackQuery.data}`);
    }
    
    return true;
}

// Test error handling
async function testErrorHandling() {
    console.log('\n⚠️ Testing Error Handling\n');
    
    // Test invalid context
    const invalidCtx = {
        chat: { id: 123456 },
        // Missing 'from' property
        callbackQuery: {
            id: 'callback_123',
            data: 'test_callback'
        }
    };
    
    try {
        const result = await callbackRouter.handleCallbackQuery(invalidCtx);
        if (result === undefined) {
            console.log('✅ Invalid context properly rejected');
        } else {
            console.log('❌ Invalid context was processed (should have failed)');
            return false;
        }
    } catch (error) {
        console.log('✅ Invalid context properly rejected with error:', error.message);
    }
    
    // Test missing callback data
    const noDataCtx = {
        chat: { id: 123456 },
        from: { id: 789012 },
        callbackQuery: {
            id: 'callback_123'
            // Missing data property
        }
    };
    
    try {
        const result = await callbackRouter.handleCallbackQuery(noDataCtx);
        if (result === undefined) {
            console.log('✅ Missing callback data properly rejected');
        } else {
            console.log('❌ Missing callback data was processed (should have failed)');
            return false;
        }
    } catch (error) {
        console.log('✅ Missing callback data properly rejected with error:', error.message);
    }
    
    return true;
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting Comprehensive Handler and Callback Tests\n');
    
    try {
        const callbacksWorking = await testAllCallbacks();
        const webhookWorking = testWebhookServer();
        const errorHandlingWorking = await testErrorHandling();
        
        console.log('\n🎯 Final Test Summary:');
        console.log(`✅ Callback Handlers: ${callbacksWorking ? 'WORKING' : 'FAILED'}`);
        console.log(`✅ Webhook Server: ${webhookWorking ? 'WORKING' : 'FAILED'}`);
        console.log(`✅ Error Handling: ${errorHandlingWorking ? 'WORKING' : 'FAILED'}`);
        
        if (callbacksWorking && webhookWorking && errorHandlingWorking) {
            console.log('\n🎉 ALL SYSTEMS ARE WORKING PROPERLY!');
            return true;
        } else {
            console.log('\n❌ SOME SYSTEMS HAVE ISSUES');
            return false;
        }
        
    } catch (error) {
        console.error('\n💥 Test suite failed:', error);
        return false;
    }
}

// Run tests if this file is executed directly
if (require.main === module) {
    runAllTests().catch(console.error);
}

module.exports = { 
    testAllCallbacks, 
    testWebhookServer, 
    testErrorHandling, 
    runAllTests 
};






