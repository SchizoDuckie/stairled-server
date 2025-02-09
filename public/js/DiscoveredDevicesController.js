/**
 * Manages device discovery functionality including:
 * - Periodic MDNS scanning
 * - Device list updates
 * - Detail expansion/collapse
 * - Manual refresh
 */
class DiscoveredDevicesController {
    /**
     * Initialize device discovery management
     * Compiles templates and sets up event handlers
     */
    constructor() {
        this.updateInterval = 30000; // 30 seconds
        this.scanTimer = null;
        this.compileTemplates();
        this.initializeEventHandlers();
        this.startPolling();
    }

    /**
     * Compile Handlebars templates for dynamic updates
     * @private
     */
    compileTemplates() {
        this.template = Handlebars.compile(
            document.getElementById('discovered-devices-partial').innerHTML
        );

        // Add helper for service icons
        Handlebars.registerHelper('serviceIcon', (service) => {
            const icons = {
                '_ssh._tcp': 'fa-terminal',
                '_http._tcp': 'fa-globe',
                '_printer._tcp': 'fa-print',
                '_smb._tcp': 'fa-network-wired'
            };
            return icons[service] || 'fa-microchip';
        });
    }

    /**
     * Set up event handlers using document-level delegation
     * @private
     */
    initializeEventHandlers() {
        $(document).on('click', '.refresh-devices', () => this.refreshDevices());
    }

    /**
     * Start periodic device polling
     * @private
     */
    startPolling() {
        this.refreshDevices();
        this.scanTimer = setInterval(() => this.refreshDevices(), this.updateInterval);
    }

    /**
     * Fetch and update device list
     * @private
     */
    async refreshDevices() {
        try {
            const response = await fetch('/api/devices');
            if (!response.ok) throw new Error('Failed to fetch devices');
            
            const devices = await response.json();
            this.updateDeviceList(devices);
        } catch (error) {
            console.error('Device discovery failed:', error);
            // Show error in UI if needed
        }
    }

    /**
     * Update the device list in the UI
     * @private
     * @param {Array} devices - List of discovered devices
     */
    updateDeviceList(devices) {
        
        $('.network-devices-card').replaceWith(this.template({ devices }));
    }

}