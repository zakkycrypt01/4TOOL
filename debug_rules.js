const DatabaseManager = require('./src/modules/database');

async function debugRules() {
    const db = new DatabaseManager();
    
    console.log('=== All Rules ===');
    const allRules = await db.db.prepare('SELECT id, user_id, name, type, is_active FROM rules ORDER BY user_id, id').all();
    console.table(allRules);
    
    console.log('\n=== User 5 Rules ===');
    const user5Rules = await db.getRulesByUserId(5);
    console.table(user5Rules);
    
    console.log('\n=== Active Manual Management Rules ===');
    const activeManualRules = await db.db.prepare(`
        SELECT id, user_id, name, type, is_active 
        FROM rules 
        WHERE type = 'manual_management' AND is_active = 1
        ORDER BY user_id, id
    `).all();
    console.table(activeManualRules);
    
    console.log('\n=== Rule Conditions for Manual Management Rules ===');
    for (const rule of activeManualRules) {
        console.log(`\nRule ${rule.id} (${rule.name}) conditions:`);
        const conditions = await db.getRuleConditions(rule.id);
        console.table(conditions);
    }
    
    process.exit(0);
}

debugRules().catch(console.error);
