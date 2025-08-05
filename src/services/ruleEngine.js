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
        const query = 'SELECT * FROM rule_criteria WHERE rule_id = ?';
        return new Promise((resolve, reject) => {
            this.db.all(query, [ruleId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    async getRuleMetrics(ruleId) {
        const query = 'SELECT * FROM rule_metrics WHERE rule_id = ?';
        return new Promise((resolve, reject) => {
            this.db.all(query, [ruleId], (err, rows) => {
                if (err) reject(err);
                resolve(rows);
            });
        });
    }

    async evaluateCriteria(criteria, tokenData) {
        for (const criterion of criteria) {
            const value = JSON.parse(criterion.value);
            const secondaryValue = criterion.secondary_value ? JSON.parse(criterion.secondary_value) : null;

            switch (criterion.criteria_type) {
                case 'category':
                    if (!this.evaluateCategory(value, tokenData.category)) {
                        return false;
                    }
                    break;
                case 'market_cap':
                    if (!this.evaluateNumeric(criterion.operator, tokenData.marketCap, value, secondaryValue)) {
                        return false;
                    }
                    break;
                case 'price':
                    if (!this.evaluateNumeric(criterion.operator, tokenData.price, value, secondaryValue)) {
                        return false;
                    }
                    break;
                case 'liquidity':
                    if (!this.evaluateNumeric(criterion.operator, tokenData.liquidity, value, secondaryValue)) {
                        return false;
                    }
                    break;
                case 'num_buys':
                    if (!this.evaluateNumeric(criterion.operator || '>=', tokenData.numBuys || tokenData.num_buys, value.min, secondaryValue)) {
                        return false;
                    }
                    break;
                case 'num_sells':
                    if (!this.evaluateNumeric(criterion.operator || '>=', tokenData.numSells || tokenData.num_sells, value.min, secondaryValue)) {
                        return false;
                    }
                    break;
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