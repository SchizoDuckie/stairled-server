/**
 * Handles WiFi mode switching interface including:
 * - Network scanning and selection UI
 * - Manual SSID input validation
 * - Mode switch authentication flow
 * - Periodic network list updates
 */
class ModeSwitchController {
    /**
     * Initializes controller with runtime configuration
     * @param {Object} options - Server-provided configuration
     * @param {string} options.hostname - Device hostname for connection checks
     * @param {string} options.apSSID - Access Point SSID for fallback
     * @param {string} options.mode - Current operating mode ('AP' or 'Client')
     */
    constructor(options = {}) {
        this.selectedNetwork = null;
        this.scanInterval = null;
        this.hostname = options.hostname;
        this.apSSID = options.apSSID;
        this.currentMode = options.mode;

        // Modal requires template system to be ready
        this.modal = this.initModal('#modeSwitchModal');
        this.compileTemplates();
    }

    /**
     * Starts controller operation after DOM initialization
     * 1. Binds event handlers
     * 2. Starts background scanning if in Client mode
     * 3. Sets up page visibility monitoring
     */
    initialize() {
        this.initializeEventListeners();
        
        // Client mode needs persistent scanning
        if (this.currentMode === 'Client') {
            this.startPeriodicScanning();
        }
        
        this.setupVisibilityListener();
    }

    /**
     * Compiles Handlebars templates from DOM elements
     * Registers partials for network item rendering
     */
    compileTemplates() {
        const networkItemPartial = document.getElementById('network-item-partial').innerHTML;
        Handlebars.registerPartial('network-item', Handlebars.compile(networkItemPartial));
        this.template = Handlebars.partials['network-item'];
    }

    /**
     * Initializes Bootstrap modal instance
     * @param {string} selector - CSS selector for modal element
     * @returns {bootstrap.Modal|null} Initialized modal instance
     */
    initModal(selector) {
        const modalElement = document.querySelector(selector);
        return modalElement ? new bootstrap.Modal(modalElement) : null;
    }

    /**
     * Binds all event handlers for:
     * - Mode switch button clicks
     * - Network selection
     * - Manual SSID input
     * - Authentication form submission
     * - Modal close events
     */
    initializeEventListeners() {
   
        $(document).on('click', '.mode-switch-btn', (e) => this.handleModeSwitchClick(e))
        $(document).on('click', '.network-option', (e) => this.handleNetworkSelection(e))
        $(document).on('input', '#manualSSID', (e) => this.handleManualSSID(e))
        $(document).on('submit', '#modeSwitchAuthForm', (e) => this.handleAuthSubmit(e))

        // Modal cleanup
        this.modal._element.addEventListener('hidden.bs.modal', () => {
            this.stopPeriodicScanning();
        });
    }

    /**
     * Handles mode switch button click
     * - Shows modal when switching from AP mode
     * - Starts network scanning
     * - Resets form state
     */
    async handleModeSwitchClick(e) {
        e.preventDefault();
        if(this.currentMode === 'AP'){  
            this.modal.show();
            this.startPeriodicScanning();
        } else {
            this.modal.hide();
            this.stopPeriodicScanning();
        }
    }

    /**
     * Handles network selection from list
     * @param {Event} e - Click event
     */
    handleNetworkSelection(e) {
        e.preventDefault();
        const card = e.currentTarget;
        this.selectedNetwork = {
            ssid: card.dataset.ssid,
            bssid: card.dataset.bssid,
            security: card.dataset.security
        };
        this.updateNetworkSelectionUI();
    }

    /**
     * Maintains visual selection state across list updates
     * Scrolls to selected network if present
     */
    preserveSelectionState() {
        if (!this.selectedNetwork) return;

        const selected = document.querySelector(
            `.network-option[data-ssid="${this.selectedNetwork.ssid}"]`
        );
        
        if (selected) {
            selected.classList.add('active');
            selected.scrollIntoView({ 
                behavior: 'smooth', 
                block: 'nearest' 
            });
        }
    }

    /**
     * Handles manual SSID input validation
     * @param {Event} e - Input event
     */
    handleManualSSID(e) {
        this.selectedNetwork = {
            ssid: e.target.value.trim(),
            bssid: '',
            security: 'WPA/WPA2'
        };
        
        if (this.selectedNetwork.ssid) {
            $('#modeSwitchPassword')
                .prop('disabled', false)
                .attr('placeholder', `Password for ${this.selectedNetwork.ssid}`);
        }
    }

    /**
     * Handles authentication form submission
     * @param {Event} e - Submit event
     */
    async handleAuthSubmit(e) {
        e.preventDefault();
        
        // Original validation logic
        if (!this.selectedNetwork?.ssid) {
            AlertController.getInstance().showResultModal(
                false,
                'No Network Selected',
                'Please select a network first'
            );
            return;
        }

        const password = $('#modeSwitchPassword').val().trim();
        if (!password) {
            AlertController.getInstance().showResultModal(
                false,
                'Password Required',
                'Please enter the network password'
            );
            return;
        }

        try {
            // Original API call structure
            const response = await fetch('/wifi/client-config', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    ssid: this.selectedNetwork.ssid,
                    password: password,
                    bssid: this.selectedNetwork.bssid || ''
                })
            });

            const result = await response.json();
            
            if (result.success) {
                let connectionController = new ConnectionController({
                    hostname: this.hostname,
                    apSSID: this.selectedNetwork.ssid
                });
                connectionController.showConnectionVerificationModal();
            } else {
                throw new Error(result.error || 'Connection failed');
            }
        } catch (error) {
            console.error(error);
            AlertController.getInstance().showResultModal(
                false,
                'Connection Failed',
                error.message
            );
        }
    }

    /**
     * Starts periodic network scanning
     * 1. Immediate initial scan
     * 2. Subsequent scans every 15 seconds
     * 3. Rescans when returning to visible tab
     */
    startPeriodicScanning() {
        // Initial scan
        this.refreshNetworkList();
        
        // Periodic updates
        this.scanInterval = setInterval(() => {
            this.refreshNetworkList();
        }, 15000);
    }

    /**
     * Stops background network scanning
     * Clears interval timer
     */
    stopPeriodicScanning() {
        if (this.scanInterval) {
            clearInterval(this.scanInterval);
            this.scanInterval = null;
        }
    }

    // Add missing method
    setupVisibilityListener() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                this.refreshNetworkList();
            }
        });
    }

    updateNetworkSelectionUI() {
        $('#selectedSSID').text(this.selectedNetwork?.ssid || 'None selected');
        $('#modeSwitchPassword')
            .prop('disabled', !this.selectedNetwork)
            .attr('placeholder', this.selectedNetwork?.ssid 
                ? `Password for ${this.selectedNetwork.ssid}`
                : 'Enter network password');
    }

    /**
     * Refreshes the network list UI by fetching latest scan results
     * Maintains current selection state after update
     */
    async refreshNetworkList() {
        try {
            const response = await fetch('/wifi/scan');
            const { accessPoints } = await response.json();
            
            const listHtml = accessPoints
                .filter(ap => ap.ssid) // Filter out empty SSIDs
                .map(ap => this.template({
                    ssid: ap.ssid,
                    bssid: ap.bssid,
                    channel: ap.channel,
                    security: ap.security,
                    signal_level: ap.signal_level,
                    signalPercentage: Math.min(Math.max(2 * (ap.signal_level + 100), 0), 100)
                }))
                .join('');

            $('#modeSwitchNetworkList').html(listHtml);
            this.preserveSelectionState();
        } catch (error) {
            console.error('Network scan failed:', error);
            AlertController.getInstance().showResultModal(
                false,
                'Scan Failed',
                'Could not refresh network list'
            );
        }
    }
}