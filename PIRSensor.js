const Gpio = require('onoff').Gpio;

class PIRSensor {

    constructor(pin, callback) {
        this.callback = callback;
        this.currentValue = null;
        this.currentError = null;
        this.pir = new Gpio(pin, 'in', 'rising');
        console.log("Starting new watch on GPIO "+pin);
        this.pir.watch(this.watcher.bind(this));
        process.on("SIGINT", _ => {
            this.pir.unexport();
        });
    }

    watcher(err, value) {
        if(err) {
            throw err;
        }
        console.log("PIR signal! ", value);
        this.currentValue = value;
        this.currentError = err;
        this.callback(value);
    }

}


module.exports = PIRSensor;