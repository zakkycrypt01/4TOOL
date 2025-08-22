const DatabaseManager = require('./src/modules/database');

async function testRuleLoadingComplete() {
    const db = new DatabaseManager();
    
    console.log('=== Testing Complete Rule Loading Logic ===\n');
    
    // Get all users
    const users = await db.db.prepare(`
        SELECT DISTINCT u.* FROM users u 
        INNER JOIN wallets w ON u.id = w.user_id 
        WHERE w.is_active = 1
    `).all();
    
    console.log(`Found ${users.length} users with active wallets`);
    
    for (const user of users) {
        const rules = await db.getRulesByUserId(user.id);
        
        // Filter for both manual_management rules and autonomous_strategy rules with management conditions
        const rulesWithManagement = [];
        
        for (const rule of rules) {
            if (!rule.is_active) continue;
            
            if (rule.type === 'manual_management') {
                rulesWithManagement.push({...rule, hasManagement: true, managementType: 'manual'});
            } else if (rule.type === 'autonomous_strategy') {
                // Check if this autonomous rule has management conditions
                const conditions = await db.getRuleConditions(rule.id);
                const hasManagement = conditions.some(c => 
                    c.condition_type.startsWith('management_'));
                
                if (hasManagement) {
                    rulesWithManagement.push({...rule, hasManagement: true, managementType: 'autonomous'});
                }
            }
        }

        console.log(`User ${user.id}: Found ${rulesWithManagement.length} active rules with management conditions`);

        for (const rule of rulesWithManagement) {
            const conditions = await db.getRuleConditions(rule.id);
            
            // Parse conditions
            const manualConditions = {};
            for (const condition of conditions) {
                try {
                    const value = JSON.parse(condition.condition_value);
                    
                    switch (condition.condition_type) {
                        case 'manual_take_profit':
                        case 'management_take_profit':
                            manualConditions.takeProfit = value.percentage;
                            break;
                        case 'manual_stop_loss':
                        case 'management_stop_loss':
                            manualConditions.stopLoss = value.percentage;
                            break;
                        case 'manual_trailing_stop':
                        case 'management_trailing_stop':
                            manualConditions.trailingStop = value.percentage;
                            break;
                    }
                } catch (error) {
                    console.log(`  ERROR: Failed to parse condition for rule ${rule.id}:`, error.message);
                }
            }
            
            if (Object.keys(manualConditions).length > 0) {
                console.log(`  Rule ${rule.id} (${rule.type}): ${JSON.stringify(manualConditions)}`);
            } else {
                console.log(`  Rule ${rule.id} (${rule.type}): No valid management conditions found`);
            }
        }
        
        if (rulesWithManagement.length === 0) {
            console.log(`  No rules with management conditions`);
        }
    }
    
    process.exit(0);
}

testRuleLoadingComplete().catch(console.error);
