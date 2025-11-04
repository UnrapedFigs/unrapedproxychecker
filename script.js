class ProxyChecker {
    constructor() {
        this.socket = io();
        this.currentCheckId = null;
        this.results = [];
        this.uploadedProxies = null;
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.setupSocketListeners();
    }

    setupEventListeners() {
        // File upload
        const uploadArea = document.getElementById('uploadArea');
        const fileInput = document.getElementById('fileInput');
        
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.classList.add('dragover');
        });

        uploadArea.addEventListener('dragleave', () => {
            uploadArea.classList.remove('dragover');
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.classList.remove('dragover');
            const files = e.dataTransfer.files;
            if (files.length > 0) {
                this.handleFileUpload(files[0]);
            }
        });

        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileUpload(e.target.files[0]);
            }
        });

        // Controls
        document.getElementById('startCheck').addEventListener('click', () => {
            this.startChecking();
        });

        document.getElementById('cancelCheck').addEventListener('click', () => {
            this.cancelChecking();
        });

        document.getElementById('clearResults').addEventListener('click', () => {
            this.clearResults();
        });

        // Filters
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const filter = e.target.dataset.filter;
                this.setFilter(filter);
            });
        });

        // Export buttons
        document.querySelectorAll('.export-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.type;
                this.exportResults(type);
            });
        });

        // Quick export button
        document.getElementById('quickExport').addEventListener('click', () => {
            if (this.results && this.results.length > 0) {
                this.exportResults('all');
            } else {
                this.showNotification('No results to export', 'error');
            }
        });
    }

    setupSocketListeners() {
        this.socket.on('check-progress', (data) => {
            this.updateProgress(data);
            this.addResult(data.result);
        });

        this.socket.on('check-complete', (data) => {
            this.completeChecking(data);
        });
    }

    async handleFileUpload(file) {
        try {
            const fileContent = await this.readFileAsText(file);
            
            const response = await fetch('/upload', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ content: fileContent })
            });

            const result = await response.json();

            if (result.success) {
                this.uploadedProxies = result.proxies;
                document.getElementById('startCheck').disabled = false;
                this.showNotification(`Successfully loaded ${result.count} proxies`, 'success');
            } else {
                this.showNotification('Error uploading file', 'error');
            }
        } catch (error) {
            this.showNotification('Error uploading file', 'error');
            console.error('Upload error:', error);
        }
    }

    readFileAsText(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = e => resolve(e.target.result);
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    startChecking() {
        if (!this.uploadedProxies || this.uploadedProxies.length === 0) {
            this.showNotification('Please upload a proxy file first', 'error');
            return;
        }

        const targetUrl = document.getElementById('targetUrl').value;
        if (!targetUrl) {
            this.showNotification('Please enter a target URL', 'error');
            return;
        }

        this.currentCheckId = 'check-' + Date.now();
        this.results = [];
        
        // Reset UI
        document.getElementById('startCheck').disabled = true;
        document.getElementById('cancelCheck').disabled = false;
        document.getElementById('progressSection').style.display = 'block';
        document.getElementById('resultsBody').innerHTML = '';
        document.getElementById('exportSection').style.display = 'none';
        
        // Reset counters
        document.getElementById('validCount').textContent = '0';
        document.getElementById('invalidCount').textContent = '0';
        document.getElementById('totalCount').textContent = '0';

        // Start check
        this.socket.emit('start-check', {
            proxies: this.uploadedProxies,
            targetUrl: targetUrl,
            checkId: this.currentCheckId
        });

        this.showNotification('Started checking proxies...', 'info');
    }

    cancelChecking() {
        if (this.currentCheckId) {
            this.socket.emit('cancel-check', this.currentCheckId);
            document.getElementById('cancelCheck').disabled = true;
            document.getElementById('startCheck').disabled = false;
            this.showNotification('Check cancelled', 'warning');
        }
    }

    clearResults() {
        this.results = [];
        document.getElementById('resultsBody').innerHTML = '';
        document.getElementById('validCount').textContent = '0';
        document.getElementById('invalidCount').textContent = '0';
        document.getElementById('totalCount').textContent = '0';
        document.getElementById('exportSection').style.display = 'none';
        this.showNotification('Results cleared', 'info');
    }

    updateProgress(data) {
        const progress = (data.completed / data.total) * 100;
        document.getElementById('progressFill').style.width = progress + '%';
        document.getElementById('progressText').textContent = 
            `${data.completed}/${data.total}`;
    }

    addResult(result) {
        this.results.push(result);
        this.updateCounters();
        this.renderResults();
    }

    completeChecking(data) {
        document.getElementById('startCheck').disabled = false;
        document.getElementById('cancelCheck').disabled = true;
        document.getElementById('progressFill').style.width = '100%';
        document.getElementById('exportSection').style.display = 'block';
        
        this.showNotification(
            `Check completed! ${data.valid} valid, ${data.invalid} invalid proxies found`,
            'success'
        );
    }

    updateCounters() {
        const valid = this.results.filter(r => r.status === 'valid').length;
        const invalid = this.results.filter(r => r.status === 'invalid').length;
        
        document.getElementById('validCount').textContent = valid;
        document.getElementById('invalidCount').textContent = invalid;
        document.getElementById('totalCount').textContent = this.results.length;
    }

    renderResults() {
        const filter = document.querySelector('.filter-btn.active').dataset.filter;
        const filteredResults = this.results.filter(result => {
            if (filter === 'valid') return result.status === 'valid';
            if (filter === 'invalid') return result.status === 'invalid';
            return true;
        });

        const tbody = document.getElementById('resultsBody');
        tbody.innerHTML = '';

        filteredResults.forEach(result => {
            const row = document.createElement('tr');
            
            row.innerHTML = `
                <td>
                    <span class="status-${result.status}">
                        ${result.status === 'valid' ? '✅ Valid' : '❌ Invalid'}
                    </span>
                </td>
                <td>${result.proxy}</td>
                <td>${result.type}</td>
                <td>
                    <span class="country-flag">${this.getFlagEmoji(result.country)}</span>
                    ${result.countryName}
                </td>
                <td>${result.city}</td>
                <td>${result.responseTime}ms</td>
                <td>${result.statusCode || 'N/A'}</td>
            `;
            
            tbody.appendChild(row);
        });
    }

    setFilter(filter) {
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-filter="${filter}"]`).classList.add('active');
        this.renderResults();
    }

    exportResults(type) {
        if (!this.results || this.results.length === 0) {
            this.showNotification('No results to export', 'error');
            return;
        }

        const data = JSON.stringify(this.results);
        const url = `/export/${type}?data=${encodeURIComponent(data)}`;
        
        // Create temporary download link
        const link = document.createElement('a');
        link.href = url;
        link.download = '';
        link.style.display = 'none';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        this.showNotification(`Exported ${type} proxies successfully!`, 'success');
    }

    getFlagEmoji(countryCode) {
        if (countryCode === 'Unknown') return '🌐';
        return countryCode.toUpperCase().replace(/./g, char => 
            String.fromCodePoint(127397 + char.charCodeAt())
        );
    }

    showNotification(message, type) {
        const notification = document.createElement('div');
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 15px 20px;
            border-radius: 8px;
            color: white;
            font-weight: 600;
            z-index: 1000;
            transition: all 0.3s ease;
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
        `;
        
        const colors = {
            success: '#27ae60',
            error: '#e74c3c',
            warning: '#f39c12',
            info: '#3498db'
        };
        
        notification.style.background = colors[type] || colors.info;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.style.opacity = '0';
            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new ProxyChecker();
});