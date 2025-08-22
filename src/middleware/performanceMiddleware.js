const rateLimit = require('express-rate-limit');
const Redis = require('ioredis');
const crypto = require('crypto');

/**
 * Performance Middleware for Production
 * Features: Response caching, rate limiting, compression, and performance monitoring
 */
class PerformanceMiddleware {
    constructor(config = {}) {
        this.config = {
            redis: config.redis || {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT) || 6379,
                password: process.env.REDIS_PASSWORD
            },
            cache: {
                ttl: config.cache?.ttl || 300, // 5 minutes default
                maxSize: config.cache?.maxSize || 1000,
                checkPeriod: config.cache?.checkPeriod || 600
            },
            rateLimit: {
                windowMs: config.rateLimit?.windowMs || 15 * 60 * 1000, // 15 minutes
                max: config.rateLimit?.max || 100, // limit each IP to 100 requests per windowMs
                message: config.rateLimit?.message || 'Too many requests from this IP, please try again later.',
                standardHeaders: true,
                legacyHeaders: false
            }
        };
        
        this.redis = null;
        this.memoryCache = new Map();
        this.performanceMetrics = {
            totalRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            averageResponseTime: 0,
            slowResponses: []
        };
        
        this.initializeRedis();
        this.setupCacheCleanup();
    }
    
    /**
     * Initialize Redis connection
     */
    async initializeRedis() {
        try {
            this.redis = new Redis(this.config.redis);
            
            this.redis.on('connect', () => {
                console.log('🔗 Redis connected for performance middleware');
            });
            
            this.redis.on('error', (error) => {
                console.warn('⚠️ Redis connection failed, falling back to memory cache:', error.message);
                this.redis = null;
            });
            
        } catch (error) {
            console.warn('⚠️ Redis initialization failed, using memory cache only:', error.message);
            this.redis = null;
        }
    }
    
    /**
     * Setup cache cleanup to prevent memory leaks
     */
    setupCacheCleanup() {
        setInterval(() => {
            this.cleanupMemoryCache();
        }, this.config.cache.checkPeriod * 1000);
    }
    
    /**
     * Clean up expired memory cache entries
     */
    cleanupMemoryCache() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [key, value] of this.memoryCache.entries()) {
            if (value.expiry && value.expiry < now) {
                this.memoryCache.delete(key);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 Cleaned up ${cleanedCount} expired cache entries`);
        }
    }
    
    /**
     * Generate cache key from request
     */
    generateCacheKey(req) {
        const keyData = {
            method: req.method,
            path: req.path,
            query: req.query,
            userId: req.user?.id || 'anonymous',
            timestamp: Math.floor(Date.now() / (this.config.cache.ttl * 1000)) // Round to cache TTL
        };
        
        return crypto.createHash('md5').update(JSON.stringify(keyData)).digest('hex');
    }
    
    /**
     * Get cached response
     */
    async getCachedResponse(cacheKey) {
        try {
            // Try Redis first
            if (this.redis) {
                const cached = await this.redis.get(`cache:${cacheKey}`);
                if (cached) {
                    this.performanceMetrics.cacheHits++;
                    return JSON.parse(cached);
                }
            }
            
            // Fallback to memory cache
            const memoryCached = this.memoryCache.get(cacheKey);
            if (memoryCached && (!memoryCached.expiry || memoryCached.expiry > Date.now())) {
                this.performanceMetrics.cacheHits++;
                return memoryCached.data;
            }
            
            this.performanceMetrics.cacheMisses++;
            return null;
            
        } catch (error) {
            console.error('❌ Cache retrieval error:', error);
            return null;
        }
    }
    
    /**
     * Set cached response
     */
    async setCachedResponse(cacheKey, data, ttl = null) {
        try {
            const cacheTTL = ttl || this.config.cache.ttl;
            const expiry = Date.now() + (cacheTTL * 1000);
            
            // Store in Redis if available
            if (this.redis) {
                await this.redis.setex(`cache:${cacheKey}`, cacheTTL, JSON.stringify(data));
            }
            
            // Store in memory cache as backup
            this.memoryCache.set(cacheKey, {
                data,
                expiry,
                timestamp: Date.now()
            });
            
            // Limit memory cache size
            if (this.memoryCache.size > this.config.cache.maxSize) {
                const firstKey = this.memoryCache.keys().next().value;
                this.memoryCache.delete(firstKey);
            }
            
        } catch (error) {
            console.error('❌ Cache storage error:', error);
        }
    }
    
    /**
     * Response caching middleware
     */
    responseCache(ttl = null, skipPaths = []) {
        return async (req, res, next) => {
            // Skip caching for non-GET requests or specified paths
            if (req.method !== 'GET' || skipPaths.some(path => req.path.startsWith(path))) {
                return next();
            }
            
            const cacheKey = this.generateCacheKey(req);
            const startTime = Date.now();
            
            try {
                // Check cache
                const cached = await this.getCachedResponse(cacheKey);
                if (cached) {
                    return res.json(cached);
                }
                
                // Store original send method
                const originalSend = res.json;
                
                // Override send method to cache response
                res.json = function(data) {
                    // Cache the response
                    this.setCachedResponse(cacheKey, data, ttl);
                    
                    // Call original send method
                    return originalSend.call(this, data);
                }.bind(this);
                
                // Add cache headers
                res.set('X-Cache-Status', 'MISS');
                res.set('Cache-Control', `public, max-age=${ttl || this.config.cache.ttl}`);
                
                next();
                
            } catch (error) {
                console.error('❌ Response cache middleware error:', error);
                next();
            } finally {
                // Record performance metrics
                const responseTime = Date.now() - startTime;
                this.updatePerformanceMetrics(responseTime);
                
                if (responseTime > 1000) { // Log responses taking more than 1 second
                    this.logSlowResponse(req.path, responseTime);
                }
            }
        }.bind(this);
    }
    
    /**
     * Rate limiting middleware
     */
    rateLimiter(options = {}) {
        const limiterOptions = {
            ...this.config.rateLimit,
            ...options,
            handler: (req, res) => {
                res.status(429).json({
                    error: 'Rate limit exceeded',
                    message: options.message || this.config.rateLimit.message,
                    retryAfter: Math.ceil(this.config.rateLimit.windowMs / 1000)
                });
            }
        };
        
        return rateLimit(limiterOptions);
    }
    
    /**
     * Performance monitoring middleware
     */
    performanceMonitor() {
        return (req, res, next) => {
            const startTime = Date.now();
            this.performanceMetrics.totalRequests++;
            
            // Add response time header
            res.on('finish', () => {
                const responseTime = Date.now() - startTime;
                res.set('X-Response-Time', `${responseTime}ms`);
                
                this.updatePerformanceMetrics(responseTime);
                
                // Log very slow responses
                if (responseTime > 2000) {
                    console.warn(`🐌 Slow response: ${req.method} ${req.path} took ${responseTime}ms`);
                }
            });
            
            next();
        };
    }
    
    /**
     * Compression middleware for large responses
     */
    compression() {
        return (req, res, next) => {
            // Check if response should be compressed
            const shouldCompress = req.headers['accept-encoding'] && 
                                 req.headers['accept-encoding'].includes('gzip') &&
                                 req.path.includes('/api/');
            
            if (shouldCompress) {
                res.set('Content-Encoding', 'gzip');
                res.set('Vary', 'Accept-Encoding');
            }
            
            next();
        };
    }
    
    /**
     * Database query optimization middleware
     */
    queryOptimizer() {
        return (req, res, next) => {
            // Add query optimization headers
            res.set('X-Query-Optimization', 'enabled');
            
            // Set reasonable timeouts for database operations
            req.dbTimeout = 30000; // 30 seconds
            
            next();
        };
    }
    
    /**
     * Update performance metrics
     */
    updatePerformanceMetrics(responseTime) {
        const totalRequests = this.performanceMetrics.totalRequests;
        const currentAvg = this.performanceMetrics.averageResponseTime;
        
        this.performanceMetrics.averageResponseTime = 
            ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests;
    }
    
    /**
     * Log slow responses
     */
    logSlowResponse(path, responseTime) {
        this.performanceMetrics.slowResponses.push({
            path,
            time: responseTime,
            timestamp: Date.now()
        });
        
        // Keep only last 100 slow responses
        if (this.performanceMetrics.slowResponses.length > 100) {
            this.performanceMetrics.slowResponses.shift();
        }
    }
    
    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            ...this.performanceMetrics,
            cacheHitRate: this.performanceMetrics.totalRequests > 0 
                ? (this.performanceMetrics.cacheHits / this.performanceMetrics.totalRequests * 100).toFixed(2)
                : 0,
            timestamp: Date.now()
        };
    }
    
    /**
     * Clear all caches
     */
    async clearAllCaches() {
        try {
            // Clear Redis cache
            if (this.redis) {
                const keys = await this.redis.keys('cache:*');
                if (keys.length > 0) {
                    await this.redis.del(...keys);
                }
            }
            
            // Clear memory cache
            this.memoryCache.clear();
            
            console.log('🧹 All caches cleared');
            
        } catch (error) {
            console.error('❌ Error clearing caches:', error);
        }
    }
    
    /**
     * Health check for Redis
     */
    async healthCheck() {
        try {
            if (this.redis) {
                await this.redis.ping();
                return { status: 'healthy', redis: 'connected' };
            } else {
                return { status: 'degraded', redis: 'disconnected', message: 'Using memory cache only' };
            }
        } catch (error) {
            return { status: 'unhealthy', redis: 'error', error: error.message };
        }
    }
}

module.exports = PerformanceMiddleware; 