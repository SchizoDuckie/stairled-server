/**
 * Manages Access Point configuration including:
 * - AP settings form submission
 * - Hostname validation and persistence
 * - Security settings enforcement
 */
class APConfigController {
    /**
     * Initializes AP configuration management
     * @param {Object} config - Runtime parameters
     * @param {string} config.hostname - Device network identifier
     * @param {string} config.ssid - Access Point network name
     */
    constructor(config) {
        this.hostname = config.hostname;
        this.ssid = config.ssid;
        this.mode = config.mode;
        this.modal = this.initModal('#apConfigModal');
        this.initializeEventListeners();
        
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
     * Binds form submission handlers
     * Uses event delegation for dynamic elements
     */
    initializeEventListeners() {
        $(document).on('submit', '#apConfigForm', this.handleApConfigSubmit.bind(this));
        $(document).on('submit', '#additionalSettingsForm', this.handleAdditionalSettingsSubmit.bind(this));
    }

    /**
     * Handles AP settings form submission
     * @param {Event} e - Form submit event
     */
    async handleApConfigSubmit(e) {
        e.preventDefault();
        const formData = $(e.target).serializeArray().reduce((acc, {name, value}) => {
            acc[name] = value;
            return acc;
        }, {});

        try {
            const response = await fetch('/wifi/ap-settings', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            AlertController.getInstance().showResultModal(
                result.success, 
                result.success ? 'AP Settings Updated' : 'Update Failed',
                result.success ? 'Access point configuration saved. Please switch your wifi to the new network!' : result.error
            );
        } catch (error) {
            AlertController.getInstance().showResultModal(
                false, 
                'Update Failed', 
                error.message
            );
        }
    }

    /**
     * Handles additional settings form submission
     * @param {Event} e - Submit event
     */
    async handleAdditionalSettingsSubmit(e) {
        e.preventDefault();
        const formData = {
            hostname: $('#additionalSettingsForm input[name="hostname"]').val()
        };

        try {
            const response = await fetch('/wifi/hostname', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(formData)
            });
            
            const result = await response.json();
            AlertController.getInstance().showResultModal(
                result.success,
                result.success ? 'Hostname Updated' : 'Update Failed',
                result.success ? 'Hostname change will take effect after reboot' : result.error
            );
        } catch (error) {
            AlertController.getInstance().showResultModal(
                false,
                'Update Failed', 
                error.message
            );
        }
    }
}