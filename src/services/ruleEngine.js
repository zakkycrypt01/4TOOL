const TokenDataService = require('./tokenDataService');

class RuleEngine {
    constructor(db, config) {
        this.db = db;
        this.tokenDataService = new TokenDataService(config);
        this.isAutonomousMode = false;
    }

    async evaluateRule(ruleId, tokenAddress) {
        try {
            // Get rule and its criteria
            const rule = await this.getRule(ruleId);
            const criteria = await this.getRuleCriteria(ruleId);
            const metrics = await this.getRuleMetrics(ruleId);

            // Get token data
            const tokenData = await this.tokenDataService.getTokenMetrics(tokenAddress);

            // Evaluate criteria
            const criteriaMatch = await this.evaluateCriteria(criteria, tokenData);
            if (!criteriaMatch) {
                return { match: false };
            }

            // Evaluate metrics
            const metricsMatch = await this.evaluateMetrics(metrics, tokenData);
            if (!metricsMatch) {
                return { match: false };
            }

            // Record rule trigger
            await this.recordRuleTrigger(ruleId, tokenAddress, tokenData);

            return {
                match: true,
                tokenData,
                rule
            };
        } catch (error) {
            console.error('Error evaluating rule:', error);
            throw error;
        }
    }

    async getRule(ruleId) {
        const query = 'SELECT * FROM rules WHERE id = ?';
        return new Promise((resolve, reject) => {
            this.db.get(query, [ruleId], (err, row) => {
                if (err) reject(err);
                resolve(row);
            });
        });
    }

    async getRuleCriteria(ruleId) {
        // Use the same rule_conditions table as the rest of the application
        const query = 'SELECT * FROM rule_conditions WHERE rule_id = ?';
        return new Promise((resolve, reject) => {
            this.db.all(query, [ruleId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    async getRuleMetrics(ruleId) {
        // For now, return empty array since we're not using separate metrics table
        return [];
    }

    async evaluateCriteria(criteria, tokenData) {
        for (const criterion of criteria) {
            try {
                let value;
                // For category and timeframe conditions, the value is a string, not JSON
                if (criterion.condition_type === 'category' || criterion.condition_type === 'discovery_category' || 
                    criterion.condition_type === 'timeframe' || criterion.condition_type === 'discovery_timeframe') {
                    value = criterion.condition_value;
                } else {
                    value = JSON.parse(criterion.condition_value);
                }
                const operator = criterion.operator || 'equals';

                switch (criterion.condition_type) {
                    case 'category':
                    case 'discovery_category':
                        if (!this.evaluateCategory(value, tokenData.category)) {
                            return false;
                        }
                        break;
                    case 'market_cap':
                    case 'discovery_market_cap':
                        if (!this.evaluateNumericRange(operator, tokenData.marketCap, value)) {
                            return false;
                        }
                        break;
                    case 'price':
                    case 'discovery_price':
                        if (!this.evaluateNumericRange(operator, tokenData.price, value)) {
                            return false;
                        }
                        break;
                    case 'liquidity':
                    case 'discovery_liquidity':
                        if (!this.evaluateNumericRange(operator, tokenData.liquidity, value)) {
                            return false;
                        }
                        break;
                    case 'volume':
                    case 'discovery_volume':
                        if (!this.evaluateNumericRange(operator, tokenData.volume, value)) {
                            return false;
                        }
                        break;
                    case 'timeframe':
                    case 'discovery_timeframe':
                        // Timeframe is typically used for change calculations
                        // Since we're evaluating static token data, we'll skip timeframe conditions
                        // They should be handled in the change evaluation phase
                        break;
                    case 'num_buys':
                        if (!this.evaluateNumericRange(operator, tokenData.numBuys || tokenData.num_buys, value)) {
                            return false;
                        }
                        break;
                    case 'num_sells':
                        if (!this.evaluateNumericRange(operator, tokenData.numSells || tokenData.num_sells, value)) {
                            return false;
                        }
                        break;
                }
            } catch (error) {
                console.error('Error evaluating criterion:', criterion, error);
                return false;
            }
        }
        return true;
    }

    async evaluateMetrics(metrics, tokenData) {
        for (const metric of metrics) {
            switch (metric.metric_type) {
                case 'volume_change':
                    if (!this.evaluateChange(metric.direction, tokenData.volumeChange, metric.threshold)) {
                        return false;
                    }
                    break;
                case 'price_change':
                    if (!this.evaluateChange(metric.direction, tokenData.priceChange, metric.threshold)) {
                        return false;
                    }
                    break;
            }
        }
        return true;
    }

    evaluateCategory(expectedCategory, actualCategory) {
        return expectedCategory.toLowerCase() === actualCategory.toLowerCase();
    }

    evaluateNumeric(operator, actual, expected, secondaryValue) {
        switch (operator) {
            case '>':
                return actual > expected;
            case '<':
                return actual < expected;
            case '=':
                return actual === expected;
            case '>=':
                return actual >= expected;
            case '<=':
                return actual <= expected;
            case 'between':
                return actual >= expected && actual <= secondaryValue;
            default:
                return false;
        }
    }

    evaluateNumericRange(operator, actual, value) {
        // Handle both single values and range objects
        if (typeof value === 'object' && value !== null) {
            // Range object with min/max
            if (value.min !== undefined && value.min !== null && actual < Number(value.min)) {
                return false;
            }
            if (value.max !== undefined && value.max !== null && actual > Number(value.max)) {
                return false;
            }
            return true;
        } else {
            // Single value with operator
            return this.evaluateNumeric(operator, actual, Number(value));
        }
    }

    evaluateChange(direction, actual, threshold) {
        const thresholdValue = Math.abs(threshold);
        const actualValue = Math.abs(actual);

        if (direction === 'increase') {
            return actual > 0 && actualValue >= thresholdValue;
        } else if (direction === 'decrease') {
            return actual < 0 && actualValue >= thresholdValue;
        }
        return false;
    }

    async recordRuleTrigger(ruleId, tokenAddress, tokenData) {
        const query = `
            INSERT INTO rule_history (
                rule_id, token_address, token_name,
                trigger_price, trigger_volume, trigger_market_cap,
                trigger_liquidity, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;

        return new Promise((resolve, reject) => {
            this.db.run(query, [
                ruleId,
                tokenAddress,
                tokenData.name,
                tokenData.price,
                tokenData.volume,
                tokenData.marketCap,
                tokenData.liquidity,
                'triggered'
            ], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }

    async updateRuleStats(ruleId, success) {
        const query = `
            UPDATE rules 
            SET success_count = success_count + ?,
                failure_count = failure_count + ?,
                last_check_at = CURRENT_TIMESTAMP
            WHERE id = ?
        `;

        return new Promise((resolve, reject) => {
            this.db.run(query, [
                success ? 1 : 0,
                success ? 0 : 1,
                ruleId
            ], (err) => {
                if (err) reject(err);
                resolve();
            });
        });
    }
}

module.exports = RuleEngine; 