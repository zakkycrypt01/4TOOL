const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

async function runMigration() {
    console.log('🚀 Running Database Migration\n');
    
    const dbPath = path.join(__dirname, 'db/4tool.db');
    
    try {
        // Open database
        const db = new Database(dbPath);
        console.log('✅ Database connection successful');
        
        // Create tables first
        console.log('🔧 Creating tables...');
        
        // Create auto_sell_history table
        db.exec(`
            CREATE TABLE IF NOT EXISTS auto_sell_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                rule_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                token_address TEXT NOT NULL,
                amount REAL NOT NULL,
                signature TEXT,
                error_message TEXT,
                status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'pending')),
                executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ auto_sell_history table created');
        
        // Create autonomous_rate_limits table
        db.exec(`
            CREATE TABLE IF NOT EXISTS autonomous_rate_limits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL UNIQUE,
                buy_count INTEGER DEFAULT 0,
                last_buy_time TIMESTAMP,
                reset_time TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        console.log('✅ autonomous_rate_limits table created');
        
        // Create indexes
        console.log('🔧 Creating indexes...');
        
        db.exec(`
            CREATE INDEX IF NOT EXISTS idx_auto_sell_history_rule_id ON auto_sell_history(rule_id);
            CREATE INDEX IF NOT EXISTS idx_auto_sell_history_user_id ON auto_sell_history(user_id);
            CREATE INDEX IF NOT EXISTS idx_auto_sell_history_status ON auto_sell_history(status);
            CREATE INDEX IF NOT EXISTS idx_auto_sell_history_executed_at ON auto_sell_history(executed_at);
            CREATE INDEX IF NOT EXISTS idx_autonomous_rate_limits_user_id ON autonomous_rate_limits(user_id);
            CREATE INDEX IF NOT EXISTS idx_autonomous_rate_limits_reset_time ON autonomous_rate_limits(reset_time);
        `);
        console.log('✅ Indexes created');
        
        // Verify tables were created
        console.log('\n🔍 Verifying migration results...');
        
        const tables = ['auto_sell_history', 'autonomous_rate_limits'];
        
        for (const tableName of tables) {
            const tableExists = db.prepare(`
                SELECT name FROM sqlite_master 
                WHERE type='table' AND name=?
            `).get(tableName);
            
            if (tableExists) {
                console.log(`✅ Table '${tableName}' created successfully`);
                
                // Show table structure
                const tableInfo = db.prepare(`PRAGMA table_info(${tableName})`).all();
                console.log(`   Columns: ${tableInfo.map(col => col.name).join(', ')}`);
            } else {
                console.log(`❌ Table '${tableName}' was not created`);
            }
        }
        
        // Test inserting sample data
        console.log('\n🧪 Testing table functionality...');
        
        try {
            // Test auto_sell_history
            const insertStmt = db.prepare(`
                INSERT INTO auto_sell_history (rule_id, user_id, token_address, amount, status)
                VALUES (?, ?, ?, ?, ?)
            `);
            
            const result = insertStmt.run(1, 1, 'TestToken123', 100.0, 'pending');
            console.log(`✅ Sample auto-sell record inserted with ID: ${result.lastInsertRowid}`);
            
            // Test autonomous_rate_limits
            const rateLimitStmt = db.prepare(`
                INSERT OR REPLACE INTO autonomous_rate_limits (user_id, buy_count, reset_time)
                VALUES (?, ?, ?)
            `);
            
            const resetTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();
            const rateResult = rateLimitStmt.run(1, 0, resetTime);
            console.log(`✅ Sample rate limit record inserted/updated for user: 1`);
            
            // Clean up test data
            db.prepare('DELETE FROM auto_sell_history WHERE token_address = ?').run('TestToken123');
            console.log('🧹 Test data cleaned up');
            
        } catch (insertError) {
            console.error('❌ Error testing table functionality:', insertError.message);
        }
        
        // Close database
        db.close();
        console.log('\n🎉 Migration completed successfully!');
        
    } catch (error) {
        console.error('❌ Migration failed:', error.message);
        process.exit(1);
    }
}

// Run the migration
runMigration().catch(error => {
    console.error('❌ Migration failed:', error);
    process.exit(1);
}); 