class PortfolioHandlers {
    constructor(bot, db, config) {
        this.bot = bot;
        this.db = db;
        this.config = config;
        this.fileExportService = require('../services/fileExportService');
        this.walletHoldingsService = require('../services/walletHoldingsService');
        this.lastMessageIds = new Map();
        this.portfolioCache = new Map(); // { telegramId: { data, timestamp } }
        
        // Initialize wallet holdings service
        this.holdingsService = new this.walletHoldingsService(config);
    }

    async handleViewPortfolio(chatId, telegramId) {
        try {
            // Check cache first
            const cached = this.portfolioCache.get(telegramId);
            if (cached && cached.data) {
                // Use cached message
                await this.sendAndStoreMessage(chatId, cached.data.message, {
                    parse_mode: 'Markdown',
                    reply_markup: cached.data.keyboard
                });
                return;
            }
            const user = await this.db.getUserByTelegramId(telegramId);
            const wallets = await this.db.getWalletsByUserId(user.id);

            if (!wallets || wallets.length === 0) {
                const message = `
*No Wallets Found*

Please create or import a wallet first to view your portfolio.`;
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                        ]
                    ]
                };
                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Fetch all holdings and recent trades for all wallets
            const PortfolioService = require('../services/portfolioService');
            const TokenDataService = require('../services/tokenDataService');
            const MarketDataService = require('../services/marketDataService');
            const portfolioService = new PortfolioService(this.config);
            const tokenDataService = new TokenDataService(this.config);
            const marketDataService = new MarketDataService();
            let allHoldings = {};
            let solTotal = 0;
            let solPrice = 0;
            let recentTrades = [];

            // Fetch SOL price once
            try {
                const axios = require('axios');
                const cgResp = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
                if (cgResp.data && cgResp.data.solana && cgResp.data.solana.usd) solPrice = cgResp.data.solana.usd;
            } catch (e) {}

            for (const wallet of wallets) {
                const walletBalance = await portfolioService.getWalletBalance(wallet.public_key);
                solTotal += walletBalance.sol;
                // Debug: log SPL tokens for this wallet
                console.log(`[Portfolio] Wallet: ${wallet.public_key}, SPL tokens:`, walletBalance.tokens);
                // Aggregate SPL tokens
                for (const t of walletBalance.tokens) {
                    if (!allHoldings[t.mint]) {
                        let symbol = 'Unknown Token';
                        let price = 0;
                        let marketCap = null;
                        let volume24h = null;
                        let name = 'Unknown Token';
                        try {
                            // Try TokenDataService first (more reliable)
                            const meta2 = await tokenDataService.getTokenData(t.mint);
                            if (meta2) {
                                if (meta2.symbol && meta2.symbol !== 'UNKNOWN') symbol = meta2.symbol;
                                if (meta2.name && meta2.name !== 'Unknown Token') name = meta2.name;
                                if (meta2.price) price = meta2.price;
                                if (meta2.marketCap) marketCap = meta2.marketCap;
                                if (meta2.volume24h) volume24h = meta2.volume24h;
                            }
                            
                            // If TokenDataService didn't provide good data, try MarketDataService
                            if (symbol === 'Unknown Token' || name === 'Unknown Token') {
                                const meta = await marketDataService.getTokenData(t.mint);
                                if (meta) {
                                    if (meta.symbol && symbol === 'Unknown Token') symbol = meta.symbol;
                                    if (meta.name && name === 'Unknown Token') name = meta.name;
                                    if (meta.price && !price) price = meta.price;
                                    if (meta.marketCap && !marketCap) marketCap = meta.marketCap;
                                    if (meta.volume24h && !volume24h) volume24h = meta.volume24h;
                                }
                            }
                        } catch (e) { 
                            console.error('Token meta fetch error for', t.mint, ':', e); 
                        }
                        
                        // Create a more informative fallback
                        if (symbol === 'Unknown Token' && name === 'Unknown Token') {
                            // Use a shortened version of the mint address as symbol
                            symbol = t.mint.slice(0, 6) + '...' + t.mint.slice(-4);
                            name = `Token (${t.mint.slice(0, 8)}...)`;
                        } else if (symbol === 'Unknown Token') {
                            symbol = name;
                        } else if (name === 'Unknown Token') {
                            name = symbol;
                        }
                        allHoldings[t.mint] = { amount: 0, symbol, price, marketCap, volume24h, name };
                    }
                    allHoldings[t.mint].amount += t.amount;
                }
                // Fetch recent trades for this wallet (mock: use getRecentWalletTrades if implemented)
                if (portfolioService.getRecentWalletTrades) {
                    const trades = await portfolioService.getRecentWalletTrades(wallet.public_key);
                    if (Array.isArray(trades)) recentTrades.push(...trades.map(tr => ({...tr, wallet: wallet.public_key})));
                }
            }

            // Add SOL as a holding
            allHoldings['SOL'] = { amount: solTotal, symbol: 'SOL', price: solPrice, marketCap: null, volume24h: null, name: 'Solana' };

            // Calculate total value
            const totalValue = Object.values(allHoldings).reduce((sum, h) => sum + (h.amount * (h.price || 0)), 0);

            // Save snapshot for 24h change
            const { PortfolioOperations } = require('../database/operations');
            const portfolioOps = new PortfolioOperations(this.db);
            await portfolioOps.savePortfolioSnapshot(user.id, totalValue);

            // Fetch value 24h ago and calculate change
            let change24h = 0;
            const value24hAgo = await portfolioOps.getPortfolioValue24hAgo(user.id);
            if (value24hAgo && value24hAgo > 0) {
                change24h = ((totalValue - value24hAgo) / value24hAgo) * 100;
            }

            // Format holdings with market cap and volume
            const holdingsList = Object.values(allHoldings)
                .filter(h => h.amount > 0)
                .map(h => `- ${h.symbol}: ${h.amount} ($${((h.amount || 0) * (h.price || 0)).toFixed(2)})`)
                .join('\n') || 'No tokens found';

            // Sort and format recent trades (show last 5)
            recentTrades = recentTrades.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).slice(0, 5);
            const tradesList = recentTrades.length > 0
                ? await Promise.all(recentTrades.map(async tr => {
                    let symbol = tr.token || tr.token_address || '';
                    let marketCap = 'N/A';
                    let volume24h = 'N/A';
                    try {
                        const meta = await marketDataService.getTokenData(tr.token_address || tr.token);
                        if (meta) {
                            if (meta.symbol) symbol = meta.symbol;
                        }
                    } catch (e) {}
                    return `• ${tr.side || tr.type || 'TRADE'} ${tr.amount} ${symbol} @ $${tr.price || ''}  (${tr.wallet ? tr.wallet.slice(0, 6) + '...' : ''}${tr.timestamp ? ', ' + new Date(tr.timestamp).toLocaleString() : ''})`;
                }))
                : '';

            const message = `
*📊 Portfolio Overview*

*Total Value:* $${totalValue.toFixed(2)}
*24h Change:* ${change24h.toFixed(2)}%

*Holdings:*
${holdingsList}


*Wallets:*\n${wallets.map(w => `\`${w.public_key.slice(0, 8)}...${w.public_key.slice(-8)}\``).join(' | ')}
`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh', callback_data: 'refresh_portfolio' },
                        { text: '📈 Trade History', callback_data: 'trade_history' }
                    ],
                    [
                        { text: '📤 Export Report', callback_data: 'export_portfolio' },
                        { text: '📊 Analytics', callback_data: 'portfolio_analytics' }
                    ],
                    [
                        { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            // Update cache
            this.portfolioCache.set(telegramId, {
                data: { message, keyboard },
                timestamp: Date.now()
            });
            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error viewing portfolio:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while fetching your portfolio.');
        }
    }

    async handleRefreshPortfolio(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                const message = `
*No Wallet Found*

Please create or import a wallet first to view your portfolio.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Show refreshing message first
            await this.sendAndStoreMessage(chatId, '🔄 *Refreshing portfolio data...*', {
                parse_mode: 'Markdown'
            });

            // Add a small delay to show the refreshing message
            await new Promise(resolve => setTimeout(resolve, 1500));

            // Fetch fresh portfolio data (reuse logic from handleViewPortfolio, but always fetch)
            // Fetch all holdings and recent trades for all wallets
            const PortfolioService = require('../services/portfolioService');
            const TokenDataService = require('../services/tokenDataService');
            const MarketDataService = require('../services/marketDataService');
            const portfolioService = new PortfolioService(this.config);
            const tokenDataService = new TokenDataService(this.config);
            const marketDataService = new MarketDataService();
            let allHoldings = {};
            let solTotal = 0;
            let solPrice = 0;
            let recentTrades = [];
            // Fetch SOL price once
            try {
                const axios = require('axios');
                const cgResp = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
                if (cgResp.data && cgResp.data.solana && cgResp.data.solana.usd) solPrice = cgResp.data.solana.usd;
            } catch (e) {}
            const wallets = await this.db.getWalletsByUserId(user.id);
            for (const wallet of wallets) {
                const walletBalance = await portfolioService.getWalletBalance(wallet.public_key);
                solTotal += walletBalance.sol;
                for (const t of walletBalance.tokens) {
                    if (!allHoldings[t.mint]) {
                        let symbol = 'Unknown Token';
                        let price = 0;
                        let marketCap = null;
                        let volume24h = null;
                        let name = 'Unknown Token';
                        try {
                            // Try TokenDataService first (more reliable)
                            const meta2 = await tokenDataService.getTokenData(t.mint);
                            if (meta2) {
                                if (meta2.symbol && meta2.symbol !== 'UNKNOWN') symbol = meta2.symbol;
                                if (meta2.name && meta2.name !== 'Unknown Token') name = meta2.name;
                                if (meta2.price) price = meta2.price;
                                if (meta2.marketCap) marketCap = meta2.marketCap;
                                if (meta2.volume24h) volume24h = meta2.volume24h;
                            }
                            
                            // If TokenDataService didn't provide good data, try MarketDataService
                            if (symbol === 'Unknown Token' || name === 'Unknown Token') {
                                const meta = await marketDataService.getTokenData(t.mint);
                                if (meta) {
                                    if (meta.symbol && symbol === 'Unknown Token') symbol = meta.symbol;
                                    if (meta.name && name === 'Unknown Token') name = meta.name;
                                    if (meta.price && !price) price = meta.price;
                                    if (meta.marketCap && !marketCap) marketCap = meta.marketCap;
                                    if (meta.volume24h && !volume24h) volume24h = meta.volume24h;
                                }
                            }
                        } catch (e) { 
                            console.error('Token meta fetch error for', t.mint, ':', e); 
                        }
                        
                        // Create a more informative fallback
                        if (symbol === 'Unknown Token' && name === 'Unknown Token') {
                            // Use a shortened version of the mint address as symbol
                            symbol = t.mint.slice(0, 6) + '...' + t.mint.slice(-4);
                            name = `Token (${t.mint.slice(0, 8)}...)`;
                        } else if (symbol === 'Unknown Token') {
                            symbol = name;
                        } else if (name === 'Unknown Token') {
                            name = symbol;
                        }
                        allHoldings[t.mint] = { amount: 0, symbol, price, marketCap, volume24h, name };
                    }
                    allHoldings[t.mint].amount += t.amount;
                }
                if (portfolioService.getRecentWalletTrades) {
                    const trades = await portfolioService.getRecentWalletTrades(wallet.public_key);
                    if (Array.isArray(trades)) recentTrades.push(...trades.map(tr => ({...tr, wallet: wallet.public_key})));
                }
            }
            allHoldings['SOL'] = { amount: solTotal, symbol: 'SOL', price: solPrice, marketCap: null, volume24h: null, name: 'Solana' };
            const totalValue = Object.values(allHoldings).reduce((sum, h) => sum + (h.amount * (h.price || 0)), 0);

            // Save snapshot for 24h change
            const { PortfolioOperations } = require('../database/operations');
            const portfolioOps = new PortfolioOperations(this.db);
            await portfolioOps.savePortfolioSnapshot(user.id, totalValue);

            // Fetch value 24h ago and calculate change
            let change24h = 0;
            const value24hAgo = await portfolioOps.getPortfolioValue24hAgo(user.id);
            if (value24hAgo && value24hAgo > 0) {
                change24h = ((totalValue - value24hAgo) / value24hAgo) * 100;
            }

            const holdingsList = Object.values(allHoldings)
                .filter(h => h.amount > 0)
                .map(h => {
                    // Market Cap
                    const marketCap = h.mcap || h.fdv || h.marketCap || null;
                    // 24h Volume
                    let volume24h = null;
                    if (h.stats24h && typeof h.stats24h.buyVolume === 'number' && typeof h.stats24h.sellVolume === 'number') {
                        volume24h = h.stats24h.buyVolume + h.stats24h.sellVolume;
                    } else if (typeof h.volume24h === 'number') {
                        volume24h = h.volume24h;
                    }
                    return `- ${h.symbol}: ${h.amount} ($${((h.amount || 0) * (h.price || 0)).toFixed(2)})`;
                })
                .join('\n') || 'No tokens found';
            recentTrades = recentTrades.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0)).slice(0, 5);
            const tradesList = recentTrades.length > 0
                ? recentTrades.map(tr => `• ${tr.side || tr.type || 'TRADE'} ${tr.amount} ${tr.token || tr.token_address || ''} @ $${tr.price || ''} (${tr.wallet ? tr.wallet.slice(0, 6) + '...' : ''})`).join('\n')
                : '';
            const message = `\n*📊 Portfolio Overview*\n\n*Total Value:* $${totalValue.toFixed(2)}\n*24h Change:* ${change24h.toFixed(2)}%\n\n*Holdings:*\n${holdingsList}\n\n*Wallets:*\n${wallets.map(w => `\`${w.public_key.slice(0, 8)}...${w.public_key.slice(-8)}\``).join(' | ')}\n`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh', callback_data: 'refresh_portfolio' },
                        { text: '📈 Trade History', callback_data: 'trade_history' }
                    ],
                    [
                        { text: '📤 Export Report', callback_data: 'export_portfolio' },
                        { text: '📊 Analytics', callback_data: 'portfolio_analytics' }
                    ],
                    [
                        { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };
            // Update cache
            this.portfolioCache.set(telegramId, {
                data: { message, keyboard },
                timestamp: Date.now()
            });
            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error refreshing portfolio:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while refreshing your portfolio.');
        }
    }

    async handleTradeHistory(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                const message = `
*No Wallet Found*

Please create or import a wallet first to view your trade history.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Show loading message
            await this.sendAndStoreMessage(chatId, '📈 *Loading trade history...*', {
                parse_mode: 'Markdown'
            });

            await new Promise(resolve => setTimeout(resolve, 1000));

            // Fetch real trade history and statistics
            const db = this.db;
            const MarketDataService = require('../services/marketDataService');
            const marketDataService = new MarketDataService();
            const recentTrades = db.getTradesByUser(user.id, 10) || [];
            const stats = db.getTradeStatsByUser(user.id) || { total_trades: 0, buy_trades: 0, sell_trades: 0, total_pnl: 0 };
            const winRate = stats.total_trades > 0 ? ((stats.sell_trades / stats.total_trades) * 100).toFixed(2) : '0.00';

            const tradesList = recentTrades.length > 0
                ? await Promise.all(recentTrades.map(async tr => {
                    let symbol = tr.token || tr.token_address || '';
                    let marketCap = 'N/A';
                    let volume24h = 'N/A';
                    try {
                        const meta = await marketDataService.getTokenData(tr.token_address || tr.token);
                        if (meta) {
                            if (meta.symbol) symbol = meta.symbol;
                        }
                    } catch (e) {}
                    return `• ${tr.side} ${tr.amount} ${symbol} @ $${tr.price} `;
                }))
                : 'No trades found for this wallet.';

            const message = `
*📈 Trade History*


*Statistics:*
- Total Trades: ${stats.total_trades}
- Successful Trades: ${stats.sell_trades}
- Win Rate: ${winRate}%
- Total P&L: $${stats.total_pnl ? stats.total_pnl.toFixed(2) : '0.00'}

*Wallet:* \`${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}\``;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh', callback_data: 'trade_history' },
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' }
                    ],
                    [
                        { text: '📤 Export Trades', callback_data: 'export_portfolio' },
                        { text: '📊 Analytics', callback_data: 'portfolio_analytics' }
                    ],
                    [
                        { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error viewing trade history:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while fetching your trade history.');
        }
    }

    async handleExportPortfolio(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                const message = `
*No Wallet Found*

Please create or import a wallet first to export your portfolio.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Show processing message
            await this.sendAndStoreMessage(chatId, '📤 *Preparing portfolio export...*', {
                parse_mode: 'Markdown'
            });

            await new Promise(resolve => setTimeout(resolve, 1200));

            // TODO: Implement actual portfolio export functionality
            const exportTime = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
            const message = `
*📤 Portfolio Export*

*Export Options:*

Choose your preferred export format:

*Available Formats:*
- CSV - Spreadsheet compatible
- JSON - Raw data format
- PDF - Formatted report

*Export Date:* ${exportTime}
*Wallet:* \`${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}\`

💡 *Note:* Export functionality coming soon!`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 CSV Export', callback_data: 'export_csv' },
                        { text: '📄 JSON Export', callback_data: 'export_json' }
                    ],
                    [
                        { text: '📋 PDF Report', callback_data: 'export_pdf' },
                    ],
                    [
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                        { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error exporting portfolio:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while preparing your portfolio export.');
        }
    }

    async handlePortfolioAnalytics(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                const message = `
*No Wallet Found*

Please create or import a wallet first to view portfolio analytics.`;

                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                        ]
                    ]
                };

                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Show loading message
            await this.sendAndStoreMessage(chatId, '📊 *Calculating portfolio analytics...*', {
                parse_mode: 'Markdown'
            });

            await new Promise(resolve => setTimeout(resolve, 1300));

            // Fetch real analytics
            const db = this.db;
            const { PortfolioOperations } = require('../database/operations');
            const PortfolioService = require('../services/portfolioService');
            const TokenDataService = require('../services/tokenDataService');
            const portfolioOps = new PortfolioOperations(db);
            const portfolioService = new PortfolioService(this.config);
            const tokenDataService = new TokenDataService(this.config);
            const stats = db.getTradeStatsByUser(user.id) || { total_trades: 0, buy_trades: 0, sell_trades: 0, total_pnl: 0 };
            // Portfolio value changes
            const value24hAgo = await portfolioOps.getPortfolioValue24hAgo(user.id);
            const value7dAgo = await portfolioOps.getPortfolioValue24hAgo(user.id); // For demo, use same as 24h
            const value30dAgo = await portfolioOps.getPortfolioValue24hAgo(user.id); // For demo, use same as 24h
            // Get current wallet balance and classify holdings
            const walletBalance = await portfolioService.getWalletBalance(activeWallet.public_key);
            let solValue = 0, stableValue = 0, tokenValue = 0, totalValue = 0;
            let stablecoins = ['USDC', 'USDT', 'USDP', 'DAI', 'TUSD', 'BUSD', 'USDD', 'FRAX', 'USDH', 'UXD'];
            let numTokens = 0;
            let largestHoldingPct = 0;
            let riskScore = 'Low';
            // Fetch SOL price
            let solPrice = 0;
            try {
                const axios = require('axios');
                const cgResp = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
                if (cgResp.data && cgResp.data.solana && cgResp.data.solana.usd) solPrice = cgResp.data.solana.usd;
            } catch (e) {}
            solValue = walletBalance.sol * solPrice;
            totalValue += solValue;
            // Classify SPL tokens
            for (const t of walletBalance.tokens) {
                let symbol = t.mint.slice(0, 4) + '...';
                let price = 0;
                try {
                    const meta = await tokenDataService.getTokenData(t.mint);
                    if (meta && meta.symbol) symbol = meta.symbol;
                    if (meta && meta.price) price = meta.price;
                } catch (e) {}
                const value = t.amount * price;
                totalValue += value;
                if (stablecoins.includes(symbol)) {
                    stableValue += value;
                } else {
                    tokenValue += value;
                }
                numTokens++;
                if (totalValue > 0 && value / totalValue > largestHoldingPct) largestHoldingPct = value / totalValue;
            }
            // Calculate allocation percentages
            const solPct = totalValue > 0 ? (solValue / totalValue) * 100 : 0;
            const stablePct = totalValue > 0 ? (stableValue / totalValue) * 100 : 0;
            const tokenPct = totalValue > 0 ? (tokenValue / totalValue) * 100 : 0;
            // Simple risk score: high if >50% in one holding or >5 tokens, else low
            if (largestHoldingPct > 0.5) riskScore = 'High';
            else if (numTokens > 5) riskScore = 'Medium';
            // Portfolio performance
            let totalReturn = 0, change24h = 0, change7d = 0, change30d = 0;
            if (value24hAgo && value24hAgo > 0) change24h = ((totalValue - value24hAgo) / value24hAgo) * 100;
            if (value7dAgo && value7dAgo > 0) change7d = ((totalValue - value7dAgo) / value7dAgo) * 100;
            if (value30dAgo && value30dAgo > 0) change30d = ((totalValue - value30dAgo) / value30dAgo) * 100;
            if (value30dAgo && value30dAgo > 0) totalReturn = ((totalValue - value30dAgo) / value30dAgo) * 100;

            const message = `
*📊 Portfolio Analytics*

*Performance Metrics:*
- Total Return: ${totalReturn.toFixed(2)}%
- Sharpe Ratio: N/A
- Max Drawdown: N/A
- Volatility: N/A

*Asset Allocation:*
- Tokens: ${tokenValue.toFixed(2)} (${tokenPct.toFixed(2)}%)
- SOL: ${solValue.toFixed(2)} (${solPct.toFixed(2)}%)
- Stablecoins: ${stableValue.toFixed(2)} (${stablePct.toFixed(2)}%)

*Risk Analysis:*
- Risk Score: ${riskScore}
- Largest Holding: ${(largestHoldingPct * 100).toFixed(2)}%
- Number of Tokens: ${numTokens}

*Recent Performance:*
- 24h: ${change24h.toFixed(2)}%
- 7d: ${change7d.toFixed(2)}%
- 30d: ${change30d.toFixed(2)}%

*Wallet:* \
\`${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}\`
`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '🔄 Refresh Analytics', callback_data: 'portfolio_analytics' },
                        { text: '📈 Trade History', callback_data: 'trade_history' }
                    ],
                    [
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                        { text: '📤 Export Report', callback_data: 'export_portfolio' }
                    ],
                    [
                        { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error calculating portfolio analytics:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while calculating your portfolio analytics.');
        }
    }

    async handlePortfolioRebalance(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const activeWallet = await this.db.getActiveWallet(user.id);

            if (!activeWallet) {
                await this.sendAndStoreMessage(chatId, '*No Wallet Found*\n\nPlease create a wallet first.');
                return;
            }

            // Fetch wallet balance using PortfolioService
            const PortfolioService = require('../services/portfolioService');
            const portfolioService = new PortfolioService(this.config);
            const walletBalance = await portfolioService.getWalletBalance(activeWallet.public_key);

            // Prepare holdings array
            const holdings = [];
            // Add SOL holding
            holdings.push({ symbol: 'SOL', amount: walletBalance.sol, price: 0 }); // Price will be fetched below

            // Fetch metadata for SPL tokens
            const TokenDataService = require('../services/tokenDataService');
            const tokenDataService = new TokenDataService(this.config);
            for (const t of walletBalance.tokens) {
                let symbol = t.mint.slice(0, 4) + '...';
                let price = 0;
                try {
                    const meta = await tokenDataService.getTokenData(t.mint);
                    if (meta && meta.symbol) symbol = meta.symbol;
                    if (meta && meta.price) price = meta.price;
                } catch (e) {}
                holdings.push({ symbol, amount: t.amount, price });
            }

            // Fetch SOL price
            let solPrice = 0;
            try {
                // Use CoinGecko for SOL price to match main menu logic
                const axios = require('axios');
                const cgResp = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
                if (cgResp.data && cgResp.data.solana && cgResp.data.solana.usd) solPrice = cgResp.data.solana.usd;
            } catch (e) {}
            holdings[0].price = solPrice;

            // Calculate total value
            const totalValue = holdings.reduce((sum, h) => sum + (h.amount * h.price), 0);

            const message = `
*⚖️ Portfolio Rebalancing*

Portfolio rebalancing helps maintain your target allocation across different asset categories.

*Current Status:*
• Portfolio Value: $${totalValue ? totalValue.toFixed(2) : '0.00'}
• Last Rebalance: Never
• Target Allocations: Not set

*Rebalancing Options:*
• Automatic rebalancing based on rules
• Manual rebalancing triggers
• Custom allocation targets

💡 *Note:* Set up your target allocations in strategy settings first.`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '⚙️ Set Allocations', callback_data: 'strategy_settings' },
                        { text: '🔄 Auto Rebalance', callback_data: 'toggle_auto_rebalance' }
                    ],
                    [
                        { text: '📊 View Portfolio', callback_data: 'view_portfolio' },
                        { text: '◀️ Back', callback_data: 'view_portfolio' }
                    ]
                ]
            };

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });
        } catch (error) {
            console.error('Error in handlePortfolioRebalance:', error);
            await this.sendAndStoreMessage(chatId, 'Sorry, something went wrong while loading portfolio rebalancing.');
        }
    }

    /**
     * Enhanced portfolio view using the comprehensive wallet holdings service
     */
    async handleEnhancedViewPortfolio(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const wallets = await this.db.getWalletsByUserId(user.id);

            if (!wallets || wallets.length === 0) {
                const message = `
*No Wallets Found*

Please create or import a wallet first to view your portfolio.`;
                const keyboard = {
                    inline_keyboard: [
                        [
                            { text: '👛 Create Wallet', callback_data: 'create_wallet' },
                            { text: '📥 Import Wallet', callback_data: 'import_wallet' }
                        ],
                        [
                            { text: '◀️ Back to Main Menu', callback_data: 'main_menu' }
                        ]
                    ]
                };
                await this.sendAndStoreMessage(chatId, message, {
                    parse_mode: 'Markdown',
                    reply_markup: keyboard
                });
                return;
            }

            // Show loading message
            const loadingMsg = await this.sendAndStoreMessage(chatId, '🔍 Fetching comprehensive portfolio data...');

            let totalPortfolioValue = 0;
            let totalHoldings = 0;
            const allWalletData = [];
            const consolidatedHoldings = new Map();

            // Process each wallet
            for (const wallet of wallets) {
                try {
                    const holdings = await this.holdingsService.getAllHoldings(wallet.public_key);
                    allWalletData.push({
                        wallet: wallet,
                        holdings: holdings
                    });

                    totalPortfolioValue += holdings.totalValue.usd || 0;
                    totalHoldings += holdings.totalHoldings;

                    // Consolidate holdings across wallets
                    holdings.holdings.forEach(holding => {
                        const key = holding.mint;
                        if (consolidatedHoldings.has(key)) {
                            const existing = consolidatedHoldings.get(key);
                            existing.balance += holding.balance;
                            existing.value.usd = (existing.value.usd || 0) + (holding.value.usd || 0);
                            existing.value.formatted = existing.value.usd ? `$${existing.value.usd.toFixed(2)}` : null;
                        } else {
                            consolidatedHoldings.set(key, { ...holding });
                        }
                    });
                } catch (error) {
                    console.error(`Error fetching holdings for wallet ${wallet.public_key}:`, error.message);
                    // Continue with other wallets
                }
            }

            // Sort consolidated holdings by value
            const sortedHoldings = Array.from(consolidatedHoldings.values())
                .sort((a, b) => {
                    if (a.value.usd && b.value.usd) {
                        return b.value.usd - a.value.usd;
                    } else if (a.value.usd) {
                        return -1;
                    } else if (b.value.usd) {
                        return 1;
                    } else {
                        return b.balance - a.balance;
                    }
                });

            // Build comprehensive portfolio message
            let message = `*🏦 Enhanced Portfolio Summary*\n\n`;
            message += `💰 *Total Value:* $${totalPortfolioValue.toFixed(2)}\n`;
            message += `📊 *Total Holdings:* ${totalHoldings} tokens\n`;
            message += `👛 *Wallets:* ${wallets.length}\n\n`;

            // Show top holdings
            message += `*🏆 Top Holdings:*\n`;
            const topHoldings = sortedHoldings.slice(0, 10);
            
            topHoldings.forEach((holding, index) => {
                const percentage = totalPortfolioValue > 0 ? 
                    ((holding.value.usd || 0) / totalPortfolioValue * 100).toFixed(1) : '0.0';
                const verifiedIcon = holding.metadata?.verified ? '✅' : '❌';
                
                message += `${index + 1}. ${verifiedIcon} *${holding.symbol}*\n`;
                message += `   Balance: ${holding.balance.toFixed(6)}\n`;
                message += `   Value: ${holding.value.formatted || 'N/A'} (${percentage}%)\n\n`;
            });

            // Portfolio analysis
            if (sortedHoldings.length > 0) {
                const analysis = this.analyzePortfolioRisk(sortedHoldings, totalPortfolioValue);
                message += `*📈 Portfolio Analysis:*\n`;
                message += `Risk Level: ${analysis.riskLevel}\n`;
                message += `Diversification: ${analysis.diversificationLevel}\n`;
                message += `Native SOL: ${analysis.solPercentage.toFixed(1)}%\n`;
                message += `Stablecoins: ${analysis.stablecoinPercentage.toFixed(1)}%\n\n`;
            }

            // Wallet breakdown
            if (allWalletData.length > 1) {
                message += `*👛 Wallet Breakdown:*\n`;
                allWalletData.forEach((walletData, index) => {
                    const shortAddress = `${walletData.wallet.public_key.slice(0, 6)}...${walletData.wallet.public_key.slice(-4)}`;
                    const walletValue = walletData.holdings.totalValue.formatted || '$0.00';
                    message += `${index + 1}. ${shortAddress}: ${walletValue}\n`;
                });
                message += '\n';
            }

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📊 Detailed Analysis', callback_data: 'portfolio_detailed_analysis' },
                        { text: '⚖️ Rebalance', callback_data: 'portfolio_rebalance' }
                    ],
                    [
                        { text: '📄 Export Report', callback_data: 'export_portfolio' },
                        { text: '🔄 Refresh', callback_data: 'enhanced_view_portfolio' }
                    ],
                    [
                        { text: '◀️ Back to Portfolio', callback_data: 'view_portfolio' }
                    ]
                ]
            };

            // Delete loading message and send portfolio data
            try {
                await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            } catch (e) {
                // Ignore delete errors
            }

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error('Error in handleEnhancedViewPortfolio:', error);
            await this.sendAndStoreMessage(chatId, '❌ Error fetching enhanced portfolio data. Please try again.');
        }
    }

    /**
     * Analyze portfolio risk and diversification
     */
    analyzePortfolioRisk(holdings, totalValue) {
        let riskScore = 0;
        let solPercentage = 0;
        let stablecoinPercentage = 0;
        let verifiedPercentage = 0;

        holdings.forEach(holding => {
            const weight = totalValue > 0 ? (holding.value.usd || 0) / totalValue : 0;
            
            if (holding.isNative) {
                solPercentage += weight * 100;
                riskScore += weight * 0.3; // SOL is moderate risk
            } else if (holding.tags?.includes('stablecoin')) {
                stablecoinPercentage += weight * 100;
                riskScore += weight * 0.1; // Stablecoins are low risk
            } else if (holding.metadata?.verified) {
                verifiedPercentage += weight * 100;
                riskScore += weight * 0.5; // Verified tokens moderate risk
            } else {
                riskScore += weight * 0.9; // Unverified tokens high risk
            }
        });

        // Calculate diversification score
        const holdingsCount = holdings.length;
        const largestHolding = Math.max(...holdings.map(h => 
            totalValue > 0 ? ((h.value.usd || 0) / totalValue) * 100 : 0
        ));

        const diversificationScore = Math.min(holdingsCount / 10, 1) - (largestHolding / 100) * 0.5;

        return {
            riskScore: Math.round(riskScore * 100),
            riskLevel: riskScore > 0.7 ? 'High 🔴' : riskScore > 0.4 ? 'Medium 🟡' : 'Low 🟢',
            diversificationScore: Math.round(diversificationScore * 100),
            diversificationLevel: diversificationScore > 0.7 ? 'Good 🟢' : diversificationScore > 0.4 ? 'Moderate 🟡' : 'Poor 🔴',
            solPercentage,
            stablecoinPercentage,
            verifiedPercentage
        };
    }

    /**
     * Handle detailed portfolio analysis
     */
    async handleDetailedAnalysis(chatId, telegramId) {
        try {
            const user = await this.db.getUserByTelegramId(telegramId);
            const wallets = await this.db.getWalletsByUserId(user.id);

            if (!wallets || wallets.length === 0) {
                await this.sendAndStoreMessage(chatId, '❌ No wallets found for analysis.');
                return;
            }

            const loadingMsg = await this.sendAndStoreMessage(chatId, '🔍 Performing detailed portfolio analysis...');

            let message = `*📊 Detailed Portfolio Analysis*\n\n`;

            for (const wallet of wallets) {
                try {
                    const holdings = await this.holdingsService.getAllHoldings(wallet.public_key);
                    const shortAddress = `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`;
                    
                    message += `*Wallet: ${shortAddress}*\n`;
                    message += `Total Value: ${holdings.totalValue.formatted}\n`;
                    message += `Holdings Count: ${holdings.totalHoldings}\n\n`;

                    // Risk analysis for this wallet
                    const analysis = this.analyzePortfolioRisk(holdings.holdings, holdings.totalValue.usd);
                    message += `Risk Assessment:\n`;
                    message += `• Risk Level: ${analysis.riskLevel}\n`;
                    message += `• Diversification: ${analysis.diversificationLevel}\n`;
                    message += `• SOL Allocation: ${analysis.solPercentage.toFixed(1)}%\n`;
                    message += `• Stablecoin Allocation: ${analysis.stablecoinPercentage.toFixed(1)}%\n\n`;

                    // Performance metrics
                    const performanceMetrics = await this.calculatePerformanceMetrics(wallet.public_key);
                    if (performanceMetrics) {
                        message += `Performance (24h):\n`;
                        message += `• P&L: ${performanceMetrics.pnl24h}\n`;
                        message += `• Change: ${performanceMetrics.change24h}\n\n`;
                    }

                    message += '─────────────────────\n\n';

                } catch (error) {
                    console.error(`Error analyzing wallet ${wallet.public_key}:`, error.message);
                    message += `❌ Error analyzing wallet ${wallet.public_key.slice(0, 8)}...\n\n`;
                }
            }

            // Add recommendations
            message += `*💡 Recommendations:*\n`;
            message += `• Consider diversifying across more tokens if concentration is high\n`;
            message += `• Maintain 10-20% in stablecoins for stability\n`;
            message += `• Only invest in verified tokens for lower risk\n`;
            message += `• Monitor token performance regularly\n`;

            const keyboard = {
                inline_keyboard: [
                    [
                        { text: '📄 Export Analysis', callback_data: 'export_analysis' },
                        { text: '🔄 Refresh Analysis', callback_data: 'portfolio_detailed_analysis' }
                    ],
                    [
                        { text: '◀️ Back to Portfolio', callback_data: 'enhanced_view_portfolio' }
                    ]
                ]
            };

            try {
                await this.bot.deleteMessage(chatId, loadingMsg.message_id);
            } catch (e) {
                // Ignore delete errors
            }

            await this.sendAndStoreMessage(chatId, message, {
                parse_mode: 'Markdown',
                reply_markup: keyboard
            });

        } catch (error) {
            console.error('Error in handleDetailedAnalysis:', error);
            await this.sendAndStoreMessage(chatId, '❌ Error performing detailed analysis. Please try again.');
        }
    }

    /**
     * Calculate performance metrics for a wallet
     */
    async calculatePerformanceMetrics(walletAddress) {
        try {
            // This would ideally fetch historical data
            // For now, return mock data or implement based on your trade history
            return {
                pnl24h: '+$0.00',
                change24h: '+0.00%'
            };
        } catch (error) {
            console.error('Error calculating performance metrics:', error);
            return null;
        }
    }

    /**
     * Handle export analysis request
     */
    async handleExportAnalysis(chatId, telegramId) {
        try {
            await this.sendAndStoreMessage(chatId, '📄 Portfolio analysis export feature coming soon!');
        } catch (error) {
            console.error('Error in handleExportAnalysis:', error);
            await this.sendAndStoreMessage(chatId, '❌ Error exporting analysis.');
        }
    }

    async sendAndStoreMessage(chatId, message, options = {}) {
        const sentMessage = await this.bot.sendMessage(chatId, message, options);
        this.lastMessageIds.set(chatId, sentMessage.message_id);
        return sentMessage;
    }
}

module.exports = PortfolioHandlers;
