import WebServer from './WebServer.js';
import pinMapper from './PinMapper.js';
import Sensor from './Sensor.js';
import nconf from "nconf";
import path from "path";
import CRUD from "./db/CRUD.js";
import MdnsDiscoveryService from './services/MdnsDiscoveryService.js';
import MqttClient from './MqttClient.js';
import { eventBus, Events } from './services/EventBus.js';
import PCA9685 from "./drivers/adafruit-pca9685-patched.js";
import WebsocketServer from './WebsocketServer.js';
import { animationService } from './services/AnimationService.js';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Main application class for the Stairled system
 */
class StairledApp {

    constructor() {
        this.coreComponents = [
            { name: 'eventBus', init: () => eventBus },
            { name: 'config', init: () => this.initConfig() },
            { name: 'database', init: () => this.initDB() }
        ];

        this.serviceComponents = [
            { name: 'pinMapper', init: () => this.initPinMapper() },
            { name: 'mqtt', init: () => this.initMqttClient() },
            { name: 'animationService', init: () =>this.initAnimationService() },
            { name: 'sensors', init: () => this.initSensors() },
            { name: 'mdns', init: () => new MdnsDiscoveryService() },
            { name: 'webServer', init: () => new WebServer() },
            { name: 'webSocketServer', init: () => new WebsocketServer(this.webServer.getHttpServer()) }
        ];

        this.components = {};
    }

    /**
     * Initializes all components in the correct order, ensuring dependencies are met
     * @returns {Promise<StairledApp>} Returns this instance when all initialization is complete
     */
    async initialize() {
        // Initialize core components first
        for (const component of this.coreComponents) {
            try {
                this[component.name] = await component.init();
                console.log(`✓ Initialized ${component.name}`);
            } catch (error) {
                console.error(`✗ Failed to initialize ${component.name}:`, error);
                throw error;
            }
        }

        // Initialize service components
        for (const component of this.serviceComponents) {
            try {
                this[component.name] = await component.init();
                console.log(`✓ Initialized ${component.name}`);
            } catch (error) {
                console.error(`✗ Failed to initialize ${component.name}:`, error);
                throw error;
            }
        }

        this.webServer.registerRoutes(this);
        this.connectEventHandlers();
        
        return this;
    }

    async start() {
        try {
            await this.webServer.start();
            await this.webSocketServer.start(this.webServer.getHttpServer());
            await this.mdns.start();
            console.log("🪜 Stairled Server booted.");
        } catch (error) {
            console.error('❌Failed to start StairLed Server', error);
            throw error;
        }
    }

    connectEventHandlers() {
    
        // MQTT event handlers
        this.mqtt.on('log', message => eventBus.system('info', message));
        this.mqtt.on('error', error => eventBus.system('error', 'MQTT Error', error));
       // this.mqtt.on('sensorData', (sensor, value) => eventBus.emitData(Events.SENSOR_DATA, { sensor, value }));
        
        this.mqtt.on('sensorDiscovered', sensor => eventBus.emitData(Events.SENSOR_DISCOVERED, { name: sensor }));

        
        this.eventBus.on(Events.SYSTEM_INFO, message => console.log("Eventbus info: ",  message));
        
        // create new sensor instances when a sensor is discovered
        this.eventBus.on(Events.SENSOR_DISCOVERED, async (device) => {
            console.log("📡Sensor discovered: ", device);
            if (device && device.name) {
                // FIRST check if we already have a config for this sensor
                const existingConfig = this.config.get('sensors')?.find(s => s.name === device.name);
                
                // Use existing config if found, otherwise create new with defaults
                const sensorConfig = existingConfig || {
                    name: device.name,
                    channel: 0,  // Default channel
                    triggerThreshold: 50,
                    triggerType: '<=',
                    upperThreshold: 100
                };

                // Only create new sensor if it doesn't already exist
                if (!this.sensors.some(s => s.name === device.name)) {
                    const sensor = new Sensor(sensorConfig);
                    this.sensors = this.sensors || [];
                    this.sensors.push(sensor);
                    
                    // Only save to config if it's a new sensor
                    if (!existingConfig) {
                        this.config.set('sensors', this.sensors.map(s => ({
                            name: s.name,
                            channel: s.channel,
                            triggerThreshold: s.triggerThreshold,
                            triggerType: s.triggerType,
                            triggerEffect: s.triggerEffect
                        })));
                        await this.config.save();
                    }
                }
            }
        });

        // remove sensor instances when a sensor removal was detected
        this.eventBus.on(Events.SENSOR_REMOVED, device => {
            console.log("📡 Sensor removed: ", device);
            if (device && device.name) {
                this.sensors = this.sensors.filter(sensor => 
                    sensor?.config?.name !== device.name
                );
            }
        });

    }

    /**
     * Initializes the database connection and returns the CRUD instance
     * @returns {Promise<CRUD>} A promise that resolves to the initialized CRUD instance
     * @throws {Error} If database initialization fails
     */
    async initDB(databaseName = 'stairleds.sqlite3') {
        await CRUD.init({
            adapter: 'NodeSQLiteAdapter',
            databaseName: databaseName
        });
        console.log(`🗄️ Connected to database ${databaseName}!`); 
        return CRUD;        
    }

    async initAnimationService() {
        await animationService.getAnimationsList();
        return animationService;
    }

    initMqttClient() {
        const mqttClient = new MqttClient(this.config);
        mqttClient.connect();
        return mqttClient;
    }

    initSensors() {
        let configured = this.config.get('sensors');
        let sensors = [];
        console.log("Initializing sensors:", configured.length);
        configured.map((sensorConfig) => {
            sensors.push(new Sensor(sensorConfig));
        });
        return sensors;
    }

    /**
     * Load default config variables and override with user config from user.json
     * @returns {nconf.Provider}
     */
    initConfig() {
        // Load default config
        const defaultConfig = JSON.parse(
            fs.readFileSync(path.join(__dirname, 'config/default.json'), 'utf8')
        );
        
        // Attempt to load user config
        let userConfig = {};
        const userConfigPath = path.join(__dirname, 'config/user.json');
        if (fs.existsSync(userConfigPath)) {
            userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
        }

        // Create config provider
        const config = new nconf.Provider()
            .defaults(defaultConfig)
            .overrides(userConfig);

        // Configure file storage
        config.file('user', {
            file: userConfigPath,
            logicalSeparator: ':',
            format: {
                parse: JSON.parse,
                stringify: (obj) => JSON.stringify(obj, null, 2)
            }
        });

        console.log("Config loaded with hierarchy: defaults ← user overrides");
        return config;
    }

    /**
     * Initialize and configure pinmapping according to config
     * @returns {Promise<PinMapper>}
     */
    async initPinMapper() {
        console.log("Initializing PCA9685 Pin Mapper");

        
        
        try {
            // Auto-discover all PCA9685 devices and set up initial mapping
            await pinMapper.initializeDiscoveredDevices(PCA9685);
            
            // Load existing mapping from config if it exists
            const storedMapping = this.config.get('pinmapper:mapping');
            if (Array.isArray(storedMapping)) {
                pinMapper.setPinMapping(storedMapping);
                console.log("Loaded pin mapping from config");
            }

            // Store discovered devices in config
            this.config.set('pinmapper:discoveredDevices', pinMapper.getAvailableDrivers());
            await this.config.save();
            
            // Test all discovered LEDs
            setTimeout(()=> pinMapper.test(), 5000); // allow quick app startup, but always test. 
            
        } catch (err) {
            console.error('Failed to initialize LED system:', err);
            throw err;
        }

        return pinMapper;
    }
}

export default StairledApp; 