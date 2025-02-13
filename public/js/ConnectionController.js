/**
 * Manages post-mode-switch verification including:
 * - Connectivity checks
 * - Hostname resolution
 * - Countdown timer
 * - Error state handling
 */
class ConnectionController {
    /**
     * @param {Object} config - Connection parameters
     * @param {string} config.hostname - Device network address
     * @param {string} config.apSSID - Fallback AP network name
     */
    constructor(config) {
        this.hostname = config.hostname;
        this.apSSID = config.apSSID;
        this.checkInterval = null;
        this.countdownSeconds = 60;
        this.countdownInterval = null;
        this.compileTemplates();
    }

    compileTemplates() {
        const connectionTemplate = document.getElementById('connection-status-partial').innerHTML;
        this.connectionTemplate = Handlebars.compile(connectionTemplate);
        
        const errorTemplate = document.getElementById('connection-error-partial').innerHTML;
        this.errorTemplate = Handlebars.compile(errorTemplate);

        const stepsTemplate = document.getElementById('connection-steps-partial').innerHTML;
        this.stepsTemplate = Handlebars.compile(stepsTemplate);
    }

    /**
     * Displays connection verification interface
     */
    showConnectionVerificationModal() {
        const templateData = {
            title: !this.apSSID ? 'Access Point Rebooting' : 'Connecting to Network',
            ssid: this.apSSID,
            hostname: this.hostname,
            isAPMode: !this.apSSID
        };

        const modalHtml = this.connectionTemplate({
            ...templateData,
            connectionSteps: this.stepsTemplate(templateData)
        });

        const container = document.getElementById('dynamic-modals');
        container.innerHTML = modalHtml;
        
        this.modal = new bootstrap.Modal(document.querySelector('#connectionCheckModal'));
        this.modal.show();
        this.startConnectivityChecks(this.hostname);
    }

    /**
     * Performs periodic connectivity checks to device
     * Handles hostname resolution fallback logic
     * Manages countdown timer and error states
     */
    startConnectivityChecks(hostname) {
        const checkHostname = async () => {
            try {
                const response = await fetch(`http://${hostname}/helloworld`, {
                    method: 'GET',
                    timeout: 3000
                });
                
                if (response.ok) {
                    clearInterval(this.checkInterval);
                    clearInterval(this.countdownInterval);
                    window.location.href = `http://${hostname}/wifi`;
                }
            } catch (error) {
                this.handleConnectivityError(hostname);
            }
        };

        this.checkInterval = setInterval(checkHostname, 5000);
        checkHostname(); // Initial immediate check
    }

    /**
     * Starts countdown timer with UI updates
     * @param {number} duration - Seconds for countdown
     */
    startCountdown(duration) {
        this.countdownSeconds = duration;
        const countdownElement = document.querySelector('.countdown');
        
        this.countdownInterval = setInterval(() => {
            this.countdownSeconds--;
            countdownElement.textContent = this.countdownSeconds;
            
            if (this.countdownSeconds <= 0) {
                clearInterval(this.countdownInterval);
                this.handleConnectivityError(this.hostname);
            }
        }, 1000);
    }

    /**
     * Shows AP reboot verification modal
     */
    showAPRebootVerificationModal() {
        const templateData = {
            title: 'Rebooting as Access Point',
            hostname: this.hostname,
            ssid: this.apSSID,
            isAPMode: true
        };

        const modalHtml = this.connectionTemplate({
            ...templateData,
            connectionSteps: this.stepsTemplate(templateData)
        });

        const container = document.getElementById('dynamic-modals');
        container.innerHTML = modalHtml;
        
        this.modal = new bootstrap.Modal(document.querySelector('#connectionCheckModal'));
        this.modal.show();
        this.startCountdown(60);
        this.startConnectivityChecks(this.hostname);
    }

    /**
     * Handles full reboot verification process
     */
    async handleRebootVerification() {
        // Phase 1: Initial countdown
        this.startCountdown(120); // 2 minute initial wait
        
        // Phase 2: Ping checks after initial countdown
        setTimeout(async () => {
            await this.startPingChecks();
        }, 120000);
    }

    /**
     * Performs layered connectivity checks
     */
    async startPingChecks() {
        this.updateStatusMessage('Searching for device...');
        
        const pingCheck = async () => {
            try {
                // Direct HTTP check to device IP
                const response = await fetch(`http://${this.hostname}/helloworld`, {
                    mode: 'no-cors',
                    cache: 'no-store',
                    timeout: 3000
                });
                
                // Even if CORS blocks, response type will change
                if (response.type === 'opaque') {
                    this.updateStatusMessage('Device found! Finalizing...');
                    return true;
                }
            } catch (error) {
                // Network error = device not responding yet
            }
            return false;
        };

        // Try every 2 seconds
        const pingInterval = setInterval(async () => {
            if (await pingCheck()) {
                clearInterval(pingInterval);
                this.startServiceChecks();
            }
        }, 2000);
    }

    /**
     * Checks for web interface availability
     */
    startServiceChecks() {
        const serviceCheck = async () => {
            try {
                await fetch(`http://${this.hostname}/helloworld`);
                clearInterval(this.checkInterval);
                window.location.href = `http://${this.hostname}/`;
            } catch (error) {
                // Services not fully up yet
            }
        };

        // Check every 2 seconds once device is pingable
        this.checkInterval = setInterval(serviceCheck, 2000);
    }

    /**
     * Updates status message in UI
     */
    updateStatusMessage(message) {
        document.querySelector('.status-message').textContent = message;
    }

}
