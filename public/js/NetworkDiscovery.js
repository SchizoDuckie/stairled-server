class NetworkDiscovery {
    constructor(updateInterval = 30000) {
        this.updateInterval = updateInterval;
        this.scanTimer = null;
    }

    startPolling() {
        this._fetchDevices();
        this.scanTimer = setInterval(() => this._fetchDevices(), this.updateInterval);
    }

    async _fetchDevices() {
        try {
            const response = await fetch('/api/devices');
            const devices = await response.json();
            this._updateDeviceList(devices);
        } catch (error) {
            console.error('Device discovery failed:', error);
        }
    }

    _updateDeviceList(devices) {
        const container = document.getElementById('device-list-container');
        container.innerHTML = devices.length > 0 
            ? this._renderDeviceList(devices)
            : '<div class="alert alert-warning">No devices found</div>';
    }

    _renderDeviceList(devices) {
        return devices.map(device => `
            <div class="col">
                <div class="device-card">
                    <div class="device-header">
                        <i class="${this._getDeviceIcon(device)} me-2"></i>
                        <h6>${device.hostname}</h6>
                    </div>
                    <div class="device-meta">
                        <span class="badge bg-primary">${device.service}</span>
                        <code>${device.ip}</code>
                    </div>
                    ${this._renderDeviceInfo(device)}
                </div>
            </div>
        `).join('');
    }

    _getDeviceIcon(device) {
        const icons = {
            '_ssh._tcp': 'fa-terminal',
            '_http._tcp': 'fa-globe',
            '_printer._tcp': 'fa-print',
            '_smb._tcp': 'fa-network-wired'
        };
        return `fas ${icons[device.service] || 'fa-microchip'}`;
    }

    _renderDeviceInfo(device) {
        if (!device.txt) return '';
        return `
            <ul class="device-info">
                ${Object.entries(device.txt).map(([k, v]) => `
                    <li><strong>${k}:</strong> ${v}</li>
                `).join('')}
            </ul>
        `;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.networkDiscovery = new NetworkDiscovery();
    window.networkDiscovery.startPolling();
}); 