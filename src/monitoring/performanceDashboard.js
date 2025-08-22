const express = require('express');
const path = require('path');
const os = require('os');
const v8 = require('v8');

/**
 * Performance Monitoring Dashboard
 * Provides real-time metrics and performance insights
 */
class PerformanceDashboard {
    constructor(config = {}) {
        this.config = {
            port: config.port || 3003,
            updateInterval: config.updateInterval || 5000, // 5 seconds
            ...config
        };
        
        this.app = express();
        this.metrics = {
            system: {},
            database: {},
            trading: {},
            api: {},
            memory: {},
            performance: {}
        };
        
        this.setupRoutes();
        this.startMetricsCollection();
    }
    
    /**
     * Setup dashboard routes
     */
    setupRoutes() {
        // Serve static files
        this.app.use(express.static(path.join(__dirname, 'public')));
        
        // API endpoints
        this.app.get('/api/metrics', (req, res) => {
            res.json(this.metrics);
        });
        
        this.app.get('/api/metrics/system', (req, res) => {
            res.json(this.metrics.system);
        });
        
        this.app.get('/api/metrics/database', (req, res) => {
            res.json(this.metrics.database);
        });
        
        this.app.get('/api/metrics/trading', (req, res) => {
            res.json(this.metrics.trading);
        });
        
        this.app.get('/api/metrics/api', (req, res) => {
            res.json(this.metrics.api);
        });
        
        this.app.get('/api/metrics/memory', (req, res) => {
            res.json(this.metrics.memory);
        });
        
        this.app.get('/api/metrics/performance', (req, res) => {
            res.json(this.metrics.performance);
        });
        
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: Date.now(),
                uptime: process.uptime()
            });
        });
        
        // Dashboard HTML
        this.app.get('/', (req, res) => {
            res.send(this.getDashboardHTML());
        });
    }
    
    /**
     * Start metrics collection
     */
    startMetricsCollection() {
        setInterval(() => {
            this.collectSystemMetrics();
            this.collectMemoryMetrics();
            this.collectPerformanceMetrics();
        }, this.config.updateInterval);
        
        console.log('📊 Performance dashboard metrics collection started');
    }
    
    /**
     * Collect system metrics
     */
    collectSystemMetrics() {
        const cpus = os.cpus();
        const totalCPU = cpus.reduce((acc, cpu) => {
            const total = Object.values(cpu.times).reduce((a, b) => a + b);
            const idle = cpu.times.idle;
            return {
                total: acc.total + total,
                idle: acc.idle + idle
            };
        }, { total: 0, idle: 0 });
        
        const cpuUsage = ((totalCPU.total - totalCPU.idle) / totalCPU.total) * 100;
        
        this.metrics.system = {
            timestamp: Date.now(),
            uptime: os.uptime(),
            platform: os.platform(),
            arch: os.arch(),
            nodeVersion: process.version,
            cpu: {
                model: cpus[0].model,
                cores: cpus.length,
                usage: cpuUsage.toFixed(2)
            },
            memory: {
                total: os.totalmem(),
                free: os.freemem(),
                used: os.totalmem() - os.freemem(),
                usage: ((os.totalmem() - os.freemem()) / os.totalmem() * 100).toFixed(2)
            },
            loadAverage: os.loadavg(),
            networkInterfaces: this.getNetworkInterfaces()
        };
    }
    
    /**
     * Collect memory metrics
     */
    collectMemoryMetrics() {
        const memUsage = process.memoryUsage();
        const heapStats = v8.getHeapStatistics();
        
        this.metrics.memory = {
            timestamp: Date.now(),
            process: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers
            },
            v8: {
                heapSizeLimit: heapStats.heap_size_limit,
                totalAvailableSize: heapStats.total_available_size,
                totalPhysicalSize: heapStats.total_physical_size,
                totalGlobalHandlesSize: heapStats.total_global_handles_size,
                usedGlobalHandlesSize: heapStats.used_global_handles_size,
                usedHeapSize: heapStats.used_heap_size,
                heapUsedSize: heapStats.heap_used_size,
                externalMemorySize: heapStats.external_memory_size
            },
            gc: {
                totalGarbageCollected: heapStats.total_garbage_collected,
                totalAllocatedSize: heapStats.total_allocated_size
            }
        };
    }
    
    /**
     * Collect performance metrics
     */
    collectPerformanceMetrics() {
        const now = Date.now();
        
        this.metrics.performance = {
            timestamp: now,
            eventLoop: {
                lag: this.calculateEventLoopLag(),
                utilization: this.calculateEventLoopUtilization()
            },
            gc: {
                duration: this.getGCDuration(),
                frequency: this.getGCFrequency()
            },
            timers: {
                active: this.getActiveTimers(),
                pending: this.getPendingTimers()
            }
        };
    }
    
    /**
     * Get network interfaces
     */
    getNetworkInterfaces() {
        const interfaces = os.networkInterfaces();
        const result = {};
        
        for (const [name, nets] of Object.entries(interfaces)) {
            result[name] = nets.map(net => ({
                address: net.address,
                family: net.family,
                internal: net.internal
            }));
        }
        
        return result;
    }
    
    /**
     * Calculate event loop lag
     */
    calculateEventLoopLag() {
        const start = Date.now();
        setImmediate(() => {
            const lag = Date.now() - start;
            this.metrics.performance.eventLoop.lag = lag;
        });
        
        return this.metrics.performance.eventLoop.lag || 0;
    }
    
    /**
     * Calculate event loop utilization
     */
    calculateEventLoopUtilization() {
        // This is a simplified calculation
        const usage = process.cpuUsage();
        const total = usage.user + usage.system;
        return total > 0 ? (total / 1000000).toFixed(2) : 0;
    }
    
    /**
     * Get GC duration
     */
    getGCDuration() {
        // This would need to be implemented with actual GC monitoring
        return 0;
    }
    
    /**
     * Get GC frequency
     */
    getGCFrequency() {
        // This would need to be implemented with actual GC monitoring
        return 0;
    }
    
    /**
     * Get active timers
     */
    getActiveTimers() {
        // This is a simplified count
        return 0;
    }
    
    /**
     * Get pending timers
     */
    getPendingTimers() {
        // This is a simplified count
        return 0;
    }
    
    /**
     * Update database metrics
     */
    updateDatabaseMetrics(metrics) {
        this.metrics.database = {
            ...this.metrics.database,
            ...metrics,
            timestamp: Date.now()
        };
    }
    
    /**
     * Update trading service metrics
     */
    updateTradingMetrics(metrics) {
        this.metrics.trading = {
            ...this.metrics.trading,
            ...metrics,
            timestamp: Date.now()
        };
    }
    
    /**
     * Update API metrics
     */
    updateAPIMetrics(metrics) {
        this.metrics.api = {
            ...this.metrics.api,
            ...metrics,
            timestamp: Date.now()
        };
    }
    
    /**
     * Get dashboard HTML
     */
    getDashboardHTML() {
        return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>4T-Bot Performance Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background: #f5f5f5; }
        .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .header h1 { font-size: 2.5em; margin-bottom: 10px; }
        .header p { opacity: 0.8; }
        .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(400px, 1fr)); gap: 20px; margin-bottom: 20px; }
        .metric-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .metric-card h3 { color: #2c3e50; margin-bottom: 15px; border-bottom: 2px solid #3498db; padding-bottom: 10px; }
        .metric-item { display: flex; justify-content: space-between; margin-bottom: 10px; padding: 8px 0; border-bottom: 1px solid #eee; }
        .metric-label { font-weight: 600; color: #555; }
        .metric-value { font-family: 'Courier New', monospace; color: #2c3e50; }
        .status-healthy { color: #27ae60; }
        .status-warning { color: #f39c12; }
        .status-error { color: #e74c3c; }
        .refresh-info { text-align: center; color: #7f8c8d; margin-top: 20px; }
        .chart-container { height: 300px; margin-top: 15px; }
        .progress-bar { width: 100%; height: 20px; background: #ecf0f1; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background: linear-gradient(90deg, #3498db, #2ecc71); transition: width 0.3s ease; }
    </style>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚀 4T-Bot Performance Dashboard</h1>
            <p>Real-time system monitoring and performance metrics</p>
        </div>
        
        <div class="metrics-grid">
            <!-- System Metrics -->
            <div class="metric-card">
                <h3>🖥️ System Metrics</h3>
                <div id="system-metrics">
                    <div class="metric-item">
                        <span class="metric-label">CPU Usage:</span>
                        <span class="metric-value" id="cpu-usage">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Memory Usage:</span>
                        <span class="metric-value" id="memory-usage">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Uptime:</span>
                        <span class="metric-value" id="uptime">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Load Average:</span>
                        <span class="metric-value" id="load-avg">--</span>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="system-chart"></canvas>
                </div>
            </div>
            
            <!-- Database Metrics -->
            <div class="metric-card">
                <h3>🗄️ Database Metrics</h3>
                <div id="database-metrics">
                    <div class="metric-item">
                        <span class="metric-label">Total Queries:</span>
                        <span class="metric-value" id="total-queries">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Cache Hit Rate:</span>
                        <span class="metric-value" id="cache-hit-rate">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Avg Query Time:</span>
                        <span class="metric-value" id="avg-query-time">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Active Connections:</span>
                        <span class="metric-value" id="active-connections">--</span>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="database-chart"></canvas>
                </div>
            </div>
            
            <!-- Trading Service Metrics -->
            <div class="metric-card">
                <h3>💰 Trading Service</h3>
                <div id="trading-metrics">
                    <div class="metric-item">
                        <span class="metric-label">Total Requests:</span>
                        <span class="metric-value" id="total-requests">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Success Rate:</span>
                        <span class="metric-value" id="success-rate">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Avg Response Time:</span>
                        <span class="metric-value" id="avg-response-time">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Circuit Breaker:</span>
                        <span class="metric-value" id="circuit-breaker">--</span>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="trading-chart"></canvas>
                </div>
            </div>
            
            <!-- API Metrics -->
            <div class="metric-card">
                <h3>🌐 API Performance</h3>
                <div id="api-metrics">
                    <div class="metric-item">
                        <span class="metric-label">Total Requests:</span>
                        <span class="metric-value" id="api-total-requests">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Cache Hit Rate:</span>
                        <span class="metric-value" id="api-cache-hit-rate">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Avg Response Time:</span>
                        <span class="metric-value" id="api-avg-response-time">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Rate Limited:</span>
                        <span class="metric-value" id="rate-limited">--</span>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="api-chart"></canvas>
                </div>
            </div>
            
            <!-- Memory Metrics -->
            <div class="metric-card">
                <h3>🧠 Memory Usage</h3>
                <div id="memory-metrics">
                    <div class="metric-item">
                        <span class="metric-label">Heap Used:</span>
                        <span class="metric-value" id="heap-used">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Heap Total:</span>
                        <span class="metric-value" id="heap-total">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">RSS:</span>
                        <span class="metric-value" id="rss">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">External:</span>
                        <span class="metric-value" id="external">--</span>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="memory-chart"></canvas>
                </div>
            </div>
            
            <!-- Performance Metrics -->
            <div class="metric-card">
                <h3>⚡ Performance</h3>
                <div id="performance-metrics">
                    <div class="metric-item">
                        <span class="metric-label">Event Loop Lag:</span>
                        <span class="metric-value" id="event-loop-lag">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">GC Duration:</span>
                        <span class="metric-value" id="gc-duration">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Active Timers:</span>
                        <span class="metric-value" id="active-timers">--</span>
                    </div>
                    <div class="metric-item">
                        <span class="metric-label">Pending Timers:</span>
                        <span class="metric-value" id="pending-timers">--</span>
                    </div>
                </div>
                <div class="chart-container">
                    <canvas id="performance-chart"></canvas>
                </div>
            </div>
        </div>
        
        <div class="refresh-info">
            <p>🔄 Auto-refreshing every ${this.config.updateInterval / 1000} seconds | Last updated: <span id="last-update">--</span></p>
        </div>
    </div>
    
    <script>
        // Initialize charts
        const charts = {};
        
        function initCharts() {
            const chartOptions = {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                },
                plugins: {
                    legend: { display: false }
                }
            };
            
            // System chart
            charts.system = new Chart(document.getElementById('system-chart'), {
                type: 'line',
                data: { labels: [], datasets: [{ data: [], borderColor: '#3498db', tension: 0.4 }] },
                options: chartOptions
            });
            
            // Database chart
            charts.database = new Chart(document.getElementById('database-chart'), {
                type: 'line',
                data: { labels: [], datasets: [{ data: [], borderColor: '#2ecc71', tension: 0.4 }] },
                options: chartOptions
            });
            
            // Trading chart
            charts.trading = new Chart(document.getElementById('trading-chart'), {
                type: 'line',
                data: { labels: [], datasets: [{ data: [], borderColor: '#e74c3c', tension: 0.4 }] },
                options: chartOptions
            });
            
            // API chart
            charts.api = new Chart(document.getElementById('api-chart'), {
                type: 'line',
                data: { labels: [], datasets: [{ data: [], borderColor: '#f39c12', tension: 0.4 }] },
                options: chartOptions
            });
            
            // Memory chart
            charts.memory = new Chart(document.getElementById('memory-chart'), {
                type: 'line',
                data: { labels: [], datasets: [{ data: [], borderColor: '#9b59b6', tension: 0.4 }] },
                options: chartOptions
            });
            
            // Performance chart
            charts.performance = new Chart(document.getElementById('performance-chart'), {
                type: 'line',
                data: { labels: [], datasets: [{ data: [], borderColor: '#1abc9c', tension: 0.4 }] },
                options: chartOptions
            });
        }
        
        // Update metrics
        async function updateMetrics() {
            try {
                const response = await fetch('/api/metrics');
                const metrics = await response.json();
                
                // Update system metrics
                document.getElementById('cpu-usage').textContent = metrics.system.cpu?.usage + '%';
                document.getElementById('memory-usage').textContent = metrics.system.memory?.usage + '%';
                document.getElementById('uptime').textContent = formatUptime(metrics.system.uptime);
                document.getElementById('load-avg').textContent = metrics.system.loadAverage?.map(l => l.toFixed(2)).join(', ') || '--';
                
                // Update database metrics
                document.getElementById('total-queries').textContent = metrics.database.totalQueries || '--';
                document.getElementById('cache-hit-rate').textContent = (metrics.database.cacheHitRate || '0') + '%';
                document.getElementById('avg-query-time').textContent = (metrics.database.averageQueryTime || '0').toFixed(2) + 'ms';
                document.getElementById('active-connections').textContent = metrics.database.activeConnections || '--';
                
                // Update trading metrics
                document.getElementById('total-requests').textContent = metrics.trading.totalRequests || '--';
                document.getElementById('success-rate').textContent = (metrics.trading.successRate || '0') + '%';
                document.getElementById('avg-response-time').textContent = (metrics.trading.averageResponseTime || '0').toFixed(2) + 'ms';
                document.getElementById('circuit-breaker').textContent = metrics.trading.circuitBreaker?.isOpen ? 'OPEN' : 'CLOSED';
                
                // Update API metrics
                document.getElementById('api-total-requests').textContent = metrics.api.totalRequests || '--';
                document.getElementById('api-cache-hit-rate').textContent = (metrics.api.cacheHitRate || '0') + '%';
                document.getElementById('api-avg-response-time').textContent = (metrics.api.averageResponseTime || '0').toFixed(2) + 'ms';
                document.getElementById('rate-limited').textContent = metrics.api.rateLimited || '--';
                
                // Update memory metrics
                document.getElementById('heap-used').textContent = formatBytes(metrics.memory.process?.heapUsed);
                document.getElementById('heap-total').textContent = formatBytes(metrics.memory.process?.heapTotal);
                document.getElementById('rss').textContent = formatBytes(metrics.memory.process?.rss);
                document.getElementById('external').textContent = formatBytes(metrics.memory.process?.external);
                
                // Update performance metrics
                document.getElementById('event-loop-lag').textContent = (metrics.performance.eventLoop?.lag || '0') + 'ms';
                document.getElementById('gc-duration').textContent = (metrics.performance.gc?.duration || '0') + 'ms';
                document.getElementById('active-timers').textContent = metrics.performance.timers?.active || '--';
                document.getElementById('pending-timers').textContent = metrics.performance.timers?.pending || '--';
                
                // Update last update time
                document.getElementById('last-update').textContent = new Date().toLocaleTimeString();
                
                // Update charts
                updateCharts(metrics);
                
            } catch (error) {
                console.error('Failed to update metrics:', error);
            }
        }
        
        // Update charts with new data
        function updateCharts(metrics) {
            const now = new Date().toLocaleTimeString();
            
            // System chart (CPU usage)
            if (charts.system && metrics.system.cpu?.usage) {
                updateChart(charts.system, now, parseFloat(metrics.system.cpu.usage));
            }
            
            // Database chart (query time)
            if (charts.database && metrics.database.averageQueryTime) {
                updateChart(charts.database, now, metrics.database.averageQueryTime);
            }
            
            // Trading chart (response time)
            if (charts.trading && metrics.trading.averageResponseTime) {
                updateChart(charts.trading, now, metrics.trading.averageResponseTime);
            }
            
            // API chart (response time)
            if (charts.api && metrics.api.averageResponseTime) {
                updateChart(charts.api, now, metrics.api.averageResponseTime);
            }
            
            // Memory chart (heap used)
            if (charts.memory && metrics.memory.process?.heapUsed) {
                updateChart(charts.memory, now, metrics.memory.process.heapUsed / 1024 / 1024); // Convert to MB
            }
            
            // Performance chart (event loop lag)
            if (charts.performance && metrics.performance.eventLoop?.lag) {
                updateChart(charts.performance, now, metrics.performance.eventLoop.lag);
            }
        }
        
        // Update individual chart
        function updateChart(chart, label, value) {
            chart.data.labels.push(label);
            chart.data.datasets[0].data.push(value);
            
            // Keep only last 20 data points
            if (chart.data.labels.length > 20) {
                chart.data.labels.shift();
                chart.data.datasets[0].data.shift();
            }
            
            chart.update('none');
        }
        
        // Format bytes
        function formatBytes(bytes) {
            if (!bytes) return '--';
            const sizes = ['B', 'KB', 'MB', 'GB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return (bytes / Math.pow(1024, i)).toFixed(2) + ' ' + sizes[i];
        }
        
        // Format uptime
        function formatUptime(seconds) {
            if (!seconds) return '--';
            const days = Math.floor(seconds / 86400);
            const hours = Math.floor((seconds % 86400) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return \`\${days}d \${hours}h \${minutes}m\`;
        }
        
        // Initialize dashboard
        document.addEventListener('DOMContentLoaded', function() {
            initCharts();
            updateMetrics();
            
            // Update metrics every 5 seconds
            setInterval(updateMetrics, 5000);
        });
    </script>
</body>
</html>`;
    }
    
    /**
     * Start the dashboard server
     */
    start() {
        return new Promise((resolve, reject) => {
            try {
                const server = this.app.listen(this.config.port, () => {
                    console.log(`🚀 Performance dashboard started on port ${this.config.port}`);
                    console.log(`📍 Dashboard: http://localhost:${this.config.port}`);
                    console.log(`📊 API: http://localhost:${this.config.port}/api/metrics`);
                    
                    resolve(server);
                });
                
                server.on('error', (error) => {
                    console.error('❌ Dashboard server error:', error);
                    reject(error);
                });
                
            } catch (error) {
                console.error('❌ Failed to start dashboard:', error);
                reject(error);
            }
        });
    }
    
    /**
     * Stop the dashboard
     */
    async stop() {
        console.log('🛑 Performance dashboard stopping...');
        // Implementation would depend on how the server is stored
    }
}

module.exports = PerformanceDashboard; 