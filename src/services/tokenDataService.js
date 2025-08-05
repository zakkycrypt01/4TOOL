const axios = require('axios');
// Removed MarketDataService import since we only use Jupiter now

class TokenDataService {
    constructor(config) {
        // No API keys needed for Jupiter
        this.priceCache = new Map(); // tokenAddress -> { priceData, timestamp }
        this.cacheTTL = 20 * 1000; // 30 seconds
        this.lastJupiterCall = 0; // Timestamp of last Jupiter API call
        this.cooldownMs = (config && config.jupiterCooldownMs) ? config.jupiterCooldownMs : 10 * 1000; // Configurable cooldown
        this.cooldownPromise = null; // Promise for ongoing cooldown
    }

    async cooldownIfNeeded() {
        const now = Date.now();
        const timeSinceLast = now - this.lastJupiterCall;
        if (timeSinceLast < this.cooldownMs) {
            // If a cooldown is already in progress, wait for it
            if (this.cooldownPromise) {
                await this.cooldownPromise;
            } else {
                // Otherwise, create a new cooldown promise
                this.cooldownPromise = new Promise(resolve => {
                    setTimeout(() => {
                        this.cooldownPromise = null;
                        resolve();
                    }, this.cooldownMs - timeSinceLast);
                });
                await this.cooldownPromise;
            }
        }
        // Update last call time
        this.lastJupiterCall = Date.now();
    }

    async getTokenData(tokenAddress) {
        // Check cache first
        const cached = this.priceCache.get(tokenAddress);
        const now = Date.now();
        if (cached && (now - cached.timestamp < this.cacheTTL)) {
            return cached.priceData;
        }
        try {
            await this.cooldownIfNeeded();
            const jupiterData = await this.getJupiterData(tokenAddress);
            // Cache the result
            this.priceCache.set(tokenAddress, { priceData: jupiterData, timestamp: Date.now() });
            return jupiterData;
        } catch (error) {
            console.error('Error fetching token data:', error);
            throw error;
        }
    }

    async getJupiterData(tokenAddress) {
        try {
            const url = `https://lite-api.jup.ag/tokens/v2/search?query=${tokenAddress}`;
            const response = await axios.get(url, { headers: { 'Accept': 'application/json' } });
            // Jupiter returns an array; find the token with exact mint match
            if (Array.isArray(response.data) && response.data.length > 0) {
                const token = response.data.find(t => t.address === tokenAddress || t.mint === tokenAddress) || response.data[0];
                return {
                    price: token.usdPrice,
                    address: token.address || token.mint,
                    symbol: token.symbol,
                    name: token.name,
                    marketCap: token.marketCap,
                    category: token.category
                };
            }
            return null;
        } catch (error) {
            console.error('Error fetching Jupiter data:', error);
            return null;
        }
    }

    async getTokenMetrics(tokenAddress, timeframe = '1h') {
        const data = await this.getTokenData(tokenAddress);
        
        return {
            price: data?.price,
            marketCap: data?.marketCap,
            volume: undefined, 
            priceChange: undefined, 
            volumeChange: undefined,
            liquidity: undefined, 
            category: data?.category
        };
    }

    /**
     * Fetch tokens from Jupiter, filter by rule criteria, and return a random selection.
     * @param {Object} rule - The rule object containing criteria for filtering tokens.
     * @param {number} count - Number of random tokens to return (default 3).
     * @param {Object} db - Database manager instance for user-specific data.
     * @param {Object} config - Config object.
     * @param {number} userId - User ID for user-specific filtering (optional).
     * @returns {Promise<Array>} Array of token objects.
     */
    async getTokensByCriteria(rule, count = 3, db = null, config = null, userId = null) {
        try {
            // Fetch trending tokens from Jupiter
            const axios = require('axios');
            const response = await axios.get('https://lite-api.jup.ag/tokens/v2/toptraded/24h', {
                headers: { 'Accept': 'application/json' }
            });
            let tokens = Array.isArray(response.data) ? response.data : (response.data?.data || []);
            console.log(`[TokenDataService] Rule:`, JSON.stringify(rule, null, 2));
            console.log(`[TokenDataService] Tokens fetched from Jupiter: ${tokens.length}`);
            if (!tokens.length) return [];

            // Fetch rule conditions from DB if possible
            let conditions = [];
            if (db && rule.id) {
                if (typeof db.getRuleConditions === 'function') {
                    conditions = await db.getRuleConditions(rule.id);
                }
            }
            console.log(`[TokenDataService] Rule conditions:`, JSON.stringify(conditions, null, 2));

            // Filtering logic (category, market cap, price, etc.)
            const filtered = tokens.filter(token => {
                // Check ALL conditions - token must pass every single one
                for (const cond of conditions) {
                    try {
                        const value = JSON.parse(cond.condition_value);
                        let conditionPassed = true;
                        
                        switch (cond.condition_type) {
                            case 'category':
                                if (!token.category || token.category.toLowerCase() !== value.toLowerCase()) {
                                    conditionPassed = false;
                                }
                                break;
                            case 'market_cap': {
                                // Support both marketCap and market_cap from API
                                const cap = token.marketCap ?? token.market_cap;
                                if (cap === undefined || cap === null) { 
                                    conditionPassed = false; 
                                    break; 
                                }
                                if (typeof value === 'object') {
                                    if (value.min !== undefined && value.min !== null && cap < Number(value.min)) conditionPassed = false;
                                    if (value.max !== undefined && value.max !== null && cap > Number(value.max)) conditionPassed = false;
                                } else {
                                    if (cond.operator === '>=') { if (cap < Number(value)) conditionPassed = false; }
                                    else if (cond.operator === '<=') { if (cap > Number(value)) conditionPassed = false; }
                                    else if (!cond.operator && cap > Number(value)) conditionPassed = false; // fallback: treat as max
                                }
                                if (!conditionPassed) {
                                    console.log(`[TokenDataService] Token ${token.symbol || token.address || token.mint} filtered out by market_cap condition:`, cond, 'Token market cap:', cap);
                                }
                                break;
                            }
                            case 'price':
                                if (token.usdPrice === undefined || token.usdPrice === null) { 
                                    conditionPassed = false; 
                                    break; 
                                }
                                if (cond.operator === '>=') { if (token.usdPrice < value) conditionPassed = false; }
                                if (cond.operator === '<=') { if (token.usdPrice > value) conditionPassed = false; }
                                break;
                            // Add more condition types as needed
                        }
                        
                        // If any condition fails, the token is rejected
                        if (!conditionPassed) {
                            return false;
                        }
                    } catch (e) {
                        console.log(`[TokenDataService] Error parsing condition or filtering token:`, e, cond);
                        return false; // Reject token if condition parsing fails
                    }
                }
                // If we get here, ALL conditions passed
                return true;
            });
            console.log(`[TokenDataService] Tokens after filtering: ${filtered.length}`);
            if (!filtered.length) {
                console.log(`[TokenDataService] No tokens matched the rule. Returning empty array.`);
                return [];
            }
            // Shuffle and pick up to count
            const shuffled = filtered.sort(() => 0.5 - Math.random());
            return shuffled.slice(0, count);
        } catch (error) {
            console.error('[TokenDataService] Error in getTokensByCriteria:', error);
            return [];
        }
    }
}

module.exports = TokenDataService;