const { Connection, Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');
const TradingExecution = require('./src/modules/tradingExecution');
const config = require('./src/config');

/**
 * Example usage of Raydium integration
 * This demonstrates how to use the updated trading system
 */

async function exampleRaydiumTrade() {
    console.log('🚀 Raydium Trading Example\n');

    try {
        // Initialize trading execution with Raydium
        const tradingExecution = new TradingExecution(config);
        
        // Example: Create a test wallet (DO NOT USE IN PRODUCTION)
        // In production, you would load the user's encrypted wallet
        const testWallet = Keypair.generate();
        console.log(`📝 Example wallet: ${testWallet.publicKey.toString()}`);
        console.log('⚠️  This is a test wallet with no funds\n');

        // Set the wallet
        tradingExecution.setUserWallet(testWallet);

        console.log('🔧 Trading Configuration:');
        console.log(`   Provider: ${config.trading.tradingProvider}`);
        console.log(`   Fallback Enabled: ${config.trading.enableFallback}`);
        console.log(`   Default Slippage: ${config.trading.raydium.defaultSlippageBps} basis points`);
        console.log(`   Priority Level: ${config.trading.raydium.priorityLevel}\n`);

        // Example token addresses (Solana mainnet)
        const tokens = {
            SOL: 'So11111111111111111111111111111111111111112',
            USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            // Add more tokens as needed
        };

        console.log('💰 Example Buy Operation:');
        console.log(`   Buying token: ${tokens.USDC}`);
        console.log(`   Amount: 0.1 SOL`);
        console.log(`   Method: executeBuy()\n`);

        // This would execute a buy in a real scenario
        // const buyResult = await tradingExecution.executeBuy(
        //     'user123',           // userId
        //     tokens.USDC,         // tokenAddress
        //     0.1                  // solAmount
        // );

        console.log('📊 Example Sell Operation:');
        console.log(`   Selling token: ${tokens.USDC}`);
        console.log(`   Amount: 100 USDC`);
        console.log(`   Method: executeSell()\n`);

        // This would execute a sell in a real scenario
        // const sellResult = await tradingExecution.executeSell(
        //     'user123',           // userId
        //     tokens.USDC,         // tokenAddress
        //     100,                 // tokenAmount
        //     testWallet,          // keypair
        //     50                   // slippageBps
        // );

        console.log('🔄 Fallback Mechanism:');
        console.log('   1. Primary: Raydium API');
        console.log('   2. Fallback: Jupiter API');
        console.log('   3. Automatic switching on failure\n');

        console.log('📈 Expected Flow for Buy:');
        console.log('   1. Check wallet balance');
        console.log('   2. Calculate fees (priority + network + bot)');
        console.log('   3. Execute Raydium swap');
        console.log('   4. Verify transaction success');
        console.log('   5. Return detailed results\n');

        console.log('🛡️ Error Handling:');
        console.log('   • Insufficient balance detection');
        console.log('   • Network connectivity issues');
        console.log('   • Slippage tolerance exceeded');
        console.log('   • API rate limiting');
        console.log('   • Transaction verification\n');

        // Example of checking swap capabilities
        console.log('🔍 Testing Service Availability:');
        
        try {
            const raydiumService = tradingExecution.raydiumService;
            const priorityFeeData = await raydiumService.getPriorityFee();
            console.log('   ✅ Raydium service accessible');
            console.log(`   📊 Current priority fees:`);
            console.log(`      High: ${priorityFeeData.data.default.h} micro lamports`);
            console.log(`      Medium: ${priorityFeeData.data.default.m} micro lamports`);
        } catch (error) {
            console.log('   ⚠️  Raydium service unavailable (Jupiter fallback available)');
        }

        console.log('\n✅ Example completed successfully!');
        console.log('\n📝 To use in your bot:');
        console.log('   1. Install Raydium SDK: npm install @raydium-io/raydium-sdk-v2');
        console.log('   2. Fund a wallet with SOL for testing');
        console.log('   3. Use the existing buyManager.executeBuy() method');
        console.log('   4. Monitor logs for Raydium vs Jupiter usage');

    } catch (error) {
        console.error('❌ Example failed:', error.message);
    }
}

// Utility function to format token amounts
function formatTokenAmount(amount, decimals = 6) {
    return (amount / Math.pow(10, decimals)).toFixed(decimals);
}

// Utility function to format SOL amounts
function formatSolAmount(lamports) {
    return (lamports / 1e9).toFixed(6);
}

// Example of how to validate token addresses
function isValidSolanaAddress(address) {
    try {
        const publicKey = new (require('@solana/web3.js').PublicKey)(address);
        return publicKey.toString() === address;
    } catch {
        return false;
    }
}

// Run the example
if (require.main === module) {
    exampleRaydiumTrade().catch(console.error);
}

module.exports = {
    exampleRaydiumTrade,
    formatTokenAmount,
    formatSolAmount,
    isValidSolanaAddress
};
