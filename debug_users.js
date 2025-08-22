const DatabaseManager = require('./src/modules/database');

async function debugUsers() {
    const db = new DatabaseManager();
    
    console.log('=== All Users with Active Wallets ===');
    const users = await db.db.prepare(`
        SELECT DISTINCT u.* FROM users u 
        INNER JOIN wallets w ON u.id = w.user_id 
        WHERE w.is_active = 1
    `).all();
    console.table(users);
    
    console.log('\n=== All Rules by User ===');
    for (const user of users) {
        console.log(`\n--- User ${user.id} (${user.telegram_id || 'No telegram_id'}) ---`);
        const allRules = await db.getRulesByUserId(user.id);
        const manualRules = allRules.filter(rule => rule.type === 'manual_management' && rule.is_active === 1);
        
        console.log(`Total rules: ${allRules.length}`);
        console.log(`Manual management rules: ${manualRules.length}`);
        console.log(`Active manual management rules: ${manualRules.filter(r => r.is_active === 1).length}`);
        
        if (manualRules.length > 0) {
            console.table(manualRules.map(r => ({
                id: r.id,
                name: r.name,
                type: r.type,
                is_active: r.is_active
            })));
        }
    }
    
    console.log('\n=== Users Summary ===');
    const summary = [];
    for (const user of users) {
        const allRules = await db.getRulesByUserId(user.id);
        const manualRules = allRules.filter(rule => rule.type === 'manual_management' && rule.is_active === 1);
        summary.push({
            user_id: user.id,
            telegram_id: user.telegram_id,
            total_rules: allRules.length,
            manual_management_rules: manualRules.length
        });
    }
    console.table(summary);
    
    process.exit(0);
}

debugUsers().catch(console.error);
