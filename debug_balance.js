const { Connection, PublicKey } = require('@solana/web3.js');
require('dotenv').config();

async function debugBalance() {
    try {
        // Test different RPC endpoints
        const rpcEndpoints = [
            'https://api.mainnet-beta.solana.com',
            'https://solana-api.projectserum.com',
            'https://rpc.ankr.com/solana',
            process.env.HELIUS_RPC_ENDPOINT || 'https://api.helius.xyz/v0/rpc'
        ];

        // Test wallet address (replace with actual wallet for testing)
        const testWalletAddress = process.env.TEST_WALLET_ADDRESS || '11111111111111111111111111111112';
        
        console.log('🔍 Debugging SOL Balance Issues');
        console.log('================================');
        console.log(`Test wallet: ${testWalletAddress}`);
        console.log('');

        for (const endpoint of rpcEndpoints) {
            console.log(`Testing RPC endpoint: ${endpoint}`);
            
            try {
                const connection = new Connection(endpoint);
                const publicKey = new PublicKey(testWalletAddress);
                
                // Test connection
                const slot = await connection.getSlot();
                console.log(`  ✅ Connection successful, current slot: ${slot}`);
                
                // Test balance
                const balance = await connection.getBalance(publicKey);
                const balanceInSol = balance / 1e9;
                console.log(`  ✅ Balance: ${balanceInSol} SOL (${balance} lamports)`);
                
                // Test recent blockhash
                const { blockhash } = await connection.getLatestBlockhash();
                console.log(`  ✅ Recent blockhash: ${blockhash}`);
                
            } catch (error) {
                console.log(`  ❌ Error: ${error.message}`);
            }
            
            console.log('');
        }

        // Test config loading
        console.log('Testing config loading...');
        const config = require('./src/config.js');
        console.log(`Config RPC endpoint: ${config.rpcEndpoint}`);
        console.log(`Helius RPC endpoint: ${config.helius.rpcEndpoint}`);
        
    } catch (error) {
        console.error('Debug error:', error);
    }
}

// Run the debug function
debugBalance().then(() => {
    console.log('Debug completed');
    process.exit(0);
}).catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
}); 