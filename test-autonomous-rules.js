const DatabaseManager = require('./src/modules/database');
const RuleEngine = require('./src/services/ruleEngine');
const AutonomousTrading = require('./src/services/autonomousTrading');

// Simple config object for testing
const config = {
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    jupiterApiUrl: 'https://price.jup.ag/v4',
    telegram: {
        token: 'test-token'
    },
    wallet: {
        publicKey: '11111111111111111111111111111111'
    },
    teamWallet: '11111111111111111111111111111111'
};

async function testAutonomousRules() {
    console.log('Testing autonomous rules functionality...');
    
    const db = new DatabaseManager();
    const ruleEngine = new RuleEngine(db, config);
    const autonomousTrading = new AutonomousTrading(config, db, ruleEngine);
    
    // Test user ID
    const testUserId = 1;
    
    try {
        // Test 1: Check if autonomous strategy settings are created
        console.log('\n1. Testing autonomous strategy settings creation...');
        await autonomousTrading.ensureAutonomousStrategySettings(testUserId);
        
        // Test 2: Check if strategy settings exist
        console.log('\n2. Testing strategy settings retrieval...');
        const strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        console.log('Strategy settings:', strategySettings);
        
        // Test 3: Check if rules are retrieved correctly
        console.log('\n3. Testing rule retrieval...');
        const rules = await autonomousTrading.getActiveRules(testUserId);
        console.log(`Found ${rules.length} active autonomous strategy rules`);
        rules.forEach(rule => {
            console.log(`- Rule: ${rule.name} (ID: ${rule.id}, Type: ${rule.type})`);
            console.log(`  Conditions:`, rule.conditions);
        });
        
        // Test 4: Test rule engine evaluation
        console.log('\n4. Testing rule engine evaluation...');
        if (rules.length > 0) {
            const testRule = rules[0];
            console.log(`Testing rule: ${testRule.name}`);
            
            // Test with a sample token address (SOL)
            const testTokenAddress = 'So11111111111111111111111111111111111111112';
            const evaluation = await ruleEngine.evaluateRule(testRule.id, testTokenAddress);
            console.log('Rule evaluation result:', evaluation);
        }
        
        // Test 5: Test portfolio value calculation
        console.log('\n5. Testing portfolio value calculation...');
        const portfolio = await autonomousTrading.getPortfolioValue();
        console.log('Portfolio value:', portfolio);
        
        console.log('\n✅ All tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testAutonomousRules().catch(console.error); 