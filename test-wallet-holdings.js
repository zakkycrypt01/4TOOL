require('dotenv').config();
const WalletHoldingsService = require('./src/services/walletHoldingsService');

async function testWalletHoldings() {
    console.log('🧪 Testing Wallet Holdings Service...\n');

    // Initialize the service
    const config = {
        rpcEndpoint: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
    };
    
    const holdingsService = new WalletHoldingsService(config);

    // Test wallet addresses (you can replace these with actual addresses)
    const testWallets = [
        // Example wallet - replace with actual wallet addresses for testing
        'So11111111111111111111111111111111111111112', // This will fail validation, just for demo
        // Add real wallet addresses here for testing
    ];

    // Test 1: Wallet address validation
    console.log('📋 Test 1: Wallet Address Validation');
    console.log('Valid SOL address:', holdingsService.validateWalletAddress('So11111111111111111111111111111111111111112'));
    console.log('Invalid address:', holdingsService.validateWalletAddress('invalid_address'));
    console.log('');

    // Test 2: Token list fetching
    console.log('📋 Test 2: Fetching Token List');
    try {
        const tokenList = await holdingsService.getTokenList();
        const tokenCount = Object.keys(tokenList).length;
        console.log(`✅ Successfully fetched ${tokenCount} tokens`);
        
        // Show some example tokens
        const solToken = tokenList['So11111111111111111111111111111111111111112'];
        const usdcToken = tokenList['EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'];
        
        console.log('SOL token info:', {
            symbol: solToken?.symbol,
            name: solToken?.name,
            source: solToken?.source
        });
        console.log('USDC token info:', {
            symbol: usdcToken?.symbol,
            name: usdcToken?.name,
            source: usdcToken?.source
        });
    } catch (error) {
        console.error('❌ Error fetching token list:', error.message);
    }
    console.log('');

    // Test 3: Price fetching
    console.log('📋 Test 3: Fetching Token Prices');
    try {
        const tokenAddresses = [
            'So11111111111111111111111111111111111111112', // SOL
            'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
        ];
        
        const prices = await holdingsService.getTokenPrices(tokenAddresses);
        console.log('✅ Successfully fetched prices');
        
        Object.entries(prices).forEach(([mint, priceInfo]) => {
            const tokenList = holdingsService.tokenListCache.get('tokenList')?.data || {};
            const token = tokenList[mint];
            console.log(`${token?.symbol || mint}: $${priceInfo.usd} (${priceInfo.source})`);
        });
    } catch (error) {
        console.error('❌ Error fetching prices:', error.message);
    }
    console.log('');

    // Test 4: Get wallet holdings (if you provide a real wallet address)
    if (process.argv[2] && holdingsService.validateWalletAddress(process.argv[2])) {
        const walletAddress = process.argv[2];
        console.log(`📋 Test 4: Fetching Holdings for ${walletAddress}`);
        
        try {
            console.log('🔍 Fetching wallet holdings...');
            const holdings = await holdingsService.getAllHoldings(walletAddress);
            
            console.log('✅ Successfully fetched holdings');
            console.log(`📊 Total holdings: ${holdings.totalHoldings}`);
            console.log(`💰 Total value: ${holdings.totalValue.formatted}`);
            console.log('');
            
            // Show top 5 holdings
            console.log('🏆 Top 5 Holdings:');
            holdings.holdings.slice(0, 5).forEach((holding, index) => {
                console.log(`${index + 1}. ${holding.symbol} (${holding.name})`);
                console.log(`   Balance: ${holding.balance.toFixed(6)}`);
                console.log(`   Value: ${holding.value.formatted || 'N/A'}`);
                console.log(`   Verified: ${holding.metadata.verified ? '✅' : '❌'}`);
                console.log('');
            });

        } catch (error) {
            console.error('❌ Error fetching wallet holdings:', error.message);
        }
    } else {
        console.log('📋 Test 4: Skipped (no valid wallet address provided)');
        console.log('💡 To test with a real wallet, run: node test-wallet-holdings.js YOUR_WALLET_ADDRESS');
    }

    console.log('🧪 Testing complete!');
}

// Run the test
if (require.main === module) {
    testWalletHoldings().catch(console.error);
}

module.exports = testWalletHoldings;
