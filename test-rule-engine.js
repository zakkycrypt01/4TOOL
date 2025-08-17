const DatabaseManager = require('./src/modules/database');
const RuleEngine = require('./src/services/ruleEngine');

// Simple config object for testing
const config = {
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    jupiterApiUrl: 'https://price.jup.ag/v4'
};

async function testRuleEngine() {
    console.log('Testing RuleEngine fixes...');
    
    const db = new DatabaseManager();
    const ruleEngine = new RuleEngine(db, config);
    
    // Test user ID
    const testUserId = 1;
    
    try {
        // Test 1: Check if we can get rules with conditions
        console.log('\n1. Testing rule retrieval...');
        const rules = await db.getRulesWithConditions(testUserId);
        console.log(`Found ${rules.length} total rules for user ${testUserId}`);
        
        const autonomousRules = rules.filter(r => r.is_active && r.type === 'autonomous_strategy');
        console.log(`Found ${autonomousRules.length} active autonomous strategy rules`);
        
        autonomousRules.forEach(rule => {
            console.log(`- Rule: ${rule.name} (ID: ${rule.id}, Type: ${rule.type})`);
            console.log(`  Conditions:`, rule.conditions);
        });
        
        // Test 2: Test rule engine database methods
        console.log('\n2. Testing rule engine database methods...');
        if (autonomousRules.length > 0) {
            const testRule = autonomousRules[0];
            console.log(`Testing with rule: ${testRule.name} (ID: ${testRule.id})`);
            
            // Test getRule method
            const rule = await ruleEngine.getRule(testRule.id);
            console.log('getRule result:', rule);
            
            // Test getRuleCriteria method
            const criteria = await ruleEngine.getRuleCriteria(testRule.id);
            console.log('getRuleCriteria result:', criteria);
            
            // Test 3: Test rule evaluation (without token data service)
            console.log('\n3. Testing rule evaluation...');
            try {
                const evaluation = await ruleEngine.evaluateRule(testRule.id, 'So11111111111111111111111111111111111111112');
                console.log('Rule evaluation result:', evaluation);
            } catch (evalError) {
                console.log('Rule evaluation error (expected if token data service is not available):', evalError.message);
            }
        } else {
            console.log('No autonomous rules found to test with');
        }
        
        // Test 4: Test strategy settings
        console.log('\n4. Testing strategy settings...');
        const strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        console.log('Strategy settings:', strategySettings);
        
        console.log('\n✅ RuleEngine tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testRuleEngine().catch(console.error); 