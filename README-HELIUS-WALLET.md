# Helius Wallet Service

A comprehensive Solana wallet holdings service built using the Helius RPC API. This service provides easy access to wallet assets, fungible tokens, native SOL balances, and comprehensive wallet summaries.

## Features

- 🔍 **Wallet Asset Discovery**: Fetch all assets from any Solana wallet
- 🪙 **Fungible Token Filtering**: Get only fungible tokens (exclude NFTs)
- 💰 **Native SOL Balance**: Retrieve native SOL balance
- 📊 **Comprehensive Summaries**: Get detailed wallet overviews
- ⚡ **Smart Caching**: Built-in caching for improved performance
- 🛡️ **Address Validation**: Validate Solana wallet addresses
- 📝 **Comprehensive Logging**: Winston-based logging system
- 🎯 **Flexible Options**: Customizable display and filtering options

## Installation

The service is already integrated into your project. Make sure you have the required dependencies:

```bash
npm install
```

## Configuration

### Environment Variables

Set your Helius API key in your environment:

```bash
export HELIUS_API_KEY="your-helius-api-key-here"
```

Or use the default API key provided in the code.

### Service Configuration

```javascript
const HeliusWalletService = require('./src/services/heliusWalletService');

const walletService = new HeliusWalletService({
    apiKey: 'your-api-key', // Optional, defaults to env var or default key
    // Additional configuration options can be added here
});
```

## Usage

### Basic Usage

```javascript
const HeliusWalletService = require('./src/services/heliusWalletService');

async function main() {
    const walletService = new HeliusWalletService();
    
    // Get all wallet assets
    const assets = await walletService.getWalletAssets('oQPnhXAbLbMuKHESaGrbXT17CyvWCpLyERSJA9HCYd7');
    console.log('Total items:', assets.totalItems);
    console.log('Native SOL:', assets.nativeBalance / 1e9);
}

main().catch(console.error);
```

### Get Fungible Tokens Only

```javascript
// Get only fungible tokens (exclude NFTs)
const fungibleTokens = await walletService.getFungibleTokens(walletAddress);
console.log('Fungible tokens:', fungibleTokens.totalTokens);
```

### Get Native SOL Balance

```javascript
// Get native SOL balance
const nativeBalance = await walletService.getNativeBalance(walletAddress);
console.log('SOL Balance:', nativeBalance.nativeBalance / 1e9);
```

### Get Comprehensive Summary

```javascript
// Get comprehensive wallet summary
const summary = await walletService.getWalletSummary(walletAddress);
console.log('Summary:', summary.summary);
```

## API Methods

### `getWalletAssets(ownerAddress, options)`

Fetches all wallet assets with customizable options.

**Parameters:**
- `ownerAddress` (string): Solana wallet address
- `options` (object): Display options
  - `showFungible` (boolean): Show fungible tokens (default: true)
  - `showNativeBalance` (boolean): Show native SOL balance (default: true)
  - `showUnverifiedCollections` (boolean): Show unverified collections (default: false)
  - `showZeroBalance` (boolean): Show zero balance tokens (default: false)

**Returns:** Promise with wallet assets data

### `getFungibleTokens(ownerAddress)`

Fetches only fungible tokens from a wallet.

**Parameters:**
- `ownerAddress` (string): Solana wallet address

**Returns:** Promise with fungible tokens data

### `getNativeBalance(ownerAddress)`

Fetches native SOL balance.

**Parameters:**
- `ownerAddress` (string): Solana wallet address

**Returns:** Promise with native balance data

### `getWalletSummary(ownerAddress)`

Fetches comprehensive wallet summary including all data.

**Parameters:**
- `ownerAddress` (string): Solana wallet address

**Returns:** Promise with complete wallet summary

### `clearCache(walletAddress)`

Clears cache for specific wallet or all wallets.

**Parameters:**
- `walletAddress` (string, optional): Specific wallet address or null for all

### `getCacheStats()`

Returns cache statistics.

**Returns:** Cache statistics object

## Command Line Interface

### Interactive Mode

Run the CLI tool for interactive wallet queries:

```bash
node wallet-cli.js
```

### Direct Query Mode

Query a specific wallet directly:

```bash
node wallet-cli.js oQPnhXAbLbMuKHESaGrbXT17CyvWCpLyERSJA9HCYd7
```

### CLI Commands

1. **Query wallet assets** - Get all assets from a wallet
2. **Get fungible tokens only** - Filter to show only fungible tokens
3. **Get native SOL balance** - Show native SOL balance
4. **Get comprehensive summary** - Complete wallet overview
5. **Clear cache** - Clear cached data
6. **Show cache stats** - Display cache statistics
7. **Exit** - Close the CLI

## Testing

Run the test script to verify the service:

```bash
node test-helius-wallet.js
```

This will test all major functionality with the example wallet address.

## Logging

The service uses Winston for logging with the following transports:
- File logging: `logs/helius-wallet-error.log` and `logs/helius-wallet-combined.log`
- Console logging: Enabled in development mode

## Caching

The service includes a 5-minute cache to improve performance and reduce API calls. Cache can be managed using:
- `clearCache()` - Clear specific or all cached data
- `getCacheStats()` - View cache statistics

## Error Handling

The service includes comprehensive error handling:
- Invalid wallet address validation
- API error handling
- Network error handling
- Graceful fallbacks

## Example Response Format

### Wallet Assets Response

```json
{
  "items": [...],
  "nativeBalance": 1000000000,
  "totalItems": 5,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Fungible Tokens Response

```json
{
  "ownerAddress": "oQPnhXAbLbMuKHESaGrbXT17CyvWCpLyERSJA9HCYd7",
  "fungibleTokens": [...],
  "totalTokens": 3,
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Wallet Summary Response

```json
{
  "ownerAddress": "oQPnhXAbLbMuKHESaGrbXT17CyvWCpLyERSJA9HCYd7",
  "summary": {
    "nativeBalance": 1000000000,
    "fungibleTokenCount": 3,
    "totalEstimatedValue": 100.50,
    "lastUpdated": "2024-01-01T00:00:00.000Z"
  },
  "details": {
    "nativeBalance": {...},
    "fungibleTokens": {...}
  }
}
```

## Integration

This service can be easily integrated into your existing trading bot or other applications:

```javascript
// In your main application
const HeliusWalletService = require('./src/services/heliusWalletService');

class TradingBot {
    constructor() {
        this.walletService = new HeliusWalletService();
    }
    
    async checkWalletBalance(walletAddress) {
        const summary = await this.walletService.getWalletSummary(walletAddress);
        return summary.summary;
    }
}
```

## Performance Considerations

- **Caching**: 5-minute cache reduces API calls
- **Batch Operations**: Use `getWalletSummary()` for comprehensive data
- **Error Handling**: Graceful fallbacks prevent crashes
- **Logging**: Structured logging for monitoring

## Security

- API keys can be configured via environment variables
- Input validation for wallet addresses
- No sensitive data logging
- Secure error handling

## Support

For issues or questions:
1. Check the logs in the `logs/` directory
2. Verify your Helius API key is valid
3. Ensure wallet addresses are in correct Solana format
4. Check network connectivity to Helius RPC endpoint

## License

This service is part of your existing project and follows the same licensing terms. 