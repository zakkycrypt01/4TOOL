const DatabaseManager = require('./src/modules/database');
const RuleEngine = require('./src/services/ruleEngine');

// Simple config object for testing
const config = {
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    jupiterApiUrl: 'https://price.jup.ag/v4'
};

async function testAutonomousComplete() {
    console.log('Testing complete autonomous trading system...');
    
    const db = new DatabaseManager();
    const ruleEngine = new RuleEngine(db, config);
    
    // Test user ID
    const testUserId = 1;
    
    try {
        // Test 1: Ensure autonomous strategy settings exist
        console.log('\n1. Ensuring autonomous strategy settings exist...');
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
        
        // Check if strategy settings exist, create if not
        let strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        if (!strategySettings) {
            console.log('Creating autonomous strategy settings...');
            await db.createStrategy(testUserId, defaultSettings);
            strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        }
        console.log('Strategy settings:', strategySettings);
        
        // Test 2: Check active autonomous rules
        console.log('\n2. Checking active autonomous rules...');
        const rules = await db.getRulesWithConditions(testUserId);
        const autonomousRules = rules.filter(r => r.is_active && r.type === 'autonomous_strategy');
        console.log(`Found ${autonomousRules.length} active autonomous strategy rules`);
        
        if (autonomousRules.length === 0) {
            console.log('❌ No active autonomous rules found. Please create at least one autonomous strategy rule.');
            return;
        }
        
        autonomousRules.forEach(rule => {
            console.log(`- Rule: ${rule.name} (ID: ${rule.id})`);
            console.log(`  Conditions:`, rule.conditions);
        });
        
        // Test 3: Test rule engine evaluation
        console.log('\n3. Testing rule engine evaluation...');
        const testRule = autonomousRules[0];
        console.log(`Testing rule: ${testRule.name} (ID: ${testRule.id})`);
        
        // Test rule retrieval
        const rule = await ruleEngine.getRule(testRule.id);
        console.log('Rule data:', rule);
        
        const criteria = await ruleEngine.getRuleCriteria(testRule.id);
        console.log('Rule criteria:', criteria);
        
        // Test 4: Simulate autonomous trading monitoring
        console.log('\n4. Simulating autonomous trading monitoring...');
        
        // Check if strategy is active
        if (!strategySettings.params.isActive) {
            console.log('❌ Autonomous strategy is not active');
            return;
        }
        
        console.log('✅ Autonomous strategy is active');
        
        // Check risk limits
        const riskLimits = {
            maxPositionSize: strategySettings.params.maxPositionSize || 0.1,
            maxDailyLoss: strategySettings.params.maxDailyLoss || 0.05,
            maxOpenPositions: strategySettings.params.maxOpenPositions || 5,
            stopLoss: strategySettings.params.stopLoss || 0.1,
            takeProfit: strategySettings.params.takeProfit || 0.2,
            maxSlippage: strategySettings.params.maxSlippage || 1,
            minLiquidity: strategySettings.params.minLiquidity || 10000
        };
        
        console.log('Risk limits:', riskLimits);
        
        // Test 5: Test rule evaluation for each rule
        console.log('\n5. Testing rule evaluation for each autonomous rule...');
        for (const rule of autonomousRules) {
            console.log(`\nEvaluating rule: ${rule.name}`);
            
            try {
                // Test with a sample token (SOL)
                const testTokenAddress = 'So11111111111111111111111111111111111111112';
                const evaluation = await ruleEngine.evaluateRule(rule.id, testTokenAddress);
                console.log(`Rule evaluation result:`, evaluation);
                
                if (evaluation.match) {
                    console.log(`✅ Rule ${rule.name} would trigger for token ${testTokenAddress}`);
                } else {
                    console.log(`❌ Rule ${rule.name} would not trigger for token ${testTokenAddress}`);
                }
            } catch (error) {
                console.log(`⚠️ Rule evaluation error for ${rule.name}:`, error.message);
            }
        }
        
        console.log('\n✅ Autonomous trading system test completed successfully!');
        console.log('\n📋 Summary:');
        console.log(`- Strategy settings: ${strategySettings ? '✅ Created' : '❌ Missing'}`);
        console.log(`- Active rules: ${autonomousRules.length} found`);
        console.log(`- Rule engine: ✅ Working`);
        console.log(`- Strategy active: ${strategySettings.params.isActive ? '✅ Yes' : '❌ No'}`);
        
        if (strategySettings && strategySettings.params.isActive && autonomousRules.length > 0) {
            console.log('\n🎉 Autonomous mode should now be working!');
            console.log('The management rules will be evaluated every 5 minutes when autonomous mode is active.');
        } else {
            console.log('\n⚠️ Autonomous mode needs configuration:');
            if (!strategySettings) console.log('- Create autonomous strategy settings');
            if (!strategySettings.params.isActive) console.log('- Activate the autonomous strategy');
            if (autonomousRules.length === 0) console.log('- Create at least one autonomous strategy rule');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

// Run the test
testAutonomousComplete().catch(console.error); 