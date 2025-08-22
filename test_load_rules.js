const ManualManagementService = require('./src/services/manualManagementService');
const DatabaseManager = require('./src/modules/database');

async function testLoadRules() {
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
    
    console.log('Testing loadActiveManualManagementRules...\n');
    await service.loadActiveManualManagementRules();
    
    process.exit(0);
}

testLoadRules().catch(console.error);
