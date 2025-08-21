const BuyManager = require('./src/modules/buyManager');

// Mock dependencies
const mockConfig = {};
const mockTradingExecution = {
    setUserWallet: () => {},
    executeBuy: () => Promise.resolve({ success: false, error: 'Network error' })
};
const mockDb = {
    getUserByTelegramId: () => Promise.resolve({ id: 1 }),
    getActiveWallet: () => Promise.resolve({
        id: 1,
        is_locked: false,
        encrypted_private_key: 'mock_key'
    }),
    createTrade: () => Promise.resolve()
};
const mockManualManagementService = {};

// Mock bot
const mockBot = {
    sendAndStoreMessage: (chatId, message, options) => {
        console.log('\n=== Bot Message ===');
        console.log('Chat ID:', chatId);
        console.log('Message:', message);
        if (options && options.reply_markup) {
            console.log('Keyboard:', JSON.stringify(options.reply_markup, null, 2));
        }
        console.log('==================\n');
        return Promise.resolve({ message_id: Date.now() });
    }
};

async function testBuyRetry() {
    console.log('🧪 Testing Buy Retry Functionality\n');

    const buyManager = new BuyManager(mockConfig, mockTradingExecution, mockDb, mockManualManagementService);
    
    // Mock decryptPrivateKey method to return a proper 64-byte key
    buyManager.decryptPrivateKey = () => Buffer.from('a'.repeat(128), 'hex').toString('base64');
    
    const chatId = 12345;
    const telegramId = '67890';
    const tokenAddress = 'DYFj4U9V75mXnwg5oofU3TVpFgpddPVBKpUt35MJpump';
    const amount = 1.0;

    console.log('1. Setting up pending buy...');
    buyManager.pendingBuyAmount.set(telegramId, {
        status: 'ready_to_execute',
        tokenAddress: tokenAddress,
        amount: amount
    });

    console.log('2. Executing buy (this should fail and store retry data)...');
    try {
        await buyManager.executeBuy(chatId, telegramId, amount, mockBot);
    } catch (error) {
        // Expected to fail
    }

    console.log('3. Checking if failed order was stored...');
    const hasRecentOrder = buyManager.hasRecentFailedOrder(telegramId);
    console.log('Has recent failed order:', hasRecentOrder);

    if (hasRecentOrder) {
        const lastOrder = buyManager.getLastFailedOrder(telegramId);
        console.log('Last failed order:', lastOrder);
    }

    console.log('4. Testing retry functionality...');
    await buyManager.retryLastFailedOrder(chatId, telegramId, mockBot);

    console.log('5. Testing retry with no previous order...');
    buyManager.lastFailedOrder.delete(telegramId);
    await buyManager.retryLastFailedOrder(chatId, telegramId, mockBot);

    console.log('\n✅ Test completed!');
}

testBuyRetry().catch(console.error);
