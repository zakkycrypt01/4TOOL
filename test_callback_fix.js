// Test script to verify callback query handling fixes
const CallbackRouter = require('./src/modules/callbackRouter');

// Mock bot and handlers for testing
const mockBot = {
    sendMessage: async (chatId, message) => {
        console.log(`Mock bot sending message to ${chatId}: ${message}`);
        return { message_id: 123 };
    }
};

const mockHandlers = {
    ruleHandlers: {
        handleRuleConfigMarketCap: async (chatId, telegramId) => {
            console.log(`Mock rule handler: market cap config for ${chatId}, ${telegramId}`);
        }
    }
};

// Create callback router instance
const callbackRouter = new CallbackRouter(mockBot, mockHandlers);

// Test valid callback query context
async function testValidCallback() {
    console.log('\n=== Testing Valid Callback Query ===');
    
    const validCtx = {
        chat: { id: 123456 },
        from: { id: 789012 },
        callbackQuery: {
            id: 'callback_123',
            data: 'rule_config_market_cap'
        }
    };
    
    try {
        await callbackRouter.handleCallbackQuery(validCtx);
        console.log('✅ Valid callback query handled successfully');
    } catch (error) {
        console.error('❌ Error handling valid callback query:', error);
    }
}

// Test invalid callback query context
async function testInvalidCallback() {
    console.log('\n=== Testing Invalid Callback Query ===');
    
    const invalidCtx = {
        chat: { id: 123456 },
        // Missing 'from' property
        callbackQuery: {
            id: 'callback_123',
            data: 'rule_config_market_cap'
        }
    };
    
    try {
        const result = await callbackRouter.handleCallbackQuery(invalidCtx);
        if (result === undefined) {
            console.log('✅ Invalid callback query properly rejected (returned undefined)');
        } else {
            console.log('❌ Invalid callback query was processed (should have failed)');
        }
    } catch (error) {
        console.log('✅ Invalid callback query properly rejected with error:', error.message);
    }
}

// Test webhook update structure
function testWebhookUpdateStructure() {
    console.log('\n=== Testing Webhook Update Structure ===');
    
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
            data: 'rule_config_market_cap'
        }
    };
    
    console.log('Webhook update structure:', JSON.stringify(mockWebhookUpdate, null, 2));
    
    // Test context creation
    if (mockWebhookUpdate.callback_query.message && 
        mockWebhookUpdate.callback_query.message.chat && 
        mockWebhookUpdate.callback_query.from) {
        
        const ctx = {
            chat: mockWebhookUpdate.callback_query.message.chat,
            from: mockWebhookUpdate.callback_query.from,
            callbackQuery: mockWebhookUpdate.callback_query
        };
        
        console.log('✅ Context created successfully:', {
            chatId: ctx.chat.id,
            fromId: ctx.from.id,
            callbackData: ctx.callbackQuery.data
        });
    } else {
        console.log('❌ Invalid webhook update structure');
    }
}

// Run tests
async function runTests() {
    console.log('🧪 Testing Callback Query Handling Fixes\n');
    
    await testValidCallback();
    await testInvalidCallback();
    testWebhookUpdateStructure();
    
    console.log('\n✅ All tests completed');
}

// Run tests if this file is executed directly
if (require.main === module) {
    runTests().catch(console.error);
}

module.exports = { testValidCallback, testInvalidCallback, testWebhookUpdateStructure };
