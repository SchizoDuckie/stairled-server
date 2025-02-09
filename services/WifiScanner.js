import { promisify } from 'util';
import { exec } from 'child_process';
import { eventBus, Events } from './EventBus.js';

const execAsync = promisify(exec);

class WifiScanner {
    constructor() {
        this.interface = 'wlan0';
        this.scanCommand = `sudo iwlist ${this.interface} scan`;
        this.statusCommand = `iwconfig ${this.interface} && ip addr show ${this.interface}`;
    }

    /**
     * Scan for nearby WiFi access points
     * @returns {Promise<Array<Object>>} List of access points
     */
    async scanNearbyAccessPoints() {
        try {
            const { stdout } = await execAsync(this.scanCommand);
            return this.parseScanOutput(stdout);
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, 'WiFi scan failed', error);
            throw new Error(`WiFi scan failed: ${error.message}`);
        }
    }

    /**
     * Parse iwlist scan output into structured data
     * @private
     */
    parseScanOutput(output) {
        const accessPoints = [];
        let currentAP = {};

        output.split('\n').forEach(line => {
            line = line.trim();
            
            if (line.startsWith('ESSID')) {
                if (Object.keys(currentAP).length > 0) {
                    accessPoints.push(currentAP);
                }
                currentAP = {
                    ssid: line.split(':')[1].trim().replace(/^"(.*)"$/, '$1'),
                    signal_level: -99,
                    security: 'Open',
                    channel: 'N/A',
                    bssid: '',
                    mode: ''
                };
            } else if (line.includes('Quality')) {
                const signalMatch = line.match(/Signal level=(-?\d+)/);
                if (signalMatch) {
                    currentAP.signal_level = parseInt(signalMatch[1]) || -99;
                    currentAP.signal_percent = Math.min(Math.max(2 * (currentAP.signal_level + 100), 0), 100);
                }
            } else if (line.includes('Encryption key')) {
                currentAP.security = line.includes('on') ? 'WPA/WPA2' : 'Open';
            } else if (line.includes('Channel:')) {
                currentAP.channel = line.split(':')[1].trim();
            } else if (line.includes('Mode:')) {
                currentAP.mode = line.split(':')[1].trim();
            }
        });

        if (Object.keys(currentAP).length > 0) {
            accessPoints.push(currentAP);
        }

        return accessPoints;
    }

    /**
     * Get current WiFi connection status
     * @returns {Promise<Object>} Connection status
     */
    async getCurrentWifiStatus() {
        try {
            const { stdout } = await execAsync(this.statusCommand);
            return this.parseStatusOutput(stdout);
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, 'Status check failed', error);
            throw new Error(`Status check failed: ${error.message}`);
        }
    }

    /**
     * Parse iwconfig/ip output into structured data
     * @private
     */
    parseStatusOutput(output) {
        return {
            mode: output.includes('Mode:Master') ? 'AP' : 'Client',
            details: {
                ip: (output.match(/inet\s+(\S+)/) || [])[1] || 'Not assigned',
                signal: parseInt((output.match(/Signal level=(-?\d+)/) || [])[1]) || -99,
                bitrate: (output.match(/Bit Rate=(\S+)/) || [])[1] || 'N/A',
                quality: (output.match(/Link Quality=(\d+)\/70/) || [])[1] || '0',
                essid: (output.match(/ESSID:"([^"]+)"/) || [])[1] || 'Not connected'
            }
        };
    }
}

export default new WifiScanner();
