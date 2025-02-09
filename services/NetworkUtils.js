import { promisify } from 'util';
import { exec } from 'child_process';

const execAsync = promisify(exec);

export default {
    /**
     * Performs low-level network availability check
     * @param {string} host - IP address or hostname to check
     * @returns {Promise<boolean>} True if host responds to ping
     */
    async checkHostAlive(host) {
        try {
            const { stdout, stderr } = await execAsync(
                `ping -c 1 -W 2 ${host}`,
                { timeout: 3000 }
            );
            
            // Check for packet loss percentage
            const packetLoss = stdout.match(/(\d+)% packet loss/);
            return packetLoss && parseInt(packetLoss[1]) < 100;
        } catch (error) {
            console.error(`Ping check failed for ${host}:`, error);
            return false;
        }
    },

    /**
     * Alternative connectivity check using ARP ping
     * @param {string} host - IP address to check
     */
    async checkArpPing(host) {
        try {
            await execAsync(`arping -c 1 -w 1 ${host}`);
            return true;
        } catch {
            return false;
        }
    }
}; 