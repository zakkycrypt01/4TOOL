const { Connection, PublicKey, Transaction, VersionedTransaction } = require('@solana/web3.js');
const { Program, AnchorProvider } = require('@project-serum/anchor');
const winston = require('winston');
const { TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const FeeManagement = require('./feeManagement');

class TradingExecution {
    constructor(config) {
        this.config = config;
        this.connection = new Connection(config.rpcEndpoint);
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'error.log', level: 'error' }),
                new winston.transports.File({ filename: 'combined.log' })
            ]
        });
        this.activePositions = new Map();
        this.userWallet = null;
        this.feeManager = new FeeManagement(config);
        
        // Rate limiting for Jupiter API
        this.lastJupiterRequest = 0;
        this.minRequestInterval = 500; // Minimum 500ms between requests
        
        // Circuit breaker for Jupiter API
        this.jupiterCircuitBreaker = {
            failureCount: 0,
            lastFailureTime: 0,
            isOpen: false,
            threshold: 5, // Open circuit after 5 failures
            timeout: 60000 // Close circuit after 1 minute
        };
    }

    setUserWallet(keypair) {
        this.userWallet = keypair;
    }

    async validateWalletBalance(requiredAmount) {
        try {
            if (!this.userWallet) {
                throw new Error('User wallet not set');
            }
            
            if (!this.connection) {
                throw new Error('Solana connection not initialized');
            }

            console.log(`[validateWalletBalance] Checking balance for wallet: ${this.userWallet.publicKey.toString()}`);
            const balance = await this.connection.getBalance(this.userWallet.publicKey);
            const balanceInSol = balance / 1e9;
            
            console.log(`[validateWalletBalance] Current balance: ${balanceInSol} SOL`);
            console.log(`[validateWalletBalance] Required amount: ${requiredAmount} SOL`);
            
            if (balanceInSol < requiredAmount) {
                return {
                    valid: false,
                    currentBalance: balanceInSol,
                    requiredAmount: requiredAmount,
                    shortfall: requiredAmount - balanceInSol
                };
            }
            
            return {
                valid: true,
                currentBalance: balanceInSol,
                requiredAmount: requiredAmount,
                excess: balanceInSol - requiredAmount
            };
        } catch (error) {
            console.error('[validateWalletBalance] Error:', error);
            throw error;
        }
    }

    async executeOrder(orderParams) {
        try {
            const { tokenAddress, side, amount, price, type } = orderParams;
            
            // Validate order parameters
            if (!this.validateOrder(orderParams)) {
                throw new Error('Invalid order parameters');
            }

            // Check if we already have an active position
            if (this.activePositions.has(tokenAddress) && side === 'buy') {
                this.logger.warn(`Active position exists for ${tokenAddress}, skipping buy order`);
                return false;
            }

            // Execute the order
            const orderResult = await this.submitOrder(orderParams);
            
            if (orderResult.success) {
                this.updatePositionTracking(tokenAddress, orderParams);
                this.logger.info(`Order executed successfully: ${JSON.stringify(orderParams)}`);
                return true;
            }

            return false;
        } catch (error) {
            this.logger.error(`Error executing order: ${error.message}`);
            throw error;
        }
    }

    validateOrder(orderParams) {
        const { tokenAddress, side, amount, price } = orderParams;
        return tokenAddress && side && amount > 0 && price > 0;
    }

    async submitOrder(orderParams) {
        // Implementation for submitting order to DEX
        // This would integrate with Serum or other DEX protocols
        return { success: true };
    }

    updatePositionTracking(tokenAddress, orderParams) {
        const position = {
            tokenAddress,
            entryPrice: orderParams.price,
            amount: orderParams.amount,
            stopLoss: orderParams.stopLoss,
            takeProfit: orderParams.takeProfit,
            trailingStop: orderParams.trailingStop,
            lastUpdate: Date.now()
        };

        this.activePositions.set(tokenAddress, position);
    }

    async checkStopLossTakeProfit() {
        for (const [tokenAddress, position] of this.activePositions) {
            const currentPrice = await this.getCurrentPrice(tokenAddress);
            
            if (this.shouldTriggerStopLoss(position, currentPrice) ||
                this.shouldTriggerTakeProfit(position, currentPrice)) {
                await this.executeOrder({
                    tokenAddress,
                    side: 'sell',
                    amount: position.amount,
                    price: currentPrice,
                    type: 'market'
                });
                
                this.activePositions.delete(tokenAddress);
            }
        }
    }

    shouldTriggerStopLoss(position, currentPrice) {
        return currentPrice <= position.entryPrice * (1 - position.stopLoss);
    }

    shouldTriggerTakeProfit(position, currentPrice) {
        return currentPrice >= position.entryPrice * (1 + position.takeProfit);
    }

    async getCurrentPrice(tokenAddress) {
        // Implementation for getting current token price
        return 0;
    }

    // ============ JUPITER INTEGRATION ============
    
    async makeJupiterRequest(endpoint, params) {
        const maxRetries = 3;
        const baseDelay = 1000; // 1 second base delay
        
        // Check circuit breaker
        const now = Date.now();
        if (this.jupiterCircuitBreaker.isOpen) {
            if (now - this.jupiterCircuitBreaker.lastFailureTime > this.jupiterCircuitBreaker.timeout) {
                console.log('[Jupiter] Circuit breaker timeout reached, attempting to close');
                this.jupiterCircuitBreaker.isOpen = false;
                this.jupiterCircuitBreaker.failureCount = 0;
            } else {
                throw new Error('Jupiter API is temporarily unavailable due to high error rate. Please try again in a minute.');
            }
        }
        
        // Rate limiting - ensure minimum interval between requests
        const timeSinceLastRequest = now - this.lastJupiterRequest;
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            console.log(`[Jupiter] Rate limiting: waiting ${waitTime}ms before next request`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
        }
        this.lastJupiterRequest = Date.now();
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                let url, options;
                
                if (endpoint === 'quote') {
                    const { inputMint, outputMint, amount, slippageBps, restrictIntermediateTokens } = params;
                    url = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&restrictIntermediateTokens=${restrictIntermediateTokens}`;
                    console.log(`[Jupiter] Fetching quote from: ${url}`);
                    
                    const response = await fetch(url);
                    
                    // Check if response is rate limited
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || 5;
                        console.log(`[Jupiter] Rate limited. Retrying after ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                        continue;
                    }
                    
                    if (!response.ok) {
                        const text = await response.text();
                        console.error(`[Jupiter] Quote request failed: ${response.status} - ${text}`);
                        throw new Error(`HTTP ${response.status}: ${text}`);
                    }
                    
                    const data = await response.json();
                    console.log(`[Jupiter] Quote response:`, data);
                    
                    // Reset circuit breaker on success
                    this.jupiterCircuitBreaker.failureCount = 0;
                    
                    return data;
                    
                } else if (endpoint === 'swap') {
                    url = 'https://lite-api.jup.ag/swap/v1/swap';
                    options = {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify(params)
                    };
                    
                    console.log(`[Jupiter] Making swap request to: ${url}`);
                    const response = await fetch(url, options);
                    
                    // Check if response is rate limited
                    if (response.status === 429) {
                        const retryAfter = response.headers.get('Retry-After') || 5;
                        console.log(`[Jupiter] Rate limited. Retrying after ${retryAfter} seconds...`);
                        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                        continue;
                    }
                    
                    if (!response.ok) {
                        const text = await response.text();
                        console.error(`[Jupiter] Swap request failed: ${response.status} - ${text}`);
                        throw new Error(`HTTP ${response.status}: ${text}`);
                    }
                    
                    const data = await response.json();
                    console.log(`[Jupiter] Swap response:`, data);
                    
                    // Reset circuit breaker on success
                    this.jupiterCircuitBreaker.failureCount = 0;
                    
                    return data;
                }
                
            } catch (error) {
                console.error(`[Jupiter] Attempt ${attempt} failed:`, error.message);
                
                // Update circuit breaker on rate limit errors
                if (error.message.includes('429') || error.message.includes('Rate limit') || error.message.includes('Unexpected token')) {
                    this.jupiterCircuitBreaker.failureCount++;
                    this.jupiterCircuitBreaker.lastFailureTime = Date.now();
                    
                    if (this.jupiterCircuitBreaker.failureCount >= this.jupiterCircuitBreaker.threshold) {
                        this.jupiterCircuitBreaker.isOpen = true;
                        console.log('[Jupiter] Circuit breaker opened due to repeated rate limit errors');
                        throw new Error('Jupiter API is experiencing high traffic. Please try again in a minute.');
                    }
                }
                
                if (attempt === maxRetries) {
                    throw new Error(`Jupiter API request failed after ${maxRetries} attempts: ${error.message}`);
                }
                
                // Exponential backoff
                const delay = baseDelay * Math.pow(2, attempt - 1);
                console.log(`[Jupiter] Retrying in ${delay}ms...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    async buildJupiterSwap(inputMint, outputMint, amount, userPublicKey, slippageBps = 100) {
        try {
            console.log('Building Jupiter swap with params:', {
                inputMint,
                outputMint,
                amount,
                userPublicKey: userPublicKey.toString(),
                slippageBps
            });

            // Get quote from Jupiter with retry logic
            const quoteResponse = await this.makeJupiterRequest('quote', {
                inputMint,
                outputMint,
                amount,
                slippageBps: Math.floor(slippageBps),
                restrictIntermediateTokens: true
            });

            if (!quoteResponse || quoteResponse.error) {
                throw new Error(`Failed to get quote: ${quoteResponse?.error || 'Unknown error'}`);
            }

            // Get swap transaction with retry logic
            console.log('Getting swap transaction...');
            const swapResponse = await this.makeJupiterRequest('swap', {
                quoteResponse,
                userPublicKey: userPublicKey.toString(),
                dynamicComputeUnitLimit: true,
                dynamicSlippage: true,
                prioritizationFeeLamports: 'auto'
            });

            if (!swapResponse.swapTransaction) {
                throw new Error(`Failed to get swap transaction: ${swapResponse.error || 'Unknown error'}`);
            }

            // Deserialize the versioned transaction from base64
            const swapTransactionBuf = Buffer.from(swapResponse.swapTransaction, 'base64');
            const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

            // Log transaction details for debugging
            console.log('Transaction created:', {
                type: transaction.constructor.name,
                isVersioned: transaction instanceof VersionedTransaction,
                message: transaction.message
            });

            return {
                transaction,
                quote: quoteResponse,
                outAmount: parseInt(quoteResponse.outAmount),
                inAmount: parseInt(quoteResponse.inAmount),
                priceImpactPct: parseFloat(quoteResponse.priceImpactPct),
                lastValidBlockHeight: swapResponse.lastValidBlockHeight,
                prioritizationFeeLamports: swapResponse.prioritizationFeeLamports,
                computeUnitLimit: swapResponse.computeUnitLimit
            };

        } catch (error) {
            console.error('Jupiter swap error:', error);
            
            // Handle specific Jupiter API errors
            if (error.message.includes('Rate limit') || error.message.includes('Unexpected token')) {
                throw new Error('Jupiter API is currently experiencing high traffic. Please try again in a few moments.');
            } else if (error.message.includes('429')) {
                throw new Error('Too many requests to Jupiter API. Please wait a moment and try again.');
            } else {
                throw new Error(`Jupiter swap failed: ${error.message}`);
            }
        }
    }

    async executeTransaction(wallet, transaction) {
        try {
            // Ensure we have a VersionedTransaction
            if (!(transaction instanceof VersionedTransaction)) {
                throw new Error('Invalid transaction type: Expected VersionedTransaction');
            }

            // Get a fresh blockhash
            const { blockhash, lastValidBlockHeight } = await this.connection.getLatestBlockhash();
            transaction.message.recentBlockhash = blockhash;

            // Sign and send the transaction
            transaction.sign([wallet]);
            const signature = await this.connection.sendRawTransaction(transaction.serialize());

            // Wait for confirmation
            const confirmation = await this.connection.confirmTransaction({
                signature,
                blockhash,
                lastValidBlockHeight
            }, "finalized");

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}\nhttps://solscan.io/tx/${signature}/`);
            }

            return signature;
        } catch (error) {
            // Graceful handling for SendTransactionError (Jupiter swap errors)
            if (error && error.logs) {
                console.error('Transaction simulation logs:', error.logs);
            }
            if (error.message && error.message.includes('custom program error: 0x1771')) {
                return {
                    success: false,
                    error: 'Swap failed: Insufficient token balance, SOL for fees, or dust amount. Please check your wallet balances and try again.'
                };
            }
            if (error.message && error.message.includes('Transaction simulation failed')) {
                return {
                    success: false,
                    error: 'Transaction simulation failed. This may be due to insufficient funds, dust amount, or an uninitialized token account. Please check your balances and try again.'
                };
            }
            console.error('Transaction execution error:', error);
            // Handle specific error cases
            if (error.message && error.message.includes('Blockhash not found')) {
                return {
                    success: false,
                    error: 'Transaction expired. Please try again.'
                };
            }
            if (error.message && error.message.includes('Attempt to debit an account but found no record of a prior credit')) {
                return {
                    success: false,
                    error: 'Insufficient SOL balance to execute this transaction. Please ensure you have enough SOL to cover the transaction amount plus fees.'
                };
            }
            if (error.message && error.message.includes('insufficient lamports')) {
                return {
                    success: false,
                    error: 'Insufficient SOL balance. The transaction requires more SOL than available in your wallet. Please ensure you have enough SOL to cover the transaction amount plus network fees.'
                };
            }
            return {
                success: false,
                error: `Transaction failed: ${error.message}`
            };
        }
    }

    async verifyTransactionSuccess(signature, tokenAddress) {
        try {
            console.log(`[verifyTransactionSuccess] Verifying transaction: ${signature}`);
            
            // Get transaction details
            const transaction = await this.connection.getTransaction(signature, {
                commitment: 'confirmed',
                maxSupportedTransactionVersion: 0
            });

            if (!transaction) {
                throw new Error('Transaction not found on blockchain');
            }

            if (transaction.meta && transaction.meta.err) {
                throw new Error(`Transaction failed on blockchain: ${JSON.stringify(transaction.meta.err)}`);
            }

            // Verify that the transaction actually transferred tokens
            if (transaction.meta && transaction.meta.postTokenBalances) {
                const tokenTransfers = transaction.meta.postTokenBalances.filter(
                    balance => balance.mint === tokenAddress
                );
                
                if (tokenTransfers.length === 0) {
                    throw new Error('No token transfer detected in transaction');
                }

                // Check if any token balance increased (indicating successful buy)
                const preBalances = transaction.meta.preTokenBalances || [];
                const postBalances = transaction.meta.postTokenBalances || [];
                
                let tokenReceived = false;
                for (const postBalance of postBalances) {
                    if (postBalance.mint === tokenAddress) {
                        const preBalance = preBalances.find(b => 
                            b.accountIndex === postBalance.accountIndex && 
                            b.mint === tokenAddress
                        );
                        
                        if (!preBalance || parseFloat(postBalance.uiTokenAmount.uiAmount) > parseFloat(preBalance.uiTokenAmount.uiAmount)) {
                            tokenReceived = true;
                            break;
                        }
                    }
                }

                if (!tokenReceived) {
                    throw new Error('No tokens were received in the transaction');
                }
            }

            console.log(`[verifyTransactionSuccess] Transaction verified successfully: ${signature}`);
            return true;
        } catch (error) {
            console.error(`[verifyTransactionSuccess] Verification failed: ${error.message}`);
            throw new Error(`Transaction verification failed: ${error.message}`);
        }
    }

    async executeBuy(userId, tokenAddress, solAmount) {
        try {
            if (!this.userWallet) {
                throw new Error('User wallet not set');
            }
            
            if (!this.connection) {
                throw new Error('Solana connection not initialized');
            }
            // Basic input validation (only check if tokenAddress exists and is a string)
            if (!tokenAddress || typeof tokenAddress !== 'string') {
                throw new Error('Token address is required');
            }
            if (isNaN(solAmount) || solAmount <= 0) {
                throw new Error('Invalid SOL amount');
            }
            console.log(`[executeBuy] userId: ${userId}, tokenAddress: ${tokenAddress}, solAmount: ${solAmount}`);

            // Convert SOL amount to lamports
            const amountInLamports = Math.floor(solAmount * 1e9);

            // Build Jupiter swap first to get accurate fee estimation
            const swapResult = await this.buildJupiterSwap(
                'So11111111111111111111111111111111111111112', // SOL mint
                tokenAddress,
                amountInLamports,
                this.userWallet.publicKey,
                0.5 // 0.5% slippage
            );

            // Check wallet balance after getting accurate fee estimation
            console.log(`[executeBuy] Checking balance for wallet: ${this.userWallet.publicKey.toString()}`);
            const balance = await this.connection.getBalance(this.userWallet.publicKey);
            const balanceInSol = balance / 1e9;
            console.log(`[executeBuy] Wallet balance: ${balanceInSol} SOL (${balance} lamports)`);
            console.log(`[executeBuy] RPC endpoint: ${this.connection._rpcEndpoint}`);
            
            // Calculate actual fees from Jupiter response
            const prioritizationFee = (swapResult.prioritizationFeeLamports || 0) / 1e9;
            const estimatedNetworkFee = 0.000005; // Base network fee ~5000 lamports
            const botFee = solAmount * 0.01; // 1% bot fee
            const totalFees = prioritizationFee + estimatedNetworkFee + botFee;
            const requiredAmount = solAmount + totalFees;
            
            console.log(`[executeBuy] Fee breakdown:`);
            console.log(`  - Prioritization fee: ${prioritizationFee.toFixed(6)} SOL`);
            console.log(`  - Estimated network fee: ${estimatedNetworkFee.toFixed(6)} SOL`);
            console.log(`  - Bot fee: ${botFee.toFixed(6)} SOL`);
            console.log(`  - Total fees: ${totalFees.toFixed(6)} SOL`);
            console.log(`[executeBuy] Required amount: ${requiredAmount} SOL (${solAmount} SOL + ${totalFees.toFixed(6)} SOL fees)`);
            console.log(`[executeBuy] Available balance: ${balanceInSol} SOL`);
            
            if (balanceInSol < requiredAmount) {
                throw new Error(`Insufficient SOL balance. You have ${balanceInSol.toFixed(6)} SOL but need at least ${requiredAmount.toFixed(6)} SOL (including fees).`);
            }

            // swapResult is already built above, no need to check again

            // Execute the transaction with retry mechanism
            let signature;
            let retryCount = 0;
            const maxRetries = 3;
            
            while (retryCount < maxRetries) {
                try {
                    // Double-check balance before each retry
                    if (retryCount > 0) {
                        const retryBalance = await this.connection.getBalance(this.userWallet.publicKey);
                        const retryBalanceInSol = retryBalance / 1e9;
                        console.log(`[executeBuy] Retry ${retryCount}: Wallet balance: ${retryBalanceInSol} SOL`);
                        
                        if (retryBalanceInSol < requiredAmount) {
                            throw new Error(`Insufficient SOL balance on retry. You have ${retryBalanceInSol.toFixed(6)} SOL but need at least ${requiredAmount.toFixed(6)} SOL.`);
                        }
                    }
                    
                    signature = await this.executeTransaction(this.userWallet, swapResult.transaction);
                    break; // Success, exit retry loop
                } catch (error) {
                    retryCount++;
                    console.log(`[executeBuy] Transaction attempt ${retryCount} failed: ${error.message}`);
                    
                    if (retryCount >= maxRetries) {
                        throw error; // Re-throw the last error
                    }
                    
                    // Wait before retry
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }

            if (!signature) {
                throw new Error('Failed to execute transaction after all retries');
            }

            // Check if signature is an error object
            if (typeof signature === 'object' && signature.success === false) {
                throw new Error(signature.error || 'Transaction failed');
            }

            // Additional verification: Check if transaction was actually successful
            await this.verifyTransactionSuccess(signature, tokenAddress);

            // Calculate fees (reuse botFee from earlier calculation)
            const networkFee = (swapResult.prioritizationFeeLamports || 0) / 1e9; // Convert lamports to SOL

            // Deduct and transfer bot fee
            await this.feeManager.collectFee(botFee, this.userWallet);

            // Get token info
            const tokenInfo = await this.getTokenInfo(tokenAddress);

            return {
                success: true,
                signature,
                tokensReceived: swapResult.outAmount / Math.pow(10, tokenInfo.decimals),
                tokenPrice: swapResult.outAmount / swapResult.inAmount,
                solPrice: 1, // TODO: Get actual SOL price
                botFee,
                networkFee,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                priceImpact: swapResult.priceImpactPct
            };
        } catch (error) {
            console.error('Error executing buy:', error);
            
            // Provide more specific error messages
            let errorMessage = error.message;
            
            if (error.message.includes('Insufficient SOL balance')) {
                errorMessage = `Insufficient SOL balance for transaction. Please ensure you have enough SOL to cover the trade amount plus network fees.`;
            } else if (error.message.includes('Connection')) {
                errorMessage = `Network connection error. Please try again in a few moments.`;
            } else if (error.message.includes('Transaction failed')) {
                errorMessage = `Transaction failed on the Solana network. This could be due to network congestion or insufficient fees.`;
            } else if (error.message.includes('Failed to build swap')) {
                errorMessage = `Unable to create swap transaction. The token may not be available for trading or there may be insufficient liquidity.`;
            }
            
            return {
                success: false,
                error: errorMessage,
                originalError: error.message
            };
        } finally {
            // Clear the user wallet after the transaction
            this.userWallet = null;
        }
    }

    async executeSell(userId, tokenAddress, tokenAmount, keypair, slippageBps = 50) {
        try {
            if (!keypair) {
                throw new Error('User wallet not set');
            }

            // Get token info
            const tokenInfo = await this.getTokenInfo(tokenAddress);
            const decimals = tokenInfo.decimals;
            const amountInTokenUnits = Math.floor(tokenAmount * Math.pow(10, decimals));

            // Build Jupiter swap (Token -> SOL)
            const swapResult = await this.buildJupiterSwap(
                tokenAddress, // Input mint (token)
                'So11111111111111111111111111111111111111112', // Output mint (SOL)
                amountInTokenUnits,
                keypair.publicKey,
                slippageBps / 100 // Convert basis points to percentage
            );

            if (!swapResult) {
                throw new Error('Failed to build sell swap transaction');
            }

            // Execute the transaction
            const signature = await this.executeTransaction(keypair, swapResult.transaction);

            if (!signature) {
                throw new Error('Failed to execute sell transaction');
            }

            // Check if signature is an error object
            if (typeof signature === 'object' && signature.success === false) {
                throw new Error(signature.error || 'Sell transaction failed');
            }

            // Calculate received SOL and fees
            const solReceived = swapResult.outAmount / 1e9; // Convert lamports to SOL
            const botFee = solReceived * 0.01; // 1% bot fee
            const networkFee = (swapResult.prioritizationFeeLamports || 0) / 1e9; // Convert lamports to SOL

            await this.feeManager.collectFee(botFee, keypair);

            return {
                success: true,
                signature,
                tokensSold: tokenAmount,
                solReceived,
                tokenPrice: swapResult.outAmount / swapResult.inAmount,
                solPrice: 1, // TODO: Get actual SOL price
                botFee,
                networkFee,
                name: tokenInfo.name,
                symbol: tokenInfo.symbol,
                priceImpact: swapResult.priceImpactPct
            };
        } catch (error) {
            console.error('Error executing sell:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async executeSellPercent(userId, tokenAddress, percentage, slippageBps = 50) {
        try {
            if (!this.userWallet) {
                throw new Error('User wallet not set');
            }

            if (percentage <= 0 || percentage > 100) {
                throw new Error('Percentage must be between 0 and 100');
            }

            // Get token balance
            const tokenBalance = await this.getTokenBalance(this.userWallet.publicKey, tokenAddress);
            if (tokenBalance === 0) {
                throw new Error('No tokens to sell');
            }

            // Calculate amount to sell based on percentage
            const amountToSell = (tokenBalance * percentage) / 100;

            return await this.executeSell(userId, tokenAddress, amountToSell, this.userWallet, slippageBps);
        } catch (error) {
            console.error('Error executing percentage sell:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    async getTokenBalance(walletPublicKey, tokenAddress) {
        try {
            const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
                walletPublicKey,
                { mint: new PublicKey(tokenAddress) }
            );

            if (tokenAccounts.value.length === 0) {
                return 0;
            }

            const totalBalance = tokenAccounts.value.reduce((sum, account) => {
                const amount = account.account.data.parsed.info.tokenAmount.uiAmount;
                return sum + (amount || 0);
            }, 0);

            return totalBalance;
        } catch (error) {
            console.error('Error getting token balance:', error);
            return 0;
        }
    }

    async getTokenInfo(tokenAddress) {
        try {
            const axios = require('axios');
            const url = `https://lite-api.jup.ag/tokens/v2/search?query=${tokenAddress}`;
            const resp = await axios.get(url, { headers: { 'Accept': 'application/json' } });
            
            if (Array.isArray(resp.data) && resp.data.length > 0) {
                // First try to find exact match
                let meta = resp.data.find(t => 
                    t.id === tokenAddress || 
                    t.address === tokenAddress || 
                    t.mint === tokenAddress
                );
                
                // If no exact match, try partial match or use first result
                if (!meta) {
                    meta = resp.data.find(t => 
                        t.id?.toLowerCase().includes(tokenAddress.toLowerCase()) ||
                        t.address?.toLowerCase().includes(tokenAddress.toLowerCase()) ||
                        t.mint?.toLowerCase().includes(tokenAddress.toLowerCase())
                    ) || resp.data[0];
                }
                
                if (meta) {
                    return {
                        name: meta.name || 'Unknown Token',
                        symbol: meta.symbol || 'UNKNOWN',
                        decimals: meta.decimals || 9
                    };
                }
            }
            
            // If Jupiter fails, try DexScreener as fallback
            try {
                const dexscreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`;
                const dexscreenerResp = await axios.get(dexscreenerUrl, { 
                    headers: { 'Accept': 'application/json' },
                    timeout: 5000 
                });
                
                if (dexscreenerResp.data && dexscreenerResp.data.pairs && dexscreenerResp.data.pairs.length > 0) {
                    const pair = dexscreenerResp.data.pairs[0];
                    return {
                        name: pair.baseToken?.name || 'Unknown Token',
                        symbol: pair.baseToken?.symbol || 'UNKNOWN',
                        decimals: pair.baseToken?.decimals || 9
                    };
                }
            } catch (dexscreenerError) {
                console.error('Error fetching DexScreener data:', dexscreenerError);
            }
            
            // Final fallback with more informative naming
            return {
                name: `Token (${tokenAddress.slice(0, 8)}...)`,
                symbol: tokenAddress.slice(0, 6) + '...' + tokenAddress.slice(-4),
                decimals: 9
            };
        } catch (error) {
            console.error('Error getting token info:', error);
            return {
                name: `Token (${tokenAddress.slice(0, 8)}...)`,
                symbol: tokenAddress.slice(0, 6) + '...' + tokenAddress.slice(-4),
                decimals: 9
            };
        }
    }

    async executeTrade(params) {
        try {
            const { user, wallet, tokenAddress, amount, side, type } = params;

            // Check if wallet is locked
            const walletStatus = await this.db.getWalletSecurityStatus(wallet.id);
            if (walletStatus.is_locked) {
                throw new Error('Wallet is locked. Please unlock it before trading.');
            }

            // Validate wallet ownership
            if (wallet.user_id !== user.id) {
                throw new Error('Unauthorized: Wallet does not belong to user');
            }

            // Validate trade parameters
            if (!tokenAddress || !amount || !side || !type) {
                throw new Error('Missing required trade parameters');
            }

            // Execute the trade based on type
            switch (type.toLowerCase()) {
                case 'market':
                    return await this.executeMarketOrder(params);
                case 'limit':
                    return await this.executeLimitOrder(params);
                default:
                    throw new Error('Unsupported order type');
            }
        } catch (error) {
            this.logger.error(`Trade execution error: ${error.message}`);
            throw error;
        }
    }

    async executeMarketOrder(params) {
        try {
            const { user, wallet, tokenAddress, amount, side } = params;

            // Check if wallet is locked again before executing market order
            const walletStatus = await this.db.getWalletSecurityStatus(wallet.id);
            if (walletStatus.is_locked) {
                throw new Error('Wallet is locked. Please unlock it before trading.');
            }

            // Rest of the market order execution logic
            // ... existing code ...
        } catch (error) {
            this.logger.error(`Market order execution error: ${error.message}`);
            throw error;
        }
    }

    async executeLimitOrder(params) {
        try {
            const { user, wallet, tokenAddress, amount, side, price } = params;

            const walletStatus = await this.db.getWalletSecurityStatus(wallet.id);
            if (walletStatus.is_locked) {
                throw new Error('Wallet is locked. Please unlock it before trading.');
            }

        } catch (error) {
            this.logger.error(`Limit order execution error: ${error.message}`);
            throw error;
        }
    }

    /**
     * Handles a custom buy input (e.g., from Telegram bot or UI)
     * @param {string|number} userId - The user ID
     * @param {string} callbackData - The callback data string, e.g., 'custom_buy_<tokenAddress>_<solAmount>' or 'custom_buy_<solAmount>'
     * @returns {Promise<object>} - The result of the buy execution
     */
    async handleCustomBuyInput(userId, callbackData) {
        try {
            console.log(`[handleCustomBuyInput] Processing callback data: ${callbackData}`);
            
            // Remove the 'custom_buy_' prefix
            const prefix = 'custom_buy_';
            if (!callbackData.startsWith(prefix)) {
                throw new Error('Invalid custom buy callback data');
            }
            const data = callbackData.slice(prefix.length);
            console.log(`[handleCustomBuyInput] Data after prefix removal: ${data}`);
            
            // Support both 'custom_buy_<tokenAddress>_<solAmount>' and 'custom_buy_<solAmount>'
            const parts = data.split('_');
            console.log(`[handleCustomBuyInput] Split parts:`, parts);
            
            let tokenAddress, solAmountStr;
            if (parts.length === 2) {
                // Format: custom_buy_<tokenAddress>_<solAmount>
                tokenAddress = parts[0];
                solAmountStr = parts[1];
                console.log(`[handleCustomBuyInput] Using 2-part format - tokenAddress: ${tokenAddress}, solAmountStr: ${solAmountStr}`);
            } else if (parts.length === 1) {
                // Format: custom_buy_<solAmount> (tokenAddress must be set elsewhere)
                solAmountStr = parts[0];
                tokenAddress = this.lastTokenAddress || null;
                console.log(`[handleCustomBuyInput] Using 1-part format - tokenAddress: ${tokenAddress}, solAmountStr: ${solAmountStr}`);
            } else {
                // Fallback to old logic
                const lastUnderscore = data.lastIndexOf('_');
                if (lastUnderscore === -1) {
                    throw new Error('Invalid custom buy callback data');
                }
                tokenAddress = data.slice(0, lastUnderscore);
                solAmountStr = data.slice(lastUnderscore + 1);
                console.log(`[handleCustomBuyInput] Using fallback format - tokenAddress: ${tokenAddress}, solAmountStr: ${solAmountStr}`);
            }
            
            const solAmount = parseFloat(solAmountStr);
            console.log(`[handleCustomBuyInput] Parsed values - tokenAddress: ${tokenAddress}, solAmount: ${solAmount}`);
            
            if (isNaN(solAmount) || solAmount <= 0) {
                throw new Error('Invalid amount');
            }
            
            // Execute the buy
            return await this.executeBuy(userId, tokenAddress, solAmount);
        } catch (error) {
            this.logger.error(`Custom buy input error: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}

module.exports = TradingExecution;