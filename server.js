import StairledApp from './StairledApp.js';

// Add this near the top of the file
if (process.argv[1].includes('nodemon')) {
    process.env.NODE_ENV = 'development';
}

// Enhanced global error handlers
process.on('uncaughtException', (error) => {
    console.error('❌ FATAL ERROR:');
    console.error('Message:', error.message);
    console.error('Stack:', error.stack);
    console.error('Full error:', error);
    
    // Give time for logs to be written
    setTimeout(() => {
        process.exit(1);
    }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Promise Rejection:');
    console.error('Reason:', reason);
    if (reason instanceof Error) {
        console.error('Stack:', reason.stack);
    }
    console.error('Promise:', promise);
});

/**
 * Initialize and start the Stairled application
 */
async function startServer() {
    console.log('Starting Stairled Server');
    
    try {
        const app = new StairledApp();
        await app.initialize();
        await app.start();
    } catch (error) {
        console.error('Failed to initialize StairledApp:', error);
        console.error('Stack:', error.stack);
        process.exit(1);
    }
}

startServer();
