const DatabaseManager = require('./src/modules/database');

async function debugAutonomousRules() {
    const db = new DatabaseManager();
    
    console.log('=== All Autonomous Strategy Rules ===');
    const autonomousRules = await db.db.prepare(`
        SELECT id, user_id, name, type, is_active 
        FROM rules 
        WHERE type = 'autonomous_strategy' AND is_active = 1
        ORDER BY user_id, id
    `).all();
    console.table(autonomousRules);
    
    console.log('\n=== Conditions for Autonomous Rules ===');
    for (const rule of autonomousRules) {
        console.log(`\nRule ${rule.id} (${rule.name}) - User ${rule.user_id}:`);
        const conditions = await db.getRuleConditions(rule.id);
        console.table(conditions);
        
        // Check for management-related conditions
        const managementConditions = conditions.filter(c => 
            c.condition_type.includes('take_profit') || 
            c.condition_type.includes('stop_loss') || 
            c.condition_type.includes('trailing') ||
            c.condition_type.includes('management')
        );
        
        if (managementConditions.length > 0) {
            console.log(`  ✅ Has ${managementConditions.length} management conditions`);
        } else {
            console.log(`  ❌ No management conditions found`);
        }
    }
    
    console.log('\n=== All Rule Conditions (searching for management patterns) ===');
    const allConditions = await db.db.prepare(`
        SELECT rc.*, r.name as rule_name, r.type as rule_type, r.user_id
        FROM rule_conditions rc
        JOIN rules r ON rc.rule_id = r.id
        WHERE r.is_active = 1
        ORDER BY r.user_id, r.id
    `).all();
    
    const managementConditions = allConditions.filter(c => 
        c.condition_type.includes('take_profit') || 
        c.condition_type.includes('stop_loss') || 
        c.condition_type.includes('trailing') ||
        c.condition_type.includes('management') ||
        c.condition_value.includes('take_profit') ||
        c.condition_value.includes('stop_loss') ||
        c.condition_value.includes('trailing')
    );
    
    console.log(`Found ${managementConditions.length} management-related conditions:`);
    console.table(managementConditions);
    
    process.exit(0);
}

debugAutonomousRules().catch(console.error);
