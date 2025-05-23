/**
 * Manages WebRTC connections using PeerJS for multiplayer gameplay.
 * Communicates with a MultiplayerGame instance.
 */
class WebRTCManager {
    /**
     * Initializes the WebRTC manager.
     * @param {MultiplayerGame} multiplayerGame - The active MultiplayerGame instance.
     */
    constructor(multiplayerGame) {
        this.multiplayerGame = multiplayerGame;
        this.peer = null; // PeerJS instance
        this.connections = new Map(); // Host: Map<peerId, DataConnection>
        this.hostConnection = null; // Client: DataConnection to the host
        this.peerId = null; // Local PeerJS ID
        this.hostId = null; // Client: ID of the host connecting to
        this.isHost = false;
        this.isConnected = false; // General flag for connection status
        // Use a secure PeerServer or the default cloud one
        // Consider self-hosting for better reliability/control: https://github.com/peers/peerjs-server
        this.peerJsConfig = {
            // key: 'your-peerjs-api-key', // If using PeerJS cloud with API key
            // host: 'your-peerjs-server.com', // If self-hosting
            // port: 9000, // Default PeerJS server port
            // path: '/myapp', // If server uses a path
            debug: 2, // <--- Increased debug level
            config: { // This nested config is standard for ICE servers
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:stun2.l.google.com:19302' },
                    { urls: 'stun:stun3.l.google.com:19302' },
                    { urls: 'stun:stun4.l.google.com:19302' },
                    // Add TURN servers here if complex NAT traversal is needed
                    // (Requires hosting a TURN server or using a paid service)
                ],
                // Optional: Change ICE transport policy if needed, but default usually best
                // iceTransportPolicy: 'all', // 'all' or 'relay'
            }
        };
    }

    /**
     * Initializes PeerJS for the Host role.
     * Generates a Peer ID and sets up listeners for incoming connections.
     * @returns {Promise<string>} Resolves with the Host's Peer ID.
     * @rejects {Error} If PeerJS initialization fails.
     */
    initializeHost() {
        return new Promise((resolve, reject) => {
        this.isHost = true;
            this.cleanup(); // Ensure any previous state is cleared

            try {
                // Generate a random 6-digit ID for simplicity
                // For production, consider letting PeerJS generate its own complex ID
                // and using a signalling server/matchmaking service to share it.
                const generatedId = String(Math.floor(100000 + Math.random() * 900000));
                this.peer = new Peer(generatedId, this.peerJsConfig);

                this.peer.on('open', (id) => {
                    console.log('Host PeerJS initialized. ID:', id);
                    this.peerId = id;
                    this.isConnected = true; // Peer object is ready
                    this._setupHostConnectionListener();
                    resolve(id); // Return the generated ID
                });

                this._setupCommonPeerListeners(reject);

            } catch (error) {
                console.error("Error initializing host PeerJS:", error);
                reject(new Error("Failed to initialize hosting."));
            }
        });
    }

    /** Sets up the listener for incoming connections (Host only). */
    _setupHostConnectionListener() {
        this.peer.on('connection', (connection) => {
            console.log(`WebRTC Host: Incoming connection from: ${connection.peer}`);
            this._handleNewConnection(connection);
        });
    }

    /**
     * Handles a new incoming connection request (Host only).
     * Sets up listeners for the specific connection.
     * @param {import("peerjs").DataConnection} connection - The new data connection.
     */
    _handleNewConnection(connection) {
        // Optional: Implement logic here to limit connections if needed
        // if (this.connections.size >= MAX_PLAYERS) {
        //    console.warn(`Rejecting connection from ${connection.peer}, lobby full.`);
        //    connection.send({ type: 'h_joinRejected', reason: 'Lobby full' });
        //    setTimeout(() => connection.close(), 500); // Give message time to send
        //    return;
        // }

        connection.on('open', () => {
            console.log(`Connection established with ${connection.peer}`);
            this.connections.set(connection.peer, connection);
            // Notify the Game logic that a potential connection is ready
            // The actual 'join' logic happens after message exchange (e.g., c_requestJoin)
             console.log(`Peer ${connection.peer} connected. Waiting for join request.`);
        });

        connection.on('data', (data) => {
            this.handleDataMessage(data, connection.peer);
        });

        connection.on('close', () => {
            console.log(`Connection closed with ${connection.peer}`);
            this.connections.delete(connection.peer);
            this.multiplayerGame.handleDisconnect(connection.peer);
        });

        connection.on('error', (err) => {
            console.error(`Connection error with ${connection.peer}:`, err);
            this.connections.delete(connection.peer);
            this.multiplayerGame.handleDisconnect(connection.peer, err);
        });
    }


    /**
     * Initializes PeerJS for the Client role and attempts to connect to the Host.
     * @param {string} hostId - The Peer ID of the host to connect to.
     * @returns {Promise<void>} Resolves when connection attempt is initiated.
     * @rejects {Error} If PeerJS initialization or connection fails immediately.
     */
    initializeClient(hostId) {
        return new Promise((resolve, reject) => {
             if (!hostId || typeof hostId !== 'string' || !/^[0-9]{6}$/.test(hostId)) {
                 return reject(new Error("Invalid Host ID format."));
             }
            this.isHost = false;
            this.cleanup(); // Ensure clean state
            this.hostId = hostId;

            try {
                 // Clients can use an anonymous PeerJS ID
                 this.peer = new Peer(this.peerJsConfig);

                 this.peer.on('open', (id) => {
                     console.log('Client PeerJS initialized. Local ID:', id, 'Attempting to connect to Host:', hostId);
                     this.peerId = id;

                     try {
                         const conn = this.peer.connect(hostId, { reliable: true });
                         this._setupClientConnectionHandlers(conn, resolve, reject); // Setup handlers immediately
                         this.hostConnection = conn;
                     } catch (connectError) {
                         console.error("PeerJS connect() error:", connectError);
                         this.cleanup();
                         reject(new Error(`Failed to initiate connection to host ${hostId}.`));
                     }
                 });

                 this._setupCommonPeerListeners(reject);

            } catch (error) {
                console.error("Error initializing client PeerJS:", error);
                 reject(new Error("Failed to initialize client connection."));
            }
        });
    }

    /**
     * Sets up event handlers for the client's connection to the host.
     * @param {import("peerjs").DataConnection} connection
     * @param {Function} resolve - Promise resolve function from initializeClient.
     * @param {Function} reject - Promise reject function from initializeClient.
     */
    _setupClientConnectionHandlers(connection, resolve, reject) {
        let connectionTimeout = setTimeout(() => {
             console.error(`Connection attempt to ${this.hostId} timed out.`);
             this.cleanup();
             reject(new Error(`Connection to host ${this.hostId} timed out.`));
        }, 15000); // 15 second timeout

        connection.on('open', () => {
            clearTimeout(connectionTimeout);
            console.log(`Connection established with Host ${connection.peer}`);
            this.isConnected = true;
            resolve(); // Indicate connection attempt successful (message exchange follows)
             // Client should now send c_requestJoin
             this.multiplayerGame.onHostConnected();
        });

        connection.on('data', (data) => {
            this.handleDataMessage(data, connection.peer);
        });

        connection.on('close', () => {
            clearTimeout(connectionTimeout);
            console.log(`Connection closed with Host ${connection.peer}`);
            this.isConnected = false;
            this.hostConnection = null;
            this.multiplayerGame.handleHostDisconnect("Connection closed by host.");
            this.cleanup(); // Clean up peer object too
        });

        connection.on('error', (err) => {
            clearTimeout(connectionTimeout);
            console.error(`Connection error with Host ${connection.peer}:`, err);
            this.isConnected = false;
            this.hostConnection = null;
             // Reject the promise if it hasn't resolved yet (initial connection failed)
            reject(new Error(`Connection error: ${err.message || err.type || 'Unknown error'}`));
            this.multiplayerGame.handleHostDisconnect(`Connection error: ${err.message || err.type || 'Unknown error'}`);
            this.cleanup();
        });
    }


    /**
     * Sets up common PeerJS error and disconnected listeners.
     * @param {Function} reject - The reject function of the initialization promise.
     */
    _setupCommonPeerListeners(reject) {
         if (!this.peer) return;
        
        this.peer.on('error', (err) => {
             console.error('PeerJS Error:', err);
             // Distinguish connection errors from other errors
             if (!this.isHost && !this.isConnected && err.type !== 'peer-unavailable') {
                 // Client failed to establish initial connection
                 console.warn("WebRTCManager: Client connection error before fully connected. Calling game.handleConnectionFailed.");
                 this.multiplayerGame.handleConnectionFailed(`Kon niet verbinden: ${err.message || err.type || 'Onbekende fout'}`);
                 // Don't call fatal error here
             } else if (err.type === 'peer-unavailable') {
                 // Specific error for non-existent peer ID
                 console.warn("WebRTCManager: Host peer ID unavailable. Calling game.handleConnectionFailed.");
                 this.multiplayerGame.handleConnectionFailed(`Spelletje niet gevonden. Controleer de code?`);
             } else {
                 // Treat other errors as potentially fatal (e.g., network issues after connection)
                 console.error("WebRTCManager: Treating PeerJS error as potentially fatal.");
                 this.multiplayerGame.handleFatalError(`Multiplayer connection failed: ${err.message || err.type}`);
             }
             // Cleanup might still be needed depending on the error
             // this.cleanup(); // Moved cleanup decision into game handlers
         });

         this.peer.on('disconnected', () => {
             console.warn('PeerJS disconnected from signaling server. Attempting to reconnect...');
             // PeerJS attempts reconnection automatically by default unless destroyed.
             // We might want to inform the user or game logic if reconnection fails after some time.
             this.isConnected = false; // Reflect potentially unstable state
             // No automatic cleanup here, rely on reconnection or error handlers.
         });

         this.peer.on('close', () => {
             // This means peer.destroy() was called.
             console.log('PeerJS object closed.');
             this.isConnected = false;
        });
    }
    
    /**
     * Parses and handles incoming data messages.
     * @param {any} data - The raw data received.
     * @param {string} senderId - The Peer ID of the sender.
     */
    handleDataMessage(data, senderId) {
        try {
            let message;
             // PeerJS v1 sometimes wraps in 'data' object, v0 doesn't. Handle both.
            if (typeof data === 'object' && data !== null && data.hasOwnProperty('data')) {
                message = JSON.parse(data.data);
            } else if (typeof data === 'string') {
                 message = JSON.parse(data); // Assume JSON string directly
            } else {
                 message = data; // Use as is if not string/wrapped object (e.g. binary)
            }

            console.log(`Received message from ${senderId}:`, message);

            // Pass the parsed message and sender ID to the MultiplayerGame logic handler
            if (this.multiplayerGame && typeof this.multiplayerGame.handleMultiplayerMessage === 'function') {
                this.multiplayerGame.handleMultiplayerMessage(message, senderId);
        } else {
                console.warn("MultiplayerGame instance or message handler not available.");
            }
        } catch (error) {
            console.error(`Error parsing message from ${senderId}:`, error, 'Raw data:', data);
        }
    }
    
    /**
     * Sends a message (Client Role).
     * @param {object} message - The message object to send.
     */
    send(message) {
        if (this.isHost) {
            console.error("Client 'send' method called on host instance.");
            return;
        }
        if (this.hostConnection && this.isConnected) {
            try {
                const messageString = JSON.stringify(message);
                console.log(`Sending message to host ${this.hostId}:`, message);
                this.hostConnection.send(messageString);
            } catch (error) {
                console.error("Error sending message to host:", error, message);
            }
        } else {
            console.warn("Cannot send message: No active connection to host.");
        }
    }
    
    /**
     * Sends a message to a specific peer (Host Role).
     * @param {string} peerId - The recipient's Peer ID.
     * @param {object} message - The message object to send.
     */
    sendTo(peerId, message) {
        if (!this.isHost) {
            console.error("Host 'sendTo' method called on client instance.");
            return;
        }
        const connection = this.connections.get(peerId);
        if (connection) {
            try {
                const messageString = JSON.stringify(message);
                console.log(`Sending message to ${peerId}:`, message);
                connection.send(messageString);
            } catch (error) {
                console.error(`Error sending message to ${peerId}:`, error, message);
            }
        } else {
            console.warn(`Cannot send message: No active connection found for peer ${peerId}.`);
        }
    }

    /**
     * Broadcasts a message to all connected peers (Host Role).
     * @param {object} message - The message object to send.
     * @param {string[]} [excludePeerIds=[]] - Optional array of Peer IDs to exclude.
     */
    broadcast(message, excludePeerIds = []) {
        if (!this.isHost) {
            console.error("Host 'broadcast' method called on client instance.");
            return;
        }
        if (this.connections.size === 0) {
            // console.log("Broadcast skipped: No clients connected.");
            return;
        }
        try {
            const messageString = JSON.stringify(message);
            console.log(`Broadcasting message to ${this.connections.size} clients (excluding ${excludePeerIds.length}):`, message);
            this.connections.forEach((connection, peerId) => {
                if (!excludePeerIds.includes(peerId)) {
                    connection.send(messageString);
                }
            });
        } catch (error) {
            console.error("Error broadcasting message:", error, message);
        }
    }


    /** Returns true if the manager believes it has an active connection. */
    isActive() {
         if (this.isHost) {
             // Host is active if the peer object exists and maybe has connections?
             // Or just if peer exists after initialization? Let's say if peer exists.
             return !!this.peer && !this.peer.destroyed;
         } else {
             // Client is active if connected to host.
             return !!this.peer && !this.peer.destroyed && !!this.hostConnection && this.isConnected;
         }
    }


    /**
     * Cleans up all connections and destroys the PeerJS instance.
     */
    cleanup() {
        console.log("WebRTCManager: Starting cleanup...");
        // const wasActive = this.isActive(); // Check if we were active before cleanup - Not currently used

        if (this.isHost && this.connections) {
            console.log(`WebRTCManager: Closing ${this.connections.size} client connections.`);
            this.connections.forEach((conn, peerId) => {
                // Check connection exists and seems open before attempting to close
                if (conn && conn.open) {
                    console.log(`WebRTCManager: Attempting to close connection to client ${peerId}`);
                    try {
                        conn.close(); // Already wrapped
                        console.log(`WebRTCManager: Successfully called close() for ${peerId}`);
                    } catch (error) {
                        console.error(`WebRTCManager: Error closing connection to client ${peerId}:`, error);
                    }
                } else {
                    console.log(`WebRTCManager: Connection to client ${peerId} already closed or invalid, skipping close().`);
                }
            });
            this.connections.clear();
        } else if (!this.isHost && this.hostConnection) {
            if (this.hostConnection && this.hostConnection.open) {
                console.log(`WebRTCManager: Attempting to close connection to host ${this.hostId}`);
                try {
                    this.hostConnection.close(); // Already wrapped
                    console.log(`WebRTCManager: Successfully called close() for host ${this.hostId}`);
                } catch (error) {
                    console.error(`WebRTCManager: Error closing connection to host ${this.hostId}:`, error);
                }
            } else {
                 console.log(`WebRTCManager: Connection to host ${this.hostId} already closed or invalid, skipping close().`);
            }
            this.hostConnection = null;
        }

        // Destroy the main peer object
        if (this.peer && !this.peer.destroyed) {
            const peerIdToDestroy = this.peer.id;
            console.log(`WebRTCManager: Destroying PeerJS instance ${peerIdToDestroy}`);
            try {
                this.peer.destroy();
                console.log(`WebRTCManager: Successfully called destroy() for peer ${peerIdToDestroy}`);
            } catch (error) {
                 console.error(`WebRTCManager: Error destroying peer instance ${peerIdToDestroy}:`, error);
            }
        }

        this.peer = null;
        this.peerId = null;
        this.hostId = null;
        this.isConnected = false;
        console.log("WebRTCManager: Cleanup complete.");
    }
}

// Note: Ensure the PeerJS library is loaded before this script.
// <script src="https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js"></script> 