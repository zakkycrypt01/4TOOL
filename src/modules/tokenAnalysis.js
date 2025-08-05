class TokenAnalysis {
    constructor() {
        this.riskLevels = {
            LOW: '🟢 Low Risk',
            MEDIUM: '🟡 Medium Risk',
            HIGH: '🔴 High Risk',
            EXTREME: '⛔️ Extreme Risk'
        };
        this.riskIcons = {
            danger: '⚠️',
            warning: '⚡️',
            info: 'ℹ️',
            success: '✅'
        };
    }

    formatNumber(num) {
        if (!num) return '0';
        
        // Convert to number if it's a string
        num = Number(num);
        
        // Handle very large numbers
        if (num >= 1e12) return (num / 1e12).toFixed(2) + 'T';
        if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
        if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
        if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
        
        // For smaller numbers, use standard formatting
        return new Intl.NumberFormat('en-US', {
            maximumFractionDigits: 2,
            minimumFractionDigits: 0
        }).format(num);
    }

    formatAddress(address) {
        if (!address) return 'N/A';
        return `${address.slice(0, 4)}...${address.slice(-4)}`;
    }

    formatPrice(price) {
        if (!price) return '$0.00';
        
        // Convert to number if it's a string
        price = Number(price);
        
        // Handle very large numbers
        if (price >= 1e12) return '$' + (price / 1e12).toFixed(2) + 'T';
        if (price >= 1e9) return '$' + (price / 1e9).toFixed(2) + 'B';
        if (price >= 1e6) return '$' + (price / 1e6).toFixed(2) + 'M';
        if (price >= 1e3) return '$' + (price / 1e3).toFixed(2) + 'K';
        
        // For smaller numbers, use standard currency formatting
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 6
        }).format(price);
    }

    formatPercentage(num) {
        if (!num) return '0%';
        // Convert to number if it's a string
        num = Number(num);
        return `${this.formatNumber(num)}%`;
    }

    getRiskLevel(score) {
        if (!score) return this.riskLevels.LOW;
        // Use the actual risk level from the API response
        const riskLevel = score.riskLevel || score_normalised;
        if (riskLevel >= 80) return this.riskLevels.EXTREME;
        if (riskLevel >= 60) return this.riskLevels.HIGH;
        if (riskLevel >= 40) return this.riskLevels.MEDIUM;
        return this.riskLevels.LOW;
    }

    formatRiskFactor(risk) {
        if (!risk) return '';
        const icon = this.riskIcons[risk.level] || 'ℹ️';
        return `${icon} ${risk.name}: ${risk.description}`;
    }

    formatTokenInfo(tokenData) {
        try {
            const {
                mint,
                creator,
                creatorBalance,
                token,
                tokenMeta,
                topHolders,
                riskScore = 0,
                riskWarnings = [],
                risks = [],
                score_normalised = 0,
                markets = []
            } = tokenData;

            // Calculate total percentage held by top holders
            const totalTopHolderPercentage = topHolders?.reduce((sum, holder) => sum + holder.pct, 0) || 0;

            // Get the first market's LP data if available
            const lpData = markets[0]?.lp;
            
            // Calculate actual supply by dividing by decimals
            const actualSupply = token?.supply ? Number(token.supply) / Math.pow(10, token.decimals || 0) : 0;
            
            // Calculate market cap using token price and actual supply
            const marketCap = lpData ? (actualSupply * lpData.basePrice) : 0;
            
            // Get total liquidity from LP data
            const totalLiquidity = lpData?.lpLockedUSD || 0;

            // Format the message with a more modern and professional layout
            const message = `🔹 *${this.escapeMarkdown(tokenMeta?.name || 'Unknown Token')}* (${this.escapeMarkdown(tokenMeta?.symbol || 'N/A')})
📍 \`${mint}\`

⚠️ *Risk Analysis*
• Risk Score: ${score_normalised}/100
• Risk Level: ${this.getRiskLevel(riskScore)}
${risks?.length > 0 ? `• Risk Factors: ${risks.length} identified` : ''}
${riskWarnings?.length > 0 ? `• Warnings: ${riskWarnings.length} found` : ''}

📊 *Token Overview*
• Supply: ${this.formatNumber(actualSupply)}
• Market Cap: ${this.formatPrice(marketCap)}
• Total Liquidity: ${this.formatPrice(totalLiquidity)}
• Creator: ${this.formatAddress(creator)}
• Creator Balance: ${creatorBalance ? '💎 HOLDING' : '💸 SOLD'}
• Mint Authority: ${token?.mintAuthority ? '✅ Active' : '❌ Disabled'}
• Decimals: ${token?.decimals || 'N/A'}

💧 *Liquidity Information*
${lpData ? `• Total Liquidity: ${this.formatPrice(lpData.lpLockedUSD)}
• Token Price: ${this.formatPrice(lpData.basePrice)}
• LP Tokens Locked: ${this.formatNumber(lpData.lpLocked)}
• Locked Percentage: ${this.formatPercentage(lpData.lpLockedPct)}` : '• No liquidity pool data available'}

👥 *Top Holders*
• Total Concentration: ${this.formatPercentage(totalTopHolderPercentage)}
${topHolders?.slice(0, 3).map((holder, index) => 
    `${index + 1}\\. ${this.formatAddress(holder.address)} • ${this.formatPercentage(holder.pct)}`
).join('\n') || 'No holder data available'}

📝 *Metadata*
• Name: ${this.escapeMarkdown(tokenMeta?.name || 'N/A')}
• Symbol: ${this.escapeMarkdown(tokenMeta?.symbol || 'N/A')}
• URI: ${tokenMeta?.uri ? '✅ Available' : '❌ Not Available'}
• Update Authority: ${this.formatAddress(tokenMeta?.updateAuthority)}`;

            return message;
        } catch (error) {
            console.error('Error formatting token info:', error);
            // Return a simple fallback message
            return `🔹 *Token Analysis*
📍 \`${tokenData.mint || 'Unknown'}\`

Unable to format full token information.
Basic data available but formatting failed.`;
        }
    }

    escapeMarkdown(text) {
        if (!text) return '';
        // Escape special markdown characters
        return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    }

    getActionButtons(mint) {
        return {
            inline_keyboard: [
                [
                    { text: '🛒 Buy Now', callback_data: `buy_token_${mint}` },
                    // { text: '📊 More Info', callback_data: `token_details_${mint}` }
                ],
                [
                    { text: '🔄 Check Another Token', callback_data: 'buy_token' },
                    { text: '◀️ Back to Trade Menu', callback_data: 'trade' }
                ]
            ]
        };
    }
}

module.exports = TokenAnalysis; 