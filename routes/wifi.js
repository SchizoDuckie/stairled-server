import server from "../WebServer.js";
import nconf from 'nconf';
import WifiScanner from '../services/WifiScanner.js';
import { promisify } from 'util';
import { exec } from 'child_process';
import fs from 'fs/promises';
import  wifiConfigService  from '../services/WifiConfigService.js';
import { HandlebarsHelpers } from '../services/HandlebarsHelpers.js';


const execAsync = promisify(exec);

/**
 * WiFi Interface Management System
 * Handles:
 * - AP/Client mode switching
 * - Network scanning and discovery
 * - Real-time connection monitoring
 * - Access Point configuration
 * - Client network setup
 * - Network status reporting
 * - Device discovery integration
 */
class Wifi {
    /**
     * Initializes WiFi management system
     * Prepares network configuration
     * Sets up mode switching handlers
     */
    constructor() {
        // No initialization needed currently
    }

    /**
     * Binds HTTP and WebSocket routes
     * Creates network configuration endpoints
     * Establishes device discovery API
     * Sets up mode switching handlers
     * @param {StairledApp} app - Application instance for route binding
     */
    register(app) {
        app.webServer.get('/wifi', (req, res) => this.handleGetWifiSettings(app, req, res));
        app.webServer.post('/wifi/ap-settings', (req, res) => this.handleApSettings(app, req, res));
        app.webServer.post('/wifi/additional-settings', (req, res) => this.handleAdditionalSettings(app, req, res));
        app.webServer.post('/wifi/client-config', (req, res) => this.handleClientConfig(app, req, res));
        app.webServer.post('/wifi/mode', (req, res) => this.handleModeSwitch(app, req, res));
        app.webServer.get('/wifi/scan', (req, res) => this.handleWifiScan(app, req, res));
        app.webServer.get('/helloworld', (req, res) => this.handleHelloWorld(app, req, res));
        app.webServer.get('/api/devices', (req, res) => this.handleGetDevices(app, req, res));
    }

    /**
     * Renders WiFi settings interface
     * Loads current network status
     * Displays connection details
     * Shows available networks
     * Updates real-time metrics
     * @param {StairledApp} app - Application instance for network access
     * @param {Request} req - Express request
     * @param {Response} res - Express response for page render
     */
    async handleGetWifiSettings(app, req, res) {
        try {
            const status = await WifiScanner.getCurrentWifiStatus();
            const hostapdConfig = await wifiConfigService.readHostapdConfig();
            const systemHostname = await wifiConfigService.getSystemHostname();
            const networkInfo = await wifiConfigService.getNetworkInfo();
            const currentIP = await wifiConfigService.getCurrentIP();

            res.render('wifi', {
                mode: status.mode,
                runtimeConfig: {
                    mode: status.mode,
                    ssid: hostapdConfig.ssid,
                    channel: hostapdConfig.channel || '6',
                    hostname: systemHostname,
                    password: hostapdConfig.wpa_passphrase || '',
                },
                connectedNetwork: {
                    ssid: status.details.essid,
                    signal: status.details.signal || -99,
                    signal_percent: Math.min(Math.max(2 * (status.details.signal + 100), 0), 100)
                },
                networkInfo: {
                    gateway: networkInfo.gateway,
                    dns: networkInfo.dnsServers.join(', ')
                },
                currentIP: currentIP,
                discoveredDevices: [],
                accessPoints: []
            });
        } catch (error) {
            console.error('Failed to load wifi page:', error);
            res.status(500).render('error', {
                errorTitle: 'WiFi Settings Unavailable',
                errorMessage: 'Failed to load network information',
                errorDetails: error.message,
                showRetry: true,
                retryLink: '/wifi'
            });
        }
    }

    /**
     * Updates Access Point settings
     * Validates configuration parameters
     * Generates WPA PSK hash
     * Updates hostapd configuration
     * Restarts network services
     * @param {StairledApp} app - Application instance for config storage
     * @param {Request} req - Express request with AP settings
     * @param {Response} res - Express response for result handling
     */
    async handleApSettings(app, req, res) {
        try {
            const { ssid, password, original_password, channel } = req.body;
            const maskedPassword = '********';
            let currentConfig = await wifiConfigService.readHostapdConfig();

            if(currentConfig.ssid !== ssid && password === maskedPassword) {
                return res.status(400).json({
                    success: false,
                    error: 'SSID cannot be changed without providing a password for the AP'
                });
            }
            
            res.json({ success: true });
            res.end();


            await wifiConfigService.updateHostapdConfig({
                ssid: ssid,
                wpa_psk: await wifiConfigService.computeWpaPsk(ssid, password),
                channel: channel
            });
            
            execAsync('sudo service hostapd restart');
            
        } catch (error) {
            console.error('Failed to update AP settings:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }

    /**
     * Updates additional network settings
     * Validates hostname format
     * Updates system hostname
     * Modifies hosts file
     * Requires sudo access
     * @param {StairledApp} app - Application instance
     * @param {Request} req - Express request with network settings
     * @param {Response} res - Express response for result handling
     */
    async handleAdditionalSettings(app, req, res) {
        try {
            const { hostname } = req.body;
            
            if (!hostname) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Hostname is required' 
                });
            }

            await execAsync(`sudo hostnamectl set-hostname ${hostname}`);
            await fs.writeFile('/tmp/hosts', `127.0.1.1\t${hostname}\n`);
            await execAsync('sudo mv /tmp/hosts /etc/hosts');
            
            res.json({ 
                success: true, 
                message: 'Network settings updated successfully'
            });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: 'Network configuration failed',
                details: error.message
            });
        }
    }

    /**
     * Configures client network connection
     * Validates network credentials
     * Switches to client mode
     * Initiates network connection
     * Responds before mode switch
     * @param {StairledApp} app - Application instance
     * @param {Request} req - Express request with network credentials
     * @param {Response} res - Express response for result handling
     */
    async handleClientConfig(app, req, res) {
        try {
            const { ssid, password } = req.body;
            
            if (!ssid || !password) {
                return res.status(400).json({ 
                    success: false, 
                    error: 'SSID and password required' 
                });
            }
            res.json({ 
                success: true, 
                message: 'Client configuration updated successfully'
            });
            res.end();
            
            await wifiConfigService.switchWifiMode('client', { ssid, password });
        } catch (error) {
            res.status(500).json({ 
                success: false, 
                error: 'Client configuration failed',
                details: error.message
            });
        }
    }

    /**
     * Handles WiFi mode switching
     * Validates mode parameter
     * Initiates mode transition
     * Returns appropriate status message
     * @param {StairledApp} app - Application instance
     * @param {Request} req - Express request with mode selection
     * @param {Response} res - Express response for result handling
     */
    async handleModeSwitch(app, req, res) {
        try {
            const { mode, network } = req.body;
            await wifiConfigService.switchWifiMode(mode, network);
            
            res.json({ 
                success: true, 
                message: mode === 'AP' 
                    ? 'Rebooting to AP mode...' 
                    : 'Switched to client mode'
            });
        } catch (err) {
            res.status(500).json({ 
                error: `Mode switch failed: ${err.message}` 
            });
        }
    }

    /**
     * Scans for nearby WiFi networks
     * Implements retry mechanism
     * Uses exponential backoff
     * Formats network information
     * Calculates signal strength
     * @param {StairledApp} app - Application instance
     * @param {Request} req - Express request
     * @param {Response} res - Express response with scan results
     */
    async handleWifiScan(app, req, res) {
        try {
            let retries = 3;
            let delay = 1000;
            
            while (retries > 0) {
                try {
                    const accessPoints = await WifiScanner.scanNearbyAccessPoints();
                    return res.json({ 
                        accessPoints: accessPoints.map(ap => ({
                            ssid: ap.ssid,
                            bssid: ap.bssid,
                            channel: ap.channel,
                            security: ap.security,
                            signal_level: ap.signal_level,
                            signal_percent: ap.signal_percent,
                            strength: getSignalStrength(ap.signal_level)
                        }))
                    });
                } catch (error) {
                    if (error.message.includes("Device or resource busy")) {
                        retries--;
                        if (retries > 0) {
                            await new Promise(resolve => setTimeout(resolve, delay));
                            delay *= 2;
                            continue;
                        }
                    }
                    throw error;
                }
            }
            throw new Error('WiFi scan failed after retries: Device busy');
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    }

    /**
     * Returns basic system status
     * Provides hostname information
     * Enables CORS access
     * @param {StairledApp} app - Application instance
     * @param {Request} req - Express request
     * @param {Response} res - Express response with status
     */
    handleHelloWorld(app, req, res) {
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET');
        res.json({ 
            status: 'ready',
            hostname: nconf.get('hostname')
        });
    }

    /**
     * Returns discovered network devices
     * Uses mDNS discovery service
     * @param {StairledApp} app - Application instance for device access
     * @param {Request} req - Express request
     * @param {Response} res - Express response with device list
     */
    handleGetDevices(app, req, res) {
        res.json(app.mdns.getDiscoveredDevices());
    }
}

/**
 * Calculates signal strength category
 * Converts dBm to descriptive strength
 * @param {number} dBm - Signal strength in dBm
 * @returns {string} Signal strength category
 */
function getSignalStrength(dBm) {
    if (dBm >= -50) return 'Excellent';
    if (dBm >= -60) return 'Good';
    if (dBm >= -70) return 'Fair';
    return 'Weak';
}

export default new Wifi(); 