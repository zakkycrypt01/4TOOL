const { Connection } = require('@solana/web3.js');
const RaydiumService = require('./src/services/raydiumService');

async function testRaydiumService() {
    console.log('Testing Raydium Service fixes...');
    
    // Create connection
    const connection = new Connection('https://api.mainnet-beta.solana.com');
    
    // Create service
    const raydiumService = new RaydiumService(connection, {});
    
    // Test 1: Connection test
    console.log('\n=== Test 1: Connection Test ===');
    const connectionTest = await raydiumService.testConnection();
    console.log('Connection test result:', connectionTest);
    
    // Test 2: Priority fee test
    console.log('\n=== Test 2: Priority Fee Test ===');
    try {
        const priorityFee = await raydiumService.getPriorityFee();
        console.log('Priority fee result:', priorityFee);
    } catch (error) {
        console.error('Priority fee test failed:', error.message);
    }
    
    // Test 3: Test with the exact same parameters that failed
    console.log('\n=== Test 3: Original Failed Token Test ===');
    try {
        const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
        const outputMint = '2gZcjozCdghULQXFoR6rUBbid7C3FfH4ofNMaKYmk777'; // The token that failed
        const amount = 10000; // Same amount as original
        
        console.log(`Testing swap: ${amount} lamports from ${inputMint} to ${outputMint}`);
        
        const quote = await raydiumService.getSwapQuote(inputMint, outputMint, amount, 50, 'v0');
        console.log('Quote successful:', !!quote);
        console.log('Quote data keys:', Object.keys(quote));
        
    } catch (error) {
        console.error('Original token test failed:', error.message);
        
        // Let's test if this token exists at all
        console.log('\n--- Checking token validity ---');
        try {
            const tokenAccount = await connection.getAccountInfo(new (require('@solana/web3.js').PublicKey)('2gZcjozCdghULQXFoR6rUBbid7C3FfH4ofNMaKYmk777'));
            console.log('Token account exists:', !!tokenAccount);
        } catch (tokenError) {
            console.error('Token validation failed:', tokenError.message);
        }
    }
    
    // Test 4: Test with known working tokens
    console.log('\n=== Test 4: Known Working Tokens Test ===');
    try {
        const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
        const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
        const amount = 10000; // 0.00001 SOL
        
        console.log(`Testing SOL->USDC swap: ${amount} lamports`);
        
        const quote = await raydiumService.getSwapQuote(inputMint, outputMint, amount, 50, 'v0');
        console.log('SOL->USDC quote successful:', !!quote);
        console.log('Quote data structure:', Object.keys(quote));
        
    } catch (error) {
        console.error('SOL->USDC test failed:', error.message);
    }
}

testRaydiumService().catch(console.error);
