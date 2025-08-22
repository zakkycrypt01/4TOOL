#!/usr/bin/env node

const https = require('https');
const url = require('url');

class LoadTester {
    constructor(endpoint, callsPerMinute, duration = 2) {
        this.endpoint = endpoint;
        this.callsPerMinute = callsPerMinute;
        this.intervalMs = (60 * 1000) / callsPerMinute; // Convert to milliseconds between calls
        this.duration = duration; // Test duration in minutes
        this.results = [];
        this.startTime = Date.now();
    }

    async makeRequest() {
        return new Promise((resolve) => {
            const startTime = Date.now();
            const parsedUrl = url.parse(this.endpoint);
            
            const options = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 443,
                path: parsedUrl.path,
                method: 'GET',
                headers: {
                    'User-Agent': 'LoadTester/1.0'
                }
            };

            const req = https.request(options, (res) => {
                let data = '';
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    const endTime = Date.now();
                    const responseTime = endTime - startTime;
                    
                    const result = {
                        timestamp: new Date().toISOString(),
                        statusCode: res.statusCode,
                        responseTime: responseTime,
                        success: res.statusCode >= 200 && res.statusCode < 300,
                        dataSize: data.length
                    };
                    
                    this.results.push(result);
                    this.logResult(result);
                    resolve(result);
                });
            });

            req.on('error', (error) => {
                const endTime = Date.now();
                const responseTime = endTime - startTime;
                
                const result = {
                    timestamp: new Date().toISOString(),
                    statusCode: 0,
                    responseTime: responseTime,
                    success: false,
                    error: error.message,
                    dataSize: 0
                };
                
                this.results.push(result);
                this.logResult(result);
                resolve(result);
            });

            req.setTimeout(10000, () => {
                req.destroy();
                const result = {
                    timestamp: new Date().toISOString(),
                    statusCode: 0,
                    responseTime: 10000,
                    success: false,
                    error: 'Request timeout',
                    dataSize: 0
                };
                this.results.push(result);
                this.logResult(result);
                resolve(result);
            });

            req.end();
        });
    }

    logResult(result) {
        const status = result.success ? '✅' : '❌';
        const responseTime = `${result.responseTime}ms`;
        const statusCode = result.statusCode || 'ERR';
        const dataSize = result.dataSize > 0 ? `${(result.dataSize / 1024).toFixed(1)}KB` : '0KB';
        
        console.log(`${status} [${result.timestamp}] ${statusCode} | ${responseTime} | ${dataSize} ${result.error ? `| Error: ${result.error}` : ''}`);
    }

    async start() {
        console.log(`🚀 Starting load test:`);
        console.log(`   Endpoint: ${this.endpoint}`);
        console.log(`   Rate: ${this.callsPerMinute} calls/minute (${this.intervalMs}ms interval)`);
        console.log(`   Duration: ${this.duration} minutes`);
        console.log(`   Total calls: ${this.callsPerMinute * this.duration}`);
        console.log(`\n📊 Results:`);
        console.log(`Status | Timestamp | Code | Response Time | Data Size | Error`);
        console.log(`-------|-----------|------|---------------|-----------|------`);

        const totalCalls = this.callsPerMinute * this.duration;
        let callCount = 0;

        const interval = setInterval(async () => {
            if (callCount >= totalCalls) {
                clearInterval(interval);
                this.generateReport();
                return;
            }

            await this.makeRequest();
            callCount++;
        }, this.intervalMs);

        // Handle graceful shutdown
        process.on('SIGINT', () => {
            console.log('\n\n⏹️  Test interrupted by user');
            clearInterval(interval);
            this.generateReport();
            process.exit(0);
        });
    }

    generateReport() {
        console.log(`\n📈 Load Test Report:`);
        console.log(`=====================================`);
        
        const totalRequests = this.results.length;
        const successfulRequests = this.results.filter(r => r.success).length;
        const failedRequests = totalRequests - successfulRequests;
        const successRate = ((successfulRequests / totalRequests) * 100).toFixed(2);
        
        const responseTimes = this.results.filter(r => r.success).map(r => r.responseTime);
        const avgResponseTime = responseTimes.length > 0 ? 
            (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(2) : 0;
        const minResponseTime = responseTimes.length > 0 ? Math.min(...responseTimes) : 0;
        const maxResponseTime = responseTimes.length > 0 ? Math.max(...responseTimes) : 0;
        
        const totalDataTransferred = this.results.reduce((sum, r) => sum + r.dataSize, 0);
        const avgDataSize = totalRequests > 0 ? (totalDataTransferred / totalRequests / 1024).toFixed(2) : 0;
        
        const testDuration = (Date.now() - this.startTime) / 1000;
        const actualRate = (totalRequests / (testDuration / 60)).toFixed(2);
        
        console.log(`Total Requests: ${totalRequests}`);
        console.log(`Successful: ${successfulRequests}`);
        console.log(`Failed: ${failedRequests}`);
        console.log(`Success Rate: ${successRate}%`);
        console.log(`\nResponse Times:`);
        console.log(`  Average: ${avgResponseTime}ms`);
        console.log(`  Minimum: ${minResponseTime}ms`);
        console.log(`  Maximum: ${maxResponseTime}ms`);
        console.log(`\nData Transfer:`);
        console.log(`  Total: ${(totalDataTransferred / 1024).toFixed(2)}KB`);
        console.log(`  Average per request: ${avgDataSize}KB`);
        console.log(`\nTiming:`);
        console.log(`  Test Duration: ${testDuration.toFixed(2)}s`);
        console.log(`  Actual Rate: ${actualRate} calls/minute`);
        console.log(`  Target Rate: ${this.callsPerMinute} calls/minute`);
        
        // Status code breakdown
        const statusCodes = {};
        this.results.forEach(r => {
            const code = r.statusCode || 'ERROR';
            statusCodes[code] = (statusCodes[code] || 0) + 1;
        });
        
        console.log(`\nStatus Code Breakdown:`);
        Object.entries(statusCodes).forEach(([code, count]) => {
            console.log(`  ${code}: ${count} requests`);
        });

        // Error breakdown
        const errors = this.results.filter(r => r.error);
        if (errors.length > 0) {
            console.log(`\nErrors:`);
            const errorTypes = {};
            errors.forEach(r => {
                errorTypes[r.error] = (errorTypes[r.error] || 0) + 1;
            });
            Object.entries(errorTypes).forEach(([error, count]) => {
                console.log(`  ${error}: ${count} occurrences`);
            });
        }
    }
}

// Configuration
const endpoint = 'https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112';
const callsPerMinute = 10;
const durationMinutes = 2; // Run for 2 minutes by default

// Start the test
const loadTester = new LoadTester(endpoint, callsPerMinute, durationMinutes);
loadTester.start();
