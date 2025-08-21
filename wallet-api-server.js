require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WalletHoldingsAPI = require('./src/handlers/walletHoldingsHandlers');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    next();
});

// Configuration
const config = {
    rpcEndpoint: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com'
};

// Initialize wallet holdings API
const walletHoldingsAPI = new WalletHoldingsAPI(config);

// Mount the wallet holdings routes
app.use('/api', walletHoldingsAPI.getRouter());

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        success: true,
        message: 'Wallet Holdings API Server',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            walletHoldings: '/api/wallet/:address/holdings',
            tokenBalance: '/api/wallet/:address/balance/:token',
            clearCache: '/api/cache/clear'
        },
        documentation: {
            walletHoldings: {
                method: 'GET',
                path: '/api/wallet/:address/holdings',
                description: 'Get all token holdings for a wallet',
                queryParams: {
                    includeZero: 'boolean - Include zero balance tokens (default: false)',
                    minValue: 'number - Minimum USD value filter (default: 0)',
                    sortBy: 'string - Sort by: value, symbol, balance (default: value)'
                }
            },
            tokenBalance: {
                method: 'GET', 
                path: '/api/wallet/:address/balance/:token',
                description: 'Get balance for a specific token. Use "sol" or SOL mint address for SOL'
            }
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    console.error('Unhandled error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
    });
});

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `The endpoint ${req.method} ${req.originalUrl} was not found`
    });
});

// Start server
const PORT = process.env.WALLET_API_PORT || process.env.PORT || 3001;

app.listen(PORT, () => {
    console.log('🚀 Wallet Holdings API Server Started');
    console.log(`📍 Server running on: http://localhost:${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`💼 Holdings endpoint: http://localhost:${PORT}/api/wallet/{address}/holdings`);
    console.log(`🏦 Token balance endpoint: http://localhost:${PORT}/api/wallet/{address}/balance/{token}`);
    console.log(`📚 API Documentation: http://localhost:${PORT}/`);
    console.log('');
    console.log('Example usage:');
    console.log(`curl "http://localhost:${PORT}/api/wallet/YOUR_WALLET_ADDRESS/holdings"`);
    console.log(`curl "http://localhost:${PORT}/api/wallet/YOUR_WALLET_ADDRESS/balance/sol"`);
});

module.exports = app;
