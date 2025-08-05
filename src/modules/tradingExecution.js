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
    }

    setUserWallet(keypair) {
        this.userWallet = keypair;
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
    async buildJupiterSwap(inputMint, outputMint, amount, userPublicKey, slippageBps = 100) {
        try {
            console.log('Building Jupiter swap with params:', {
                inputMint,
                outputMint,
                amount,
                userPublicKey: userPublicKey.toString(),
                slippageBps
            });

            // Get quote from Jupiter
            const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${Math.floor(slippageBps)}&restrictIntermediateTokens=true`;
            console.log('Fetching quote from:', quoteUrl);
            
            const quoteResponse = await (await fetch(quoteUrl)).json();
            console.log('Quote response:', quoteResponse);

            if (!quoteResponse || quoteResponse.error) {
                throw new Error(`Failed to get quote: ${quoteResponse?.error || 'Unknown error'}`);
            }

            // Get swap transaction
            console.log('Getting swap transaction...');
            const swapResponse = await (
                await fetch('https://lite-api.jup.ag/swap/v1/swap', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        quoteResponse,
                        userPublicKey: userPublicKey.toString(),
                        dynamicComputeUnitLimit: true,
                        dynamicSlippage: true, // Enable dynamic slippage
                        prioritizationFeeLamports: 'auto' // Use auto-priority fee
                    })
                })
            ).json();

            console.log('Swap response:', swapResponse);

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
            throw new Error(`Jupiter swap failed: ${error.message}`);
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
            return {
                success: false,
                error: `Transaction failed: ${error.message}`
            };
        }
    }

    async executeBuy(userId, tokenAddress, solAmount) {
        try {
            if (!this.userWallet) {
                throw new Error('User wallet not set');
            }
            // Validate input
            if (!tokenAddress || typeof tokenAddress !== 'string' || tokenAddress.length < 32) {
                throw new Error('Invalid token address');
            }
            if (isNaN(solAmount) || solAmount <= 0) {
                throw new Error('Invalid SOL amount');
            }
            console.log(`[executeBuy] userId: ${userId}, tokenAddress: ${tokenAddress}, solAmount: ${solAmount}`);

            // Convert SOL amount to lamports
            const amountInLamports = Math.floor(solAmount * 1e9);

            // Build Jupiter swap
            const swapResult = await this.buildJupiterSwap(
                'So11111111111111111111111111111111111111112', // SOL mint
                tokenAddress,
                amountInLamports,
                this.userWallet.publicKey,
                0.5 // 0.5% slippage
            );

            if (!swapResult) {
                throw new Error('Failed to build swap transaction');
            }

            // Execute the transaction
            const signature = await this.executeTransaction(this.userWallet, swapResult.transaction);

            if (!signature) {
                throw new Error('Failed to execute transaction');
            }

            // Calculate fees
            const botFee = solAmount * 0.01; // 1% bot fee
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
            return {
                success: false,
                error: error.message
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
                const meta = resp.data[0];
                return {
                    name: meta.name || 'Unknown Token',
                    symbol: meta.symbol || 'UNKNOWN',
                    decimals: meta.decimals || 9
                };
            }
            return {
                name: 'Unknown Token',
                symbol: 'UNKNOWN',
                decimals: 9
            };
        } catch (error) {
            console.error('Error getting token info:', error);
            return {
                name: 'Unknown Token',
                symbol: 'UNKNOWN',
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
            // Remove the 'custom_buy_' prefix
            const prefix = 'custom_buy_';
            if (!callbackData.startsWith(prefix)) {
                throw new Error('Invalid custom buy callback data');
            }
            const data = callbackData.slice(prefix.length);
            // Support both 'custom_buy_<tokenAddress>_<solAmount>' and 'custom_buy_<solAmount>'
            const parts = data.split('_');
            let tokenAddress, solAmountStr;
            if (parts.length === 2) {
                // Format: custom_buy_<tokenAddress>_<solAmount>
                tokenAddress = parts[0];
                solAmountStr = parts[1];
            } else if (parts.length === 1) {
                // Format: custom_buy_<solAmount> (tokenAddress must be set elsewhere)
                solAmountStr = parts[0];
                tokenAddress = this.lastTokenAddress || null;
            } else {
                // Fallback to old logic
                const lastUnderscore = data.lastIndexOf('_');
                if (lastUnderscore === -1) {
                    throw new Error('Invalid custom buy callback data');
                }
                tokenAddress = data.slice(0, lastUnderscore);
                solAmountStr = data.slice(lastUnderscore + 1);
            }
            const solAmount = parseFloat(solAmountStr);
            if (!tokenAddress || isNaN(solAmount) || solAmount <= 0) {
                throw new Error('Invalid token address or amount');
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