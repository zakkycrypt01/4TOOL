console.log('Testing bs58 module...');

try {
    const bs58 = require('bs58').default || require('bs58');
    console.log('bs58 module loaded:', typeof bs58);
    console.log('bs58 properties:', Object.keys(bs58));
    console.log('bs58.decode function:', typeof bs58.decode);
    console.log('bs58.encode function:', typeof bs58.encode);
    
    // Test decode
    if (bs58.decode) {
        console.log('Testing decode...');
        const testString = '11111111111111111111111111111111';
        try {
            const result = bs58.decode(testString);
            console.log('Decode result length:', result.length);
        } catch (e) {
            console.log('Decode error:', e.message);
        }
    }
    
    // Test with the specific private key
    const testPrivateKey = '52TZLYkEq8JedgUTXCugf2qUDVeLAGLKRqJQZsSwee7YGvELGVGCKHN2GdB1r3jG1D226N12ZPFkhdERCaEb6xsY';
    console.log('\nTesting with specific private key...');
    try {
        const result = bs58.decode(testPrivateKey);
        console.log('✅ Success! Decoded length:', result.length);
    } catch (e) {
        console.log('❌ Failed:', e.message);
    }
} catch (error) {
    console.error('Error loading bs58:', error.message);
}
