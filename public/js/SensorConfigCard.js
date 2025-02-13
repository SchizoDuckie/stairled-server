/**
 * Manages sensor configuration UI components and persistence including:
 * - Card element lifecycle management (creation/reuse)
 * - Real-time chart visualization
 * - Configuration form handling
 * - Server communication for config persistence
 * - Connection status monitoring
 * - Template compilation and rendering
 */
class SensorConfigCard {
    /** @static @type {Map<string, SensorConfigCard>} Registry of all card instances keyed by sensor name */
    static registry = new Map();
    
    /**
     * Creates sensor configuration card instance
     * @param {Object} params - Configuration parameters
     * @param {string} params.name - Unique sensor identifier (ASCII lowercase)
     * @param {string[]} params.effects - Available trigger effects for dropdown
     * @param {Object} [params.config] - Initial sensor config (connected state, thresholds)
     * @param {HTMLElement} [params.element] - Existing DOM element to reuse (prevents duplicate cards)
     */
    constructor({name, effects, config = {}, element}) {
        this.name = name;
        this.effects = effects;
        this.config = config;
        
        this.element = element || this.findExistingElement(name) || this.createNewElement(name);
                
        this.compileTemplates();
        SensorConfigCard.registry.set(name, this);
    }
    
    /**
     * Finds existing DOM element for this sensor card
     * @param {string} name - Sensor name to search for
     * @returns {HTMLElement|null} Existing element or null if not found
     */
    findExistingElement(name) {
        return document.querySelector(`.sensor-card[data-sensor-name="${name}"]`);
    }

    /**
     * Creates new DOM element for the sensor card
     * @param {string} name - Sensor name for data attribute
     * @returns {HTMLElement} Newly created card element
     */
    createNewElement(name) {
        let el = document.createElement('div');
        el.setAttribute('class', 'sensor-card col col-md-4');
        el.setAttribute('data-sensor-name', name);
        document.querySelector('#sensorConfigurations').appendChild(el);
        return el;

    }
    
    /**
     * Compiles Handlebars templates for card rendering
     * @note Maintains template cache in instance property
     */
    compileTemplates() {
        const configCardTemplate = document.getElementById('sensor-config-card').innerHTML;
        this.template = Handlebars.compile(configCardTemplate);    
    }

    /**
     * Renders card UI components and initializes functionality
     * - Builds template context from current config
     * - Updates DOM with compiled Handlebars template
     * - Initializes chart visualization if missing
     * - Binds form submission handlers
     * - Updates connection status badge
     */
    render() {
        const context = {
            name: this.name,
            channel: this.config.channel || '',
            triggerThreshold: this.config.triggerThreshold || 0,
            triggerType: this.config.triggerType || '>=',
            triggerEffect: this.config.triggerEffect || '',
            effects: this.effects,
            connected: this.config.connected || false
        };
        
        const html = this.template(context);
        this.element.innerHTML = html;
        
        this.updateConnectionStatus(this.config.connected || false);
        this.initializeChart();
        this.bindSaveHandler();
    }
    
    /**
     * Initializes chart visualization if not already present
     * @note Only creates chart if canvas element exists in template
     */
    initializeChart() {
        if (!this.element.querySelector('canvas.__chart')) {
            this.chart = new ChartManager(
                [],
                this.element.querySelector('canvas'),
                { xMin: -15, xMax: 0, fixedScale: true }
            );
            this.chart.initChart();
            
            if (this.config.triggerThreshold) {
                this.chart.setTriggerValue(this.config.triggerThreshold);
            }
        }
    }
    
    /**
     * Binds form submission handler for configuration saves
     * @listens submit - Form submissions within card
     */
    bindSaveHandler() {
        $(document).on('submit', `.sensor-card-wrapper[data-sensor-name="${this.name}"] form`, (e) => {
            e.preventDefault();
            e.stopPropagation();

            this.saveConfig(new FormData(e.target));
            
            if (this.chart) {
                const newThreshold = parseFloat(e.target.elements[`sensor_${this.name}_triggerThreshold`].value);
                if (!isNaN(newThreshold)) {
                    this.chart.setTriggerValue(newThreshold);
                }
            }
        });
    }
    
    /**
     * Saves configuration to memory and persists to server
     * - Validates form data types (number parsing)
     * - Merges updates with existing config
     * - Sends POST request to /sensors endpoint
     * - Updates chart threshold visualization on success
     * - Logs errors to console on failure
     * @param {FormData} formData - Raw form values from configuration UI
     */
    saveConfig(formData) {
        const configUpdate = {
            channel: parseInt(formData.get(`sensor_${this.name}_channel`)),
            triggerThreshold: parseFloat(formData.get(`sensor_${this.name}_triggerThreshold`)),
            triggerType: formData.get(`sensor_${this.name}_triggerType`),
            triggerEffect: formData.get(`sensor_${this.name}_triggerEffect`)
        };
        
        Object.assign(this.config, configUpdate);
        
        fetch('/sensors', {
            method: 'POST',
            body: new URLSearchParams({
                name: this.name,
                ...configUpdate
            }),
            headers: {'Content-Type': 'application/x-www-form-urlencoded'}
        }).then(response => {
            if (response.ok) {
                console.log(`${this.name} config saved`);
            }
        }).catch(error => {
            console.error('Save failed:', error);
        });
    }
    
    /**
     * Updates chart with new sensor data
     * Also updates connection status since receiving data implies connection
     * @param {number[]} data - Array of data points to display
     */
    updateChart(data) {
        this.chart.updateChart(data);
        // Update connection status when receiving data
        this.updateConnectionStatus(true);
        this.config.connected = true;
    }
    
    /**
     * Updates connection status badge UI
     * - Sets badge color (green=connected, red=disconnected)
     * - Updates status text display
     * @param {boolean} connected - Current connection state from backend
     */
    updateConnectionStatus(connected) {
        const badge = this.element.querySelector('.badge');
        badge.className = `badge bg-${connected ? 'success' : 'danger'}`;
        badge.textContent = connected ? 'Connected' : 'Disconnected';
    }
}