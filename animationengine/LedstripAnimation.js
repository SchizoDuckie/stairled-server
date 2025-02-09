import TimeLine from './TimeLine.js';


/**
 * LedstripAnimation 
 * fades led strips attached to pca9685 instances with PWM.
 */
class LedstripAnimation {

    /**
     * Constructor: initializes the internal timeline and attaches the PinMapper
     * @param {PinMapper} mapper PinMapper instance for PCA9685 pin mapping
     */
    constructor(mapper, easingFunction = 'defaultEasing') {
        this.mapper = mapper;
        this.timeline = new TimeLine();
        this.easingFunction = easingFunction;
        this.started = false;
        this.startTime = null;
        this.currentTime = null;
        this.hooks = [];
        this.boundLoop = null;
        this.loopInfinite = false;
        this.looper = null;
        this.brightnessCompensation = 1; // Add default brightness compensation
    }
    // Default easing function (now using smooth elastic)
    static defaultEasing(t) {
        return LedstripAnimation.easeInBounce(t);
    }

    static linear(t) {
        return t;
    }

    // New set of easing functions with more dynamic movement
    static easeInBack(t) {
        const s = 1.70158;
        return t * t * ((s + 1) * t - s);
    }

    static easeOutBack(t) {
        const s = 1.70158;
        return (t -= 1) * t * ((s + 1) * t + s) + 1;
    }

    static easeInOutBack(t) {
        const s = 1.70158 * 1.525;
        if ((t *= 2) < 1) return 0.5 * (t * t * ((s + 1) * t - s));
        return 0.5 * ((t -= 2) * t * ((s + 1) * t + s) + 2);
    }

    static easeInElastic(t) {
        return Math.sin(5.5 * t * Math.PI) * Math.pow(2, 10 * (t - 1));
    }

    static easeOutElastic(t) {
        return Math.sin(-5.5 * t * Math.PI) * Math.pow(2, -10 * t) + 1;
    }

    static easeInOutElastic(t) {
        if (t < 0.5) return 0.5 * Math.sin(11 * Math.PI * t) * Math.pow(2, 10 * (2 * t - 1));
        return 0.5 * (Math.sin(-11 * Math.PI * t) * Math.pow(2, -10 * (2 * t - 1)) + 2);
    }

    static easeInBounce(t) {
        return 1 - LedstripAnimation.easeOutBounce(1 - t);
    }

    static easeOutBounce(t) {
        if (t < 1 / 2.75) {
            return 7.5625 * t * t;
        } else if (t < 2 / 2.75) {
            return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        } else if (t < 2.5 / 2.75) {
            return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        } else {
            return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
        }
    }

    static easeInOutBounce(t) {
        return t < 0.5
            ? LedstripAnimation.easeInBounce(t * 2) * 0.5
            : LedstripAnimation.easeOutBounce(t * 2 - 1) * 0.5 + 0.5;
    }

    // Compensate for LED brightness threshold
    compensateBrightness(brightness) {
        // Just pass through the brightness value - no compensation needed
        return Math.min(Math.max(Math.round(brightness), 0), 4095);
    }

    /**
     * Add a hook into the animation process, for instance to tap into rendering
     * @param {function} callback to execute on
     * @return {LedstripAnimation} fluent interface
     */
    addHook(callback) {
        this.hooks.push(callback);
        return this;
    }

    /**
     * Add a new animation procedure to the timeline
     * @param {int} startTime startTime in milliseconds
     * @param {TimelineAnimation} instance an instance of a `TimelineAnimation`
     * @return {LedstripAnimation} fluent interface
     */
    add(startTime, instance) {
        this.timeline.add(startTime, instance);
        return this;
    }

    /**
     * Main Run loop:
     * - Updates the timeline with current position
     * - Grabs active items
     * - Calls `render()` on them
     * - Iterates the results and sets the brightness on returned pins via the pinMapper
     * - schedules the next call to itself via `setImmediate`
     * @private
     * @return void
     */
     loop() {
        this.currentTime = Date.now();
        this.timeline.setCurrentPosition(this.currentTime);
        let items = this.timeline.getActiveItems();
        

        for (let item of items) {
            let easedProgress = LedstripAnimation[this.easingFunction](item.progress / 100);
            let pins = item.render(easedProgress);
            

            for (let pin in pins) {
                let brightness = parseInt(pins[pin]);
                if (isNaN(brightness)) {
                    console.log('NaN brightness detected:', {
                        easedProgress,
                        pins,
                        rawPinValue: pins[pin],
                        pin
                    });
                    debugger; // Break on first NaN
                    break;
                }
                this.mapper.setBrightness(parseInt(pin), brightness);
            }
        }

        for(let i=0; i< this.hooks.length; i++) {
            this.hooks[i](items, this);
        }
        items = null;

        if((this.startTime + this.timeline.duration) < this.currentTime) {
             this.stop();
            if (this.loopInfinite) {
                this.start();
            }
        } else {
            if(this.started) {
                this.looper = setImmediate(this.boundLoop);
            }
        }
    }


    /**
     * Start the animation. 
     * - sets `this.started` to `true`
     * - Sets `this.startTime` to `Date.now()` or to the _provided timestamp_. 
     * - Propagates the current time to the internal Timeline instance
     * - Starts calling the `this.loop()` function as fast as possible. 
     * @param {Date} timeTravel optional start time in history or future.
     * @return {LedstripAnimation} fluent interface
     */
    start(timeTravel) {
        this.started = true;
        this.startTime = timeTravel || Date.now();
        this.timeline.setStartTime(this.startTime);
        this.boundLoop = this.loop.bind(this);
        this.loop();
        return this;
    }

    /**
     * Stop the animation.
     * Kills the loop and sets `this.started` to `false`
     * @return {LedstripAnimation} fluent interface
     */
    stop() {
        this.started = false;
        this.looper = null;
        this.boundLoop = null;
        this.currentTime = null;
        clearImmediate(this.looper);
        this.timeline.reset();
        this.mapper.setAllBrightness(0);
        return this;
    }

    /**
     * Set animation timing options.
     * @param {Object} options - Animation options including timing.
     * @return {LedstripAnimation} fluent interface
     */
    setEasingFunction(easingFunction) {
        this.easingFunction = easingFunction;
        return this;
    }

}

export default LedstripAnimation;
