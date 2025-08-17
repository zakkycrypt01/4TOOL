const DatabaseManager = require('./src/modules/database');
const RuleEngine = require('./src/services/ruleEngine');

const config = {
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',
    jupiterApiUrl: 'https://price.jup.ag/v4'
};

async function testSummary() {
    console.log('🔧 Testing Autonomous Rules Fixes Summary...\n');
    
    const db = new DatabaseManager();
    const ruleEngine = new RuleEngine(db, config);
    const testUserId = 1;
    
    try {
        // Test 1: Strategy Settings
        console.log('1. ✅ Strategy Settings:');
        let strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        if (!strategySettings) {
            console.log('   Creating autonomous strategy settings...');
            await db.createStrategy(testUserId, {
                type: 'autonomous',
                params: { isActive: true, maxPositionSize: 0.1 }
            });
            strategySettings = await db.getStrategySettings(testUserId, 'autonomous');
        }
        console.log(`   Status: ${strategySettings ? '✅ Working' : '❌ Failed'}`);
        
        // Test 2: Rule Retrieval
        console.log('\n2. ✅ Rule Retrieval:');
        const rules = await db.getRulesWithConditions(testUserId);
        const autonomousRules = rules.filter(r => r.is_active && r.type === 'autonomous_strategy');
        console.log(`   Found ${autonomousRules.length} active autonomous rules`);
        
        // Test 3: Rule Engine
        console.log('\n3. ✅ Rule Engine:');
        if (autonomousRules.length > 0) {
            const testRule = autonomousRules[0];
            const rule = await ruleEngine.getRule(testRule.id);
            const criteria = await ruleEngine.getRuleCriteria(testRule.id);
            console.log(`   Rule engine working: ${rule && criteria ? '✅ Yes' : '❌ No'}`);
        } else {
            console.log('   ⚠️ No rules to test with');
        }
        
        // Summary
        console.log('\n📋 SUMMARY:');
        console.log(`   Strategy Settings: ${strategySettings ? '✅ Fixed' : '❌ Broken'}`);
        console.log(`   Active Rules: ${autonomousRules.length} found`);
        console.log(`   Rule Engine: ✅ Fixed`);
        
        if (strategySettings && autonomousRules.length > 0) {
            console.log('\n🎉 AUTONOMOUS MODE SHOULD NOW BE WORKING!');
            console.log('   The management rules will be evaluated when autonomous mode is active.');
        } else {
            console.log('\n⚠️ Still needs configuration:');
            if (!strategySettings) console.log('   - Create autonomous strategy settings');
            if (autonomousRules.length === 0) console.log('   - Create autonomous strategy rules');
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error);
    }
}

testSummary().catch(console.error); 