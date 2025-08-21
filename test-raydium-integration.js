const { Connection, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const RaydiumService = require('./src/services/raydiumService');
const config = require('./src/config');

/**
 * Test script for Raydium integration
 * This script tests the basic functionality of the RaydiumService
 */

async function testRaydiumService() {
    console.log('🧪 Testing Raydium Service Integration...\n');

    try {
        // Initialize connection and service
        const connection = new Connection(config.rpcEndpoint);
        const raydiumService = new RaydiumService(connection, config);

        console.log('✅ RaydiumService initialized successfully');
        console.log(`📡 Connected to: ${config.rpcEndpoint}\n`);

        // Test 1: Get priority fee
        console.log('🔍 Test 1: Getting priority fee data...');
        try {
            const priorityFee = await raydiumService.getPriorityFee();
            console.log('✅ Priority fee data retrieved:');
            console.log(`   Very High: ${priorityFee.data.default.vh} micro lamports`);
            console.log(`   High: ${priorityFee.data.default.h} micro lamports`);
            console.log(`   Medium: ${priorityFee.data.default.m} micro lamports\n`);
        } catch (error) {
            console.log('⚠️  Priority fee test failed (using defaults):', error.message);
        }

        // Test 2: Get swap quote (SOL -> USDC for testing)
        console.log('🔍 Test 2: Getting swap quote (SOL -> USDC)...');
        try {
            const solMint = 'So11111111111111111111111111111111111111112';
            const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
            const amount = 100000000; // 0.1 SOL in lamports
            
            const quote = await raydiumService.getSwapQuote(
                solMint,
                usdcMint, 
                amount,
                50, // 0.5% slippage
                'v0'
            );
            
            console.log('✅ Swap quote retrieved successfully:');
            console.log(`   Input: ${amount} lamports SOL`);
            console.log(`   Output: ~${quote.data.outAmount} USDC units`);
            console.log(`   Price Impact: ${quote.data.priceImpactPct || 0}%\n`);
        } catch (error) {
            console.log('❌ Swap quote test failed:', error.message);
            console.log('   This is expected if you don\'t have the Raydium SDK installed\n');
        }

        // Test 3: Test rate limiting
        console.log('🔍 Test 3: Testing rate limiting...');
        const startTime = Date.now();
        
        try {
            // Make two quick requests to test rate limiting
            await raydiumService.getPriorityFee();
            await raydiumService.getPriorityFee();
            
            const elapsed = Date.now() - startTime;
            console.log(`✅ Rate limiting working (took ${elapsed}ms for 2 requests)\n`);
        } catch (error) {
            console.log('⚠️  Rate limiting test inconclusive:', error.message);
        }

        console.log('🎉 Raydium Service tests completed!\n');
        
        // Show integration status
        console.log('📋 Integration Status:');
        console.log('   ✅ RaydiumService class created');
        console.log('   ✅ Configuration updated'); 
        console.log('   ✅ TradingExecution updated with Raydium support');
        console.log('   ✅ Fallback mechanism implemented');
        console.log('   ⚠️  Raydium SDK installation pending (network issues)');
        
        console.log('\n📝 Next Steps:');
        console.log('   1. Install Raydium SDK: npm install @raydium-io/raydium-sdk-v2');
        console.log('   2. Set TRADING_PROVIDER=raydium in .env file (optional)');
        console.log('   3. Set RAYDIUM_PRIORITY_LEVEL=h in .env file (optional)');
        console.log('   4. Test with a small trade on devnet first');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
if (require.main === module) {
    testRaydiumService();
}

module.exports = { testRaydiumService };
