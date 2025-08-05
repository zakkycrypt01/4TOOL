const bs58 = require('bs58');
const { Keypair } = require('@solana/web3.js');

// Test private key import logic
function testPrivateKeyImport() {
    console.log('🧪 Testing private key import logic...\n');
    
    // Use a known test private key from the error log
    const testPrivateKey = '52TZLYkEq8JedgUTXCugf2qUDVeLAGLKRqJQZsSwee7YGvELGVGCKHN2GdB1r3jG1D226N12ZPFkhdERCaEb6xsY';
    
    console.log('📋 Testing with actual private key from error log:');
    console.log('Input length:', testPrivateKey.length);
    console.log('Input preview:', testPrivateKey.substring(0, 20) + '...');
    console.log('');
    
    // Test the detection logic
    console.log('🔍 Testing private key detection...');
    try {
        const result = testPrivateKeyDetection(testPrivateKey);
        if (result.success) {
            console.log(`✅ SUCCESS - Format: ${result.format}, Buffer length: ${result.buffer.length}`);
            
            // Try to create a keypair to verify it's valid
            try {
                const keypair = Keypair.fromSecretKey(result.buffer);
                console.log(`� Successfully created keypair with public key: ${keypair.publicKey.toString()}`);
            } catch (error) {
                console.log(`❌ Failed to create keypair: ${error.message}`);
            }
        } else {
            console.log(`❌ FAILED - ${result.error}`);
        }
    } catch (error) {
        console.log(`❌ ERROR - ${error.message}`);
    }
    
    // Test additional formats
    console.log('\n🧪 Testing additional formats...');
    
    // Generate a test keypair for other format testing
    const testKeypair = Keypair.generate();
    const testPrivateKeyBuffer = testKeypair.secretKey;
    
    console.log('\nGenerated test keypair:');
    console.log('Public key:', testKeypair.publicKey.toString());
    console.log('Secret key buffer length:', testPrivateKeyBuffer.length);
    
    // Test base64 format
    const base64Format = Buffer.from(testPrivateKeyBuffer).toString('base64');
    console.log('\n🔍 Testing Base64 format:', base64Format.substring(0, 20) + '...');
    testFormat('Base64', base64Format, testKeypair.publicKey.toString());
    
    // Test hex format
    const hexFormat = Buffer.from(testPrivateKeyBuffer).toString('hex');
    console.log('\n🔍 Testing Hex format:', hexFormat.substring(0, 20) + '...');
    testFormat('Hex', hexFormat, testKeypair.publicKey.toString());
    
    // Test hex with 0x prefix
    const hexWithPrefix = '0x' + hexFormat;
    console.log('\n🔍 Testing Hex with 0x prefix:', hexWithPrefix.substring(0, 20) + '...');
    testFormat('Hex with 0x', hexWithPrefix, testKeypair.publicKey.toString());
    
    // Test array format
    const arrayFormat = '[' + Array.from(testPrivateKeyBuffer).join(',') + ']';
    console.log('\n🔍 Testing Array format:', arrayFormat.substring(0, 40) + '...');
    testFormat('Array', arrayFormat, testKeypair.publicKey.toString());
}

function testFormat(name, input, expectedPublicKey) {
    try {
        const result = testPrivateKeyDetection(input);
        if (result.success) {
            console.log(`✅ ${name}: Format detected: ${result.format}, Buffer length: ${result.buffer.length}`);
            
            // Verify it creates the correct keypair
            const resultKeypair = Keypair.fromSecretKey(result.buffer);
            const publicKeyMatches = resultKeypair.publicKey.toString() === expectedPublicKey;
            console.log(`🔑 Public key matches: ${publicKeyMatches ? '✅' : '❌'}`);
        } else {
            console.log(`❌ ${name}: FAILED - ${result.error}`);
        }
    } catch (error) {
        console.log(`❌ ${name}: ERROR - ${error.message}`);
    }
}

function testPrivateKeyDetection(cleanInput) {
    let privateKeyBuffer;
    let originalFormat = '';
    
    // Try different formats in order of preference
    const bs58 = require('bs58');
    
    // 1. Try base58 format (most common for Solana private keys)
    if (!originalFormat && cleanInput.length >= 87 && cleanInput.length <= 88) {
        try {
            // Check if it contains only valid base58 characters
            if (/^[1-9A-HJ-NP-Za-km-z]+$/.test(cleanInput)) {
                privateKeyBuffer = bs58.decode(cleanInput);
                if (privateKeyBuffer.length === 64) {
                    originalFormat = 'base58';
                } else {
                    privateKeyBuffer = null; // Reset for next attempt
                }
            }
        } catch (e) {
            // Continue to next format
        }
    }
    
    // 2. Try base64 format
    if (!originalFormat && cleanInput.length === 88) {
        try {
            const testBuffer = Buffer.from(cleanInput, 'base64');
            if (testBuffer.length === 64) {
                privateKeyBuffer = testBuffer;
                originalFormat = 'base64';
            }
        } catch (e) {
            // Continue to next format
        }
    }
    
    // 3. Try hex format (128 characters for 64-byte private key)
    if (!originalFormat && /^[0-9a-fA-F]{128}$/.test(cleanInput)) {
        try {
            privateKeyBuffer = Buffer.from(cleanInput, 'hex');
            originalFormat = 'hex';
        } catch (e) {
            // Continue to next format
        }
    }
    
    // 4. Try hex format with 0x prefix
    if (!originalFormat && /^0x[0-9a-fA-F]{128}$/.test(cleanInput)) {
        try {
            privateKeyBuffer = Buffer.from(cleanInput.slice(2), 'hex');
            originalFormat = 'hex';
        } catch (e) {
            // Continue to next format
        }
    }
    
    // 5. Try array format (comma separated numbers)
    if (!originalFormat && cleanInput.startsWith('[') && cleanInput.endsWith(']')) {
        try {
            const arrayString = cleanInput.slice(1, -1);
            const numbers = arrayString.split(',').map(s => parseInt(s.trim()));
            if (numbers.length === 64 && numbers.every(n => n >= 0 && n <= 255)) {
                privateKeyBuffer = Buffer.from(numbers);
                originalFormat = 'array';
            }
        } catch (e) {
            // Continue to next format
        }
    }
    
    if (!originalFormat || !privateKeyBuffer) {
        return {
            success: false,
            error: 'Invalid private key format. Supported formats: base58, base64, hex (128 characters, with or without 0x prefix), array format [n1,n2,...]'
        };
    }
    
    return {
        success: true,
        format: originalFormat,
        buffer: privateKeyBuffer
    };
}

// Run the test
testPrivateKeyImport();
