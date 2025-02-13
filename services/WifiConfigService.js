import fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import { eventBus, Events } from './EventBus.js';
import fsSync from 'fs';

const execAsync = promisify(exec);

class WifiConfigService {
    static CONFIG_PATHS = {
        HOSTAPD: '/etc/hostapd/hostapd.conf',
        WPA_SUPPLICANT: '/etc/wpa_supplicant/wpa_supplicant.conf',
        HOSTNAME: '/etc/hostname'
    };

    /**
     * Reads current system hostname from /etc/hostname
     * @returns {string} Current system hostname
     * @throws {Error} If hostname file cannot be read
     */
    async getSystemHostname() {
        try {
            return fsSync.readFileSync(WifiConfigService.CONFIG_PATHS.HOSTNAME, 'utf8').trim();
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, 'Failed to read system hostname', error);
            throw new Error(`Failed to read system hostname: ${error.message}`);
        }
    }

    /**
     * Compute WPA PSK hash from SSID and password
     * @param {string} ssid Network name
     * @param {string} password WPA passphrase
     * @returns {Promise<string>} The computed PSK hash
     */
    async computeWpaPsk(ssid, password) {
        try {
            console.log(`computing wpa_passphrase for "${ssid}" "${password}"`);
            const { stdout } = await execAsync(`wpa_passphrase "${ssid}" "${password}"`);
            console.log(stdout);
            const pskMatch = stdout.match(/^\s*psk=([0-9a-f]{64})$/m)
            
            if (!pskMatch?.[1]) {
                throw new Error('Failed to compute PSK hash: '+stdout);
            }
            
            return pskMatch[1];
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, 'PSK computation failed', error);
            throw new Error(`PSK computation failed: ${error.message}`);
        }
    }

    /**
     * Write config file with sudo privileges
     * @param {string} path File path
     * @param {string} content File content
     * @returns {Promise<void>}
     */
    async writeConfigWithSudo(path, content) {
        try {
            const tempPath = `/tmp/${path.split('/').pop()}`;
            await fs.writeFile(tempPath, content);
            await execAsync(`sudo mv ${tempPath} ${path}`);
            await execAsync(`sudo chown root:root ${path}`);
            await execAsync(`sudo chmod 600 ${path}`);
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, 'Config write failed', error);
            throw new Error(`Config write failed: ${error.message}`);
        }
    }

    /**
     * Switch WiFi operating mode
     * @param {string} mode - 'AP' or 'client'
     * @param {Object} [network] - Required for client mode
     * @returns {Promise<void>}
     */
    async switchWifiMode(mode, network) {
        const scriptPaths = {
            AP: '/home/pi/enable_ap.sh',
            client: '/home/pi/disable_ap.sh'
        };

        try {
            if (mode === 'client') {
                if (!network?.ssid || !network?.password) {
                    throw new Error('Network credentials required for client mode');
                }

                // Read the template
                const { stdout: template } = await execAsync(
                    'sudo cat /etc/wpa_supplicant/wpa_supplicant.conf.wificlient.template'
                );

                // Compute PSK hash for the new network
                const pskHash = await this.computeWpaPsk(network.ssid, network.password);

                // Replace placeholders with actual values
                const configContent = template
                    .replace('ssid=""', `ssid="${network.ssid}"`)
                    .replace('psk=""', `psk=${pskHash}`);

                // Write the new config
                await fs.writeFile('/home/pi/wpa_supplicant.conf.wificlient', configContent);
            }

            // Execute mode switch script
            await execAsync(`sudo ${scriptPaths[mode]}`);
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, `Mode switch failed: ${mode}`, error);
            throw error;
        }
    }

    /**
     * Read and parse hostapd configuration
     * @returns {Promise<Object>} Parsed configuration
     */
    async readHostapdConfig() {
        try {
            const { stdout } = await execAsync(
                `sudo cat ${WifiConfigService.CONFIG_PATHS.HOSTAPD}`
            );
            
            return stdout.split('\n').reduce((config, line) => {
                const [key, value] = line.split('=');
                if (key && value) {
                    const cleanKey = key.trim();
                    const cleanValue = value.trim().replace(/^"(.*)"$/, '$1');
                    // Mask password field
                    config[cleanKey] = cleanKey === 'wpa_passphrase' 
                        ? '********' 
                        : cleanValue;
                }
                return config;
            }, {});
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, 'Failed to read hostapd config', error);
            throw new Error(`Config read failed: ${error.message}`);
        }
    }

    /**
     * Update hostapd configuration
     * @param {Object} configUpdates Key-value pairs to update
     * @returns {Promise<void>}
     */
    async updateHostapdConfig(configUpdates) {
        try {
            let config = await this.readHostapdConfig();
            config = { ...config, ...configUpdates};

            const configContent = Object.entries(config)
                .map(([key, value]) => `${key}=${value}`)
                .join('\n');
            
            await this.writeConfigWithSudo(
                WifiConfigService.CONFIG_PATHS.HOSTAPD,
                configContent
            );
        } catch (error) {
            eventBus.emit(Events.SYSTEM_ERROR, 'Failed to update hostapd config', error);
            throw error;
        }
    }

    /**
     * Gets current network routing information
     * @returns {Promise<Object>} Network info including gateway and DNS
     */
    async getNetworkInfo() {
        try {
            const gateway = await execAsync("ip route | grep default | awk '{print $3}'")
                .then(({ stdout }) => stdout.trim())
                .catch(() => 'Unknown');

            const dnsServers = await fs.readFile('/etc/resolv.conf', 'utf8')
                .then(content => content.split('\n')
                    .filter(line => line.startsWith('nameserver'))
                    .map(line => line.split(' ')[1])
                )
                .catch(() => []);

            return { gateway, dnsServers };
        } catch (error) {
            console.error('Failed to get network info:', error);
            return { gateway: 'Unknown', dnsServers: [] };
        }
    }

    /**
     * Gets current IP address of primary interface
     * @returns {Promise<string>} IP address
     */
    async getCurrentIP() {
        try {
            const { stdout } = await execAsync("hostname -I | awk '{print $1}'");
            return stdout.trim() || 'No IP assigned';
        } catch (error) {
            console.error('Failed to get current IP:', error);
            return 'Unknown';
        }
    }
}
export default new WifiConfigService();