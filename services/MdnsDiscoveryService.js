import { spawn } from 'child_process';
import { eventBus, Events } from './EventBus.js';

export default class MdnsDiscoveryService {
    constructor() {
        this.devices = [];
        this.process = null;
        this.outputBuffer = '';
        this.intervalId = null;
        this.isStarted = false;
    }

    start() {
        if (this.isStarted) {
            eventBus.emit(Events.SYSTEM_INFO, 'mDNS discovery service is already running');
            return;
        }
        
        this.discoverDevices();
        this.intervalId = setInterval(() => this.discoverDevices(), 30000);
        this.isStarted = true;
        
        console.log('🔎 mDNS discovery service started');
        eventBus.emit(Events.SERVICE_STATUS, 'mdns', 'running');
    }

    discoverDevices() {
        const timeout = setTimeout(() => {
            if (this.process) {
                this.process.kill();
                eventBus.emit(Events.SYSTEM_DEBUG, 'mDNS discovery timed out, will retry next cycle');
            }
        }, 15000);

        this.process = spawn('avahi-browse', ['-a', '-r', '-t', '-p'], {
            stdio: ['ignore', 'pipe', 'ignore']
        });
        
        let buffer = '';
        this.process.stdout.on('data', (data) => {
            buffer += data.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            lines.forEach(line => {
                if (line.trim()) {
                    this.parseLine(line.trim());
                }
            });
        });

        this.process.on('close', () => {
            clearTimeout(timeout);
            eventBus.emit(Events.SYSTEM_DEBUG, 'mDNS discovery completed');
        });
    }

    parseLine(line) {
        if (!line.startsWith('=')) return;
        
        const fields = line.split(';');
        if (fields.length < 9) return;

        const device = {
            interface: fields[1],
            protocol: fields[2],
            service: fields[4],
            hostname: fields[6],
            ip: fields[7],
            port: parseInt(fields[8], 10),
            txt: fields.slice(9).reduce((acc, entry) => {
                const [key, value] = entry.split('=');
                acc[key] = value;
                return acc;
            }, {})
        };

        const existingIndex = this.devices.findIndex(d => d.ip === device.ip);
        if (existingIndex === -1) {
            this.devices.push(device);
            eventBus.emit(Events.DEVICE_DISCOVERED, device);
        } else {
            // Update existing entry
            this.devices[existingIndex] = device;
            eventBus.emit(Events.DEVICE_UPDATED, device);
        }
    }

    stop() {
        if (this.process) {
            this.process.kill();
            this.process = null;
        }
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isStarted = false;
        eventBus.emit(Events.SERVICE_STATUS, 'mdns', 'stopped');
        eventBus.emit(Events.SYSTEM_INFO, 'mDNS discovery service stopped');
    }

    getDiscoveredDevices() {
        return this.devices;
    }
}
