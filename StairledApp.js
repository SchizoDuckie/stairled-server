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
import { fileURLToPath } from 'url';
import Stairlog from "./db/entities/Stairlog.js";


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
        this.active = false;                

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
    
        eventBus.on(Events.SENSOR_TRIGGERED, (data) => {
            console.log("Sensor triggered event!", this.active, data);
            let sensor = data.sensor;

            if(!this.active) {
                console.log(`Sensor '${sensor.name}' triggered! Measured ${data.value} ${sensor.triggerType} configured treshold ${sensor.triggerThreshold}. Starting LedstripAnimation '${sensor.triggerEffect}'`);         
            
                this.active = true;
                console.log("Sensor triggered event!");
                sensor.anim.start();

                setTimeout(() => {
                    eventBus.emit(Events.SENSOR_ANIM_FINISHED, {sensor: sensor});
                }, sensor.anim.animation.timeline.duration);

            } else {
                console.log(`🚫 Sensor '${data.sensor.name}' triggered by ${data.value}, but blocked by currently running animation.`);
            }
        });

        eventBus.on(Events.SENSOR_ANIM_FINISHED, (data) => {
            this.active = false;
            console.log(`🚫 Sensor '${data.sensor.name}' animation finished. unblocking new triggers.`);
        });

        
        // MQTT event handlers
        this.mqtt.on('log', message => eventBus.system('info', message));
        this.mqtt.on('error', error => eventBus.system('error', 'MQTT Error', error));
    
        this.mqtt.on('sensorDiscovered', sensor => eventBus.emitData(Events.SENSOR_DISCOVERED, { name: sensor }));

        // remove sensor instances when a sensor removal was detected
        eventBus.on(Events.SENSOR_REMOVED, device => {
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
     * Load config variables in order of precedence:
     * 1. Command line arguments
     * 2. Environment variables
     * 3. User config file (user.json)
     * 4. Default config file (default.json)
     * @returns {nconf.Provider}
     */
    initConfig() {
        const config = new nconf.Provider();
        
        config.argv()                     // Command-line arguments
             .env()                       // Environment variables
             .file('user', {             // User configuration
                file: path.join(__dirname, 'config', 'user.json'),
                logicalSeparator: ':',
                format: {
                    parse: JSON.parse,
                    stringify: (obj) => JSON.stringify(obj, null, 2)
                }
             })
             .file('defaults', {         // Default configuration
                file: path.join(__dirname, 'config', 'default.json')
             });

        console.log("Config loaded with hierarchy: CLI args ← env vars ← user config ← defaults");
        return config;
    }

    /**
     * Initialize and configure pinmapping according to config
     * @returns {Promise<PinMapper>}
     */
    async initPinMapper() {
        console.log("Initializing PCA9685 Pin Mapper");
       
        
        try {
            const storedMapping = this.config.get('pinmapper:mapping');

            // Auto-discover all PCA9685 devices and set up initial mapping
            await pinMapper.initializeDiscoveredDevices(PCA9685, storedMapping);
            
            // Load existing mapping from config if it exists
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
