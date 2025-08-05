const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');

// Test the specific private key from the error log
const testPrivateKey = '52TZLYkEq8JedgUTXCugf2qUDVeLAGLKRqJQZsSwee7YGvELGVGCKHN2GdB1r3jG1D226N12ZPFkhdERCaEb6xsY';

console.log('🧪 Testing specific private key from error log...\n');
console.log('Input:', testPrivateKey);
console.log('Length:', testPrivateKey.length);

// Test if it's actually Base64
console.log('\n🔍 Testing as Base64...');
try {
    const base64Buffer = Buffer.from(testPrivateKey, 'base64');
    console.log('✅ Base64 decode successful, length:', base64Buffer.length);
    
    if (base64Buffer.length === 64) {
        console.log('✅ Buffer length is correct for private key');
        
        // Try to create a keypair
        try {
            const keypair = Keypair.fromSecretKey(base64Buffer);
            console.log('✅ Successfully created keypair!');
            console.log('Public key:', keypair.publicKey.toString());
        } catch (error) {
            console.log('❌ Failed to create keypair:', error.message);
        }
    } else {
        console.log('❌ Buffer length is wrong:', base64Buffer.length, 'expected 64');
    }
} catch (error) {
    console.log('❌ Base64 decode failed:', error.message);
}

// Test if it's Base58
console.log('\n🔍 Testing as Base58...');
try {
    const base58Buffer = bs58.decode(testPrivateKey);
    console.log('✅ Base58 decode successful, length:', base58Buffer.length);
    
    if (base58Buffer.length === 64) {
        console.log('✅ Buffer length is correct for private key');
        
        // Try to create a keypair
        try {
            const keypair = Keypair.fromSecretKey(base58Buffer);
            console.log('✅ Successfully created keypair!');
            console.log('Public key:', keypair.publicKey.toString());
        } catch (error) {
            console.log('❌ Failed to create keypair:', error.message);
        }
    } else {
        console.log('❌ Buffer length is wrong:', base58Buffer.length, 'expected 64');
    }
} catch (error) {
    console.log('❌ Base58 decode failed:', error.message);
}

// Check character composition
console.log('\n🔍 Character analysis...');
console.log('Contains only base58 chars:', /^[1-9A-HJ-NP-Za-km-z]+$/.test(testPrivateKey));
console.log('Contains base64 chars (=):', testPrivateKey.includes('='));
console.log('Contains base64 chars (+/):', /[+/]/.test(testPrivateKey));
