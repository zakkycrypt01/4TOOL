const ManualManagementService = require('./src/services/manualManagementService');
const DatabaseManager = require('./src/modules/database');

async function testFullLoadRules() {
    const db = new DatabaseManager();
    
    // Create a mock logger that shows all output
    const logger = {
        info: (...args) => console.log('INFO:', ...args),
        warn: (...args) => console.log('WARN:', ...args),
        error: (...args) => console.log('ERROR:', ...args)
    };
    
    // Create minimal config
    const config = {
        rpcEndpoint: 'https://api.mainnet-beta.solana.com'
    };
    
    const service = new ManualManagementService(config, db, null, null);
    service.logger = logger; // Override logger
    
    // Override addTokensToMonitoring to avoid external API calls during testing
    const originalAddTokens = service.addTokensToMonitoring;
    service.addTokensToMonitoring = async (userId, ruleId, walletAddress, conditions) => {
        console.log(`INFO: Would add tokens to monitoring for user ${userId}, rule ${ruleId}, wallet ${walletAddress}`);
        console.log(`INFO: Management conditions:`, conditions);
        return Promise.resolve();
    };
    
    console.log('Testing loadActiveManualManagementRules with both manual and autonomous rules...\n');
    await service.loadActiveManualManagementRules();
    
    process.exit(0);
}

testFullLoadRules().catch(console.error);
