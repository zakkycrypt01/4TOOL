const HeliusWalletService = require('./src/services/heliusWalletService');

async function testHeliusWallet() {
    try {
        // Initialize the service
        const walletService = new HeliusWalletService({
            apiKey: '35d3d141-6c2d-46ac-956a-b9748f91d6ca'
        });

        // Test wallet address from the original code
        const testWalletAddress = 'oQPnhXAbLbMuKHESaGrbXT17CyvWCpLyERSJA9HCYd7';

        console.log('🔍 Testing Helius Wallet Service...\n');

        // Test 1: Get all wallet assets
        console.log('📊 Getting all wallet assets...');
        const allAssets = await walletService.getWalletAssets(testWalletAddress);
        console.log(`Found ${allAssets.totalItems} total items`);
        console.log(`Native SOL balance: ${allAssets.nativeBalance / 1e9} SOL\n`);

        // Test 2: Get only fungible tokens
        console.log('🪙 Getting fungible tokens only...');
        const fungibleTokens = await walletService.getFungibleTokens(testWalletAddress);
        console.log(`Found ${fungibleTokens.totalTokens} fungible tokens`);
        
        if (fungibleTokens.fungibleTokens.length > 0) {
            console.log('Sample fungible tokens:');
            fungibleTokens.fungibleTokens.slice(0, 3).forEach((token, index) => {
                const balance = token.token_info?.balance_info?.current_balance || 0;
                const decimals = token.token_info?.decimals || 0;
                const actualBalance = balance / Math.pow(10, decimals);
                console.log(`  ${index + 1}. ${token.content?.metadata?.name || 'Unknown'} - Balance: ${actualBalance}`);
            });
        }
        console.log('');

        // Test 3: Get native balance only
        console.log('💰 Getting native SOL balance...');
        const nativeBalance = await walletService.getNativeBalance(testWalletAddress);
        console.log(`Native SOL: ${nativeBalance.nativeBalance / 1e9} SOL\n`);

        // Test 4: Get comprehensive wallet summary
        console.log('📋 Getting comprehensive wallet summary...');
        const summary = await walletService.getWalletSummary(testWalletAddress);
        console.log('Wallet Summary:');
        console.log(`  Owner: ${summary.ownerAddress}`);
        console.log(`  Native SOL: ${summary.summary.nativeBalance / 1e9} SOL`);
        console.log(`  Fungible Tokens: ${summary.summary.fungibleTokenCount}`);
        console.log(`  Estimated Total Value: $${summary.summary.totalEstimatedValue.toFixed(2)}`);
        console.log(`  Last Updated: ${summary.summary.lastUpdated}\n`);

        // Test 5: Cache statistics
        console.log('📈 Cache Statistics:');
        const cacheStats = walletService.getCacheStats();
        console.log(`  Total Cache Entries: ${cacheStats.totalEntries}`);
        console.log(`  Cache Expiry: ${cacheStats.cacheExpiry / 1000} seconds`);
        console.log(`  Timestamp: ${cacheStats.timestamp}\n`);

        console.log('✅ All tests completed successfully!');

    } catch (error) {
        console.error('❌ Error during testing:', error.message);
        if (error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }
}

// Run the test
if (require.main === module) {
    testHeliusWallet();
}

module.exports = { testHeliusWallet }; 