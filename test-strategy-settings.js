const DatabaseManager = require('./src/modules/database');

async function testStrategySettings() {
    console.log('Testing autonomous strategy settings creation...');
    
    const db = new DatabaseManager();
    const testUserId = 1;
    
    try {
        // Test 1: Check current strategy settings
        console.log('\n1. Checking current strategy settings...');
        let strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        console.log('Current strategy settings:', strategySettings);
        
        // Test 2: Create autonomous strategy settings
        console.log('\n2. Creating autonomous strategy settings...');
        const defaultSettings = {
            type: 'autonomous',
            params: {
                isActive: true,
                maxPositionSize: 0.1,
                maxDailyLoss: 0.05,
                maxOpenPositions: 5,
                stopLoss: 0.1,
                takeProfit: 0.2,
                maxSlippage: 1,
                minLiquidity: 10000
            }
        };
        
        const createResult = await db.createStrategy(testUserId, defaultSettings);
        console.log('Create strategy result:', createResult);
        
        // Test 3: Check if strategy settings were created
        console.log('\n3. Checking if strategy settings were created...');
        strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        console.log('Updated strategy settings:', strategySettings);
        
        // Test 4: Test strategy settings update
        console.log('\n4. Testing strategy settings update...');
        const updateResult = await db.updateStrategySettings(testUserId, 'autonomous', {
            isActive: true,
            maxPositionSize: 0.15
        });
        console.log('Update strategy result:', updateResult);
        
        // Test 5: Check final strategy settings
        console.log('\n5. Checking final strategy settings...');
        strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        console.log('Final strategy settings:', strategySettings);
        
        console.log('\n✅ Strategy settings tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testStrategySettings().catch(console.error); 