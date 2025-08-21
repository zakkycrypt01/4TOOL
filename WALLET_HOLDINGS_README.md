# Wallet Holdings Service Documentation

The Wallet Holdings Service provides comprehensive portfolio tracking for Solana wallets with detailed token information, real-time prices, and portfolio analysis.

## Features

- ✅ **Complete Portfolio Overview**: Get all SOL and SPL token holdings
- ✅ **Real-time Prices**: Fetch current prices from Raydium DEX
- ✅ **Token Metadata**: Automatic token symbol, name, and logo resolution
- ✅ **Portfolio Analysis**: Risk assessment and diversification analysis
- ✅ **Caching System**: Efficient caching for improved performance
- ✅ **Fallback Support**: Multiple fallback mechanisms for reliability
- ✅ **Express API**: Ready-to-use REST API endpoints

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Setup

Create a `.env` file with:

```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
WALLET_API_PORT=3001
```

### 3. Test the Service

```bash
# Test basic functionality
npm run test:wallet

# Test with a specific wallet address
npm run test:wallet YOUR_WALLET_ADDRESS_HERE
```

### 4. Start the API Server

```bash
# Production
npm run wallet-api

# Development with auto-reload
npm run wallet-api:dev
```

## API Endpoints

### Get All Holdings

```http
GET /api/wallet/{address}/holdings
```

**Query Parameters:**
- `includeZero` (boolean): Include zero balance tokens (default: false)
- `minValue` (number): Minimum USD value filter (default: 0)
- `sortBy` (string): Sort by value/symbol/balance (default: value)

**Example:**
```bash
curl "http://localhost:3001/api/wallet/YOUR_WALLET/holdings?minValue=1&sortBy=value"
```

**Response:**
```json
{
  "success": true,
  "data": {
    "wallet": "YOUR_WALLET_ADDRESS",
    "totalHoldings": 5,
    "totalValue": {
      "usd": 1234.56,
      "formatted": "$1,234.56"
    },
    "holdings": [
      {
        "mint": "So11111111111111111111111111111111111111112",
        "symbol": "SOL",
        "name": "Solana",
        "balance": 10.5,
        "decimals": 9,
        "isNative": true,
        "price": {
          "usd": 150.25,
          "usd_24h_change": 2.5,
          "source": "raydium-price"
        },
        "value": {
          "usd": 1577.63,
          "formatted": "$1,577.63"
        },
        "metadata": {
          "verified": true,
          "source": "native"
        }
      }
    ],
    "timestamp": "2025-08-21T10:30:00.000Z"
  }
}
```

### Get Specific Token Balance

```http
GET /api/wallet/{address}/balance/{token}
```

**Examples:**
```bash
# Get SOL balance
curl "http://localhost:3001/api/wallet/YOUR_WALLET/balance/sol"

# Get USDC balance
curl "http://localhost:3001/api/wallet/YOUR_WALLET/balance/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
```

### Health Check

```http
GET /api/health
```

### Clear Cache

```http
POST /api/cache/clear
```

## Using in Your Code

### Basic Usage

```javascript
const WalletHoldingsService = require('./src/services/walletHoldingsService');

const config = {
    rpcEndpoint: 'https://api.mainnet-beta.solana.com'
};

const holdingsService = new WalletHoldingsService(config);

async function getPortfolio(walletAddress) {
    try {
        const holdings = await holdingsService.getAllHoldings(walletAddress);
        console.log(`Total Value: ${holdings.totalValue.formatted}`);
        
        holdings.holdings.forEach(token => {
            console.log(`${token.symbol}: ${token.balance} (${token.value.formatted})`);
        });
    } catch (error) {
        console.error('Error:', error.message);
    }
}
```

### Enhanced Portfolio Service

```javascript
const PortfolioService = require('./src/services/portfolioService');

const portfolioService = new PortfolioService(config);

async function analyzePortfolio(walletAddress) {
    try {
        // Get enhanced analysis
        const analysis = await portfolioService.getPortfolioAnalysis(walletAddress);
        
        console.log('Portfolio Distribution:', analysis.analysis.distribution);
        console.log('Risk Profile:', analysis.analysis.riskProfile);
        console.log('Recommendations:', analysis.analysis.recommendations);
    } catch (error) {
        console.error('Error:', error.message);
    }
}
```

## Integration with Existing Services

The new Wallet Holdings Service integrates seamlessly with your existing portfolio service:

```javascript
// Enhanced getWalletBalance method with fallback
const balance = await portfolioService.getWalletBalance(walletAddress);

// Returns enhanced data:
// {
//   lamports: 10500000000,
//   sol: 10.5,
//   tokens: [...],
//   totalValue: 1234.56,
//   totalHoldings: 5,
//   enhanced: true  // indicates using new service
// }
```

## Configuration Options

```javascript
const config = {
    rpcEndpoint: 'https://api.mainnet-beta.solana.com',  // Custom RPC endpoint
    // Additional Solana connection options can be added here
};
```

## Error Handling

The service includes comprehensive error handling with fallbacks:

1. **Token List Fallback**: If Raydium API fails, returns essential tokens (SOL, USDC, USDT)
2. **Price Fallback**: Multiple price sources with reasonable fallback prices
3. **Metadata Fallback**: On-chain metadata parsing when token lists are incomplete
4. **Connection Fallback**: The enhanced portfolio service falls back to legacy methods

## Caching Strategy

- **Token List Cache**: 5 minutes
- **Price Cache**: 5 minutes  
- **Automatic Cache Management**: Caches are automatically invalidated and refreshed

## Performance Notes

- **Batch Processing**: Efficiently processes multiple tokens in parallel
- **Smart Filtering**: Automatically filters dust amounts and zero balances
- **Optimized API Calls**: Minimizes external API calls through intelligent caching

## Supported Tokens

- **Native SOL**: Full support with real-time pricing
- **Major Stablecoins**: USDC, USDT with verified metadata
- **Raydium Listed Tokens**: All tokens available on Raydium DEX
- **Unknown Tokens**: Basic support with on-chain metadata parsing

## Future Enhancements

Planned features for future releases:

- [ ] Multiple DEX price aggregation (Jupiter, Orca, etc.)
- [ ] Historical portfolio tracking
- [ ] Advanced portfolio metrics (Sharpe ratio, etc.)
- [ ] Token performance analytics
- [ ] Automated portfolio rebalancing recommendations
- [ ] Integration with more metadata sources

## Troubleshooting

### Common Issues

1. **RPC Rate Limits**: Use a premium RPC endpoint for high-volume usage
2. **Token Not Found**: Some tokens may not have metadata - this is normal
3. **Price Not Available**: Not all tokens have active trading pairs on Raydium

### Debug Mode

Set environment variable for detailed logging:
```bash
NODE_ENV=development npm run wallet-api
```

## License

This project is part of the 4TOOL trading bot system.
