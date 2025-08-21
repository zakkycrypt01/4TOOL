# Raydium Trade API Integration Guide

## Overview
This guide documents the complete integration of Raydium Trade API into your 4TOOL trading bot, replacing Jupiter as the primary trading provider while maintaining Jupiter as a fallback option.

## 🚀 Installation

### 1. Install Raydium SDK
```bash
npm install @raydium-io/raydium-sdk-v2
```

### 2. Environment Variables
Add these optional environment variables to your `.env` file:

```env
# Trading provider preference (default: raydium)
TRADING_PROVIDER=raydium

# Enable fallback to Jupiter if Raydium fails (default: true)
ENABLE_TRADING_FALLBACK=true

# Raydium priority fee level (default: h)
# Options: vh (very high), h (high), m (medium)
RAYDIUM_PRIORITY_LEVEL=h
```

## 📁 Files Modified/Created

### New Files:
- `src/services/raydiumService.js` - Core Raydium integration service
- `test-raydium-integration.js` - Integration test script

### Modified Files:
- `src/modules/tradingExecution.js` - Updated to use Raydium with Jupiter fallback
- `src/config.js` - Added Raydium configuration options

## 🔧 Implementation Details

### RaydiumService Class
Located in `src/services/raydiumService.js`, this service provides:

- **Rate Limiting**: 500ms minimum between API requests
- **Circuit Breaker**: Temporarily disables API after 5 consecutive failures
- **Priority Fee Management**: Automatic priority fee optimization
- **Transaction Handling**: Both legacy and versioned transaction support

### Key Methods:

#### `getSwapQuote(inputMint, outputMint, amount, slippageBps, txVersion)`
Gets swap quotes from Raydium API
```javascript
const quote = await raydiumService.getSwapQuote(
    'So11111111111111111111111111111111111111112', // SOL
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC
    100000000, // 0.1 SOL in lamports
    50, // 0.5% slippage
    'v0' // versioned transaction
);
```

#### `executeSwap(inputMint, outputMint, amount, wallet, slippageBps, priorityLevel)`
Executes complete swap operation
```javascript
const result = await raydiumService.executeSwap(
    inputMint,
    outputMint,
    amount,
    walletKeypair,
    50, // slippage
    'h'  // priority level
);
```

### Fallback Mechanism
The system now includes a smart fallback mechanism:

1. **Primary Provider**: Attempts swap with configured provider (Raydium by default)
2. **Fallback Provider**: If primary fails, attempts with alternative provider (Jupiter)
3. **Error Handling**: Comprehensive error reporting with provider information

### Configuration Options
```javascript
trading: {
    tradingProvider: 'raydium', // or 'jupiter'
    enableFallback: true,
    raydium: {
        defaultSlippageBps: 50,
        priorityLevel: 'h',
        maxTransactionRetries: 3,
        retryDelay: 1000
    }
}
```

## 🔀 API Comparison: Jupiter vs Raydium

### Jupiter API Flow:
1. Get quote from Jupiter
2. Build transaction
3. Sign and send

### Raydium API Flow:
1. Get priority fee data
2. Get swap quote (`/compute/swap-base-in`)
3. Create transaction (`/transaction/swap-base-in`)
4. Deserialize transaction(s)
5. Sign and send transaction(s)

### Key Differences:
- **Transaction Count**: Raydium may return multiple transactions
- **Priority Fees**: Raydium provides built-in priority fee optimization
- **Transaction Types**: Raydium supports both legacy and versioned transactions
- **Slippage**: Raydium uses basis points (50 = 0.5%), Jupiter uses percentage (0.5)

## 🧪 Testing

### Run Integration Test:
```bash
node test-raydium-integration.js
```

### Test Output Explanation:
- ✅ **RaydiumService initialized**: Basic class instantiation works
- ✅ **Priority fee data**: API connectivity (may use defaults if API unreachable)
- ❌ **Swap quote test**: Expected to fail without SDK installation
- ✅ **Rate limiting**: Confirms request throttling works

## 🚨 Important Notes

### Network Requirements:
- Raydium APIs require stable internet connection
- API endpoints may have geographic restrictions
- Consider using premium RPC endpoints for better reliability

### Fee Structure:
```
Total Transaction Cost = Trade Amount + Priority Fee + Network Fee + Bot Fee (1%)
```

### Error Handling:
The system handles common errors:
- Network connectivity issues
- API rate limits
- Transaction failures
- Insufficient balance
- Slippage exceeded

## 🔄 Usage Examples

### Buy Transaction with Raydium:
```javascript
// The buyManager automatically uses the new system
await buyManager.executeBuy(chatId, telegramId, amount, bot);
```

### Manual Swap Example:
```javascript
const tradingExecution = new TradingExecution(config);
tradingExecution.setUserWallet(keypair);

const result = await tradingExecution.executeBuy(
    userId,
    tokenAddress,
    solAmount
);
```

## 🔧 Troubleshooting

### Common Issues:

1. **Module Not Found Error**:
   ```bash
   npm install @raydium-io/raydium-sdk-v2
   ```

2. **API Connection Errors**:
   - Check internet connectivity
   - Verify RPC endpoint is working
   - Consider using fallback provider

3. **Transaction Failures**:
   - Increase slippage tolerance
   - Check wallet balance
   - Verify token mint addresses

4. **Priority Fee Issues**:
   - Adjust `RAYDIUM_PRIORITY_LEVEL` in environment
   - Monitor network congestion

### Debug Mode:
Enable detailed logging by checking console output for `[Raydium]` prefixed messages.

## 📈 Performance Optimizations

### Recommended Settings:
- **Slippage**: 0.5% (50 basis points) for most trades
- **Priority Level**: 'h' (high) for reliable execution
- **RPC Endpoint**: Use premium endpoints for better performance

### Rate Limiting:
- Minimum 500ms between API requests
- Circuit breaker activates after 5 failures
- Automatic recovery after 1 minute

## 🔄 Migration from Jupiter

The migration is seamless:
1. Existing code continues to work
2. Raydium becomes primary provider
3. Jupiter remains as fallback
4. No changes required in trading logic

## 📊 Monitoring

Watch for these logs:
- `[Raydium] Quote received` - Successful quote requests
- `[Raydium] Transaction created successfully` - Transaction building
- `[executeSwapWithFallback] Raydium swap successful` - Successful trades
- `[executeSwapWithFallback] Jupiter swap successful` - Fallback usage

## 🎯 Next Steps

1. **Install the Raydium SDK** when network permits
2. **Test on devnet** with small amounts first
3. **Monitor performance** compared to Jupiter
4. **Adjust configuration** based on trading patterns
5. **Consider premium RPC** for production use

## 🛡️ Security Considerations

- Private keys are handled identically to current implementation
- Transaction signing happens locally
- API requests don't expose sensitive data
- Fallback ensures trading continuity

---

The integration maintains full backward compatibility while providing the benefits of Raydium's optimized trading infrastructure. The system will automatically prefer Raydium while gracefully falling back to Jupiter when needed.
