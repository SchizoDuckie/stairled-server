/**
 * Constants defining various animation states
 * Controls animation lifecycle progression
 * Enables state-based behavior management
 * 
 * @enum {number}
 */
var STATES = {
  IDLE : 0,
  FADE_START: 1,
  RUNNING_START: 2,
  RUNNING_END: 4,
  FADE_END: 8,
  FINISHED: 16
};

/**
 * Constants defining animation playback strategies
 * Controls how animations are executed
 * 
 * @enum {number}
 */
var ANIM_STRATEGY = {
  ONE_AT_A_TIME: 1,
  ALL_AT_ONCE: 2,
  PROFILE: 4
};

/**
 * Constants defining animation end/off strategies
 * Controls how animations are terminated
 * 
 * @enum {number}
 */
var ANIM_OFF_STRATEGY = {
  ALL_AT_ONCE: 1,
  SEQUENCE: 2,
  REVERSE_SEQUENCE: 4
};

/**
 * Animation Engine providing:
 * - LED animation sequence management
 * - Multiple animation strategies
 * - Fade in/out transitions
 * - Shifting and bouncing patterns
 * - State-based animation control
 * - Configurable timing and brightness
 * - Pin mapping integration
 * - Loop and repeat management
 */
class AnimationEngine {

  /**
   * Creates animation engine instance
   * Initializes animation state tracking
   * Sets up pin mapping integration
   * Configures default animation parameters
   * Binds core animation methods
   * 
   * @param {PinMapper} pinmapper - LED pin mapping controller
   */
  constructor(pinmapper) {
    this.pinmapper = pinmapper;

    this.animation = []; 

    this.pinsAnimated = 0;

    this.startTime = 0;
    this.currentTime = 0;
    this.nextTick = 0;
  
    this.ANIMATION_STRATEGIES = ANIM_STRATEGY;
    this.ANIMATION_OFF_STRATEGIES = ANIM_OFF_STRATEGY;
    this.STATES = STATES;

    this.USE_FADE_START = true;
    this.USE_FADE_END = true;

    this.ANIM_STRATEGY = ANIM_STRATEGY.ONE_AT_A_TIME;
    this.ANIM_OFF_STRATEGY = ANIM_OFF_STRATEGY.SEQUENCE;
    this.ANIM_SHIFTING = true;   // should the animation be shifting from step to step
    this.ANIM_SHIFT_STEPS = 16;     // max steps to shift the animation. -1 for all
    this.CURRENT_SHIFT_STEP = 0;  // counter

    this.ANIM_BOUNCING = false;   // should the animation be bouncing after shifting
    this.CURRENT_BOUNCE_STEP = 0;
    this.CURRENT_STATE = STATES.IDLE;
    this.BOUNCE_DIRECTION_UP = 0;
    this.BOUNCE_DIRECTION_DOWN = 1;
  
    this.ANIM_REPEATS = -1;        // repeat times for animation, -1 for infinite
    this.ANIM_LOOPING = false;
    this.CURRENT_LOOP_STEP = 0;
    this.MAX_ANIM_LOOPS = -1;
  
    this.FADE_DURATION = 10;      // fade should take this long in seconds
    this.FADE_BRIGHTNESS = 100;    // fade all leds to this brightness to before starting the animation. 0 to disable.
  
    this.MAX_BRIGHTNESS = 4095;    // max global LED brightness
  
    this.ANIM_DURATION = 6;     // total animation (excluding fade) should take this long in ms  
    this.boundLoop = this.loop.bind(this);
    this.boundStep = this.step.bind(this);
    this.boundFadeStep = this.fadeStep.bind(this);
  }

  /**
   * Sets the strategy for how animations are played
   * Updates animation execution behavior
   * Maintains method chaining
   * 
   * @param {number} strategy - The animation strategy to use from ANIM_STRATEGY enum
   * @returns {AnimationEngine} For method chaining
   */
  setAnimationStrategy(strategy) {
    this.ANIM_STRATEGY = strategy;
    return this;
  }

  /**
   * Sets the strategy for how animations are ended/turned off
   * Controls animation termination behavior
   * Maintains method chaining
   * 
   * @param {number} strategy - The off animation strategy to use from ANIM_OFF_STRATEGY enum
   * @returns {AnimationEngine} For method chaining
   */
  setOffAnimationStrategy(strategy) {
    this.ANIM_OFF_STRATEGY = strategy;
    return this;
  }

  /**
   * Sets brightness on a mapped pin by number
   * Updates individual LED brightness
   * Maintains method chaining
   * 
   * @param {number} pin - The pin number to set
   * @param {number} brightness - Brightness value (0-4095)
   * @returns {AnimationEngine} For method chaining
   */
  setBrightness(pin, brightness) {
    this.pinmapper.setBrightness(pin, brightness);
    return this;
  }

  /**
   * Configures the animation sequence
   * Stores animation pattern
   * Creates backup of original sequence
   * Maintains method chaining
   * 
   * @param {Array<number>} anim - Array of brightness values in percent (0-100)
   * @returns {AnimationEngine} For method chaining
   */
  setAnimation(anim) {
      this.animation = anim;
      this.originalAnimation = anim;
      console.log("AnimationEngine intialized!");
      return this;
  }

  /**
   * Configures whether brightness steps should shift in circular order
   * Controls animation pattern movement
   * Sets shift step limits
   * Maintains method chaining
   * 
   * @param {boolean} enabled - Whether shifting is enabled
   * @param {number|boolean} steps - Number of steps to shift, or false for default
   * @returns {AnimationEngine} For method chaining
   */
  setShifting(enabled, steps) {
    this.ANIM_SHIFTING = enabled;
    this.ANIM_SHIFT_STEPS = steps || false;
    return this;
  }

  /**
   * Configures animation looping behavior
   * Controls repeat patterns
   * Sets iteration limits
   * Maintains method chaining
   * 
   * @param {boolean} enabled - Whether looping is enabled
   * @param {number|boolean} repeats - Number of repeats (-1 for infinite) or false for default
   * @returns {AnimationEngine} For method chaining
   */
  setLooping(enabled, repeats) {
    this.ANIM_LOOPING = enabled;
    this.ANIM_REPEATS = repeats = false;
    return this;
  }

  /**
   * Configures animation bouncing behavior
   * Controls pattern reversal
   * Maintains method chaining
   * 
   * @param {boolean} enabled - Whether bouncing is enabled
   * @returns {AnimationEngine} For method chaining
   */
  setBouncing(enabled) {
    this.ANIM_BOUNCING = enabled;
    return this;
  }

  /**
   * Sets the total duration for the animation
   * Controls animation timing
   * Maintains method chaining
   * 
   * @param {number} duration - Duration in milliseconds
   * @returns {AnimationEngine} For method chaining
   */
  setDuration( duration) {
    this.ANIM_DURATION = duration;
    return this;
  }

  /**
   * Starts the animation sequence
   * Initializes animation timing
   * Resets state counters
   * Begins animation loop
   * Maintains method chaining
   * 
   * @returns {AnimationEngine} For method chaining
   */
  start() {
    this.startTime = Date.now();
    this.CURRENT_STATE = STATES.FADE_START;
    this.CURRENT_BOUNCE_STEP = 0;
    this.CURRENT_SHIFT_STEP = 0;
    this.animation = this.originalAnimation;
    this.loop();
    return this;
  }

  /**
   * Stops the animation sequence
   * Clears animation timers
   * Returns to idle state
   * Maintains method chaining
   * 
   * @returns {AnimationEngine} For method chaining
   */
  stop() {
    this.CURRENT_STATE = STATES.IDLE;
    clearImmediate(this.timeout);
    return this;
  }

  /**
   * Clears all pins by setting their brightness to 0
   * Resets all LED states
   */
  clear() {
    for(var i =0; i<= this.animation.length; i++) {
      this.setBrightness(i, 0);
    }
  }
  

  /**
   * Main animation loop that handles state transitions and animation steps
   * Manages animation state machine
   * Controls timing and transitions
   * Handles fade effects
   * Processes animation steps
   * @private
   */
  loop() {
    this.currentTime = Date.now();
    switch(this.CURRENT_STATE) {
        case STATES.IDLE:
          console.log("State idle, we shouldn't be looping.");
        // nop
        return;
        break;
        case STATES.FADE_START:
          console.log("state fade start");
          if (!this.USE_FADE_START) {
            console.log("Use fade start flag is off. skipping.");
            this.CURRENT_STATE = STATES.RUNNING_START;
          } else {
            this.fadeStep();
          }
        break;
        case STATES.RUNNING_START:
            console.log("State running start");
            this.step();
        break;
        case STATES.RUNNING_END:
          console.log("State running end");
          this.step();
          break;
        case STATES.FADE_END:
            console.log("State fade end");
          if (!this.USE_FADE_END) {
            console.log("Use fade end off. skipping.");
            this.CURRENT_STATE = STATES.FINISHED;
          } else {
            this.fadeStep();
          }
        break;
        case STATES.FINISHED:
            console.log("State finished");
            if (this.ANIM_LOOPING && (this.MAX_ANIM_LOOPS > -1 ? this.CURRENT_LOOP_STEP < this.MAX_ANIM_LOOPS : true)) {
              this.startTime = Date.now();
              this.CURRENT_STATE = STATES.FADE_START;
              this.CURRENT_LOOP_STEP++;
            } else {
              this.CURRENT_STATE = STATES.IDLE;
            }
            break;
          }
      this.timeout = setImmediate(this.boundLoop);
      return;
  }

  /**
   * Calculates brightness for a given position in the animation
   * Handles reverse calculations
   * Applies pin-specific brightness limits
   * Ensures brightness bounds
   * 
   * @param {number} position - Current position (0-100)
   * @param {number} pin - Pin number
   * @param {number} minBrightness - Minimum brightness value
   * @param {number} maxBrightness - Maximum brightness value
   * @param {boolean} reverse - Whether to reverse the calculation
   * @returns {number} Calculated brightness value
   */      
  getBrightnessForPosition(position, pin, minBrightness, maxBrightness, reverse) {
    if((pin in this.animation)) {
      var newMaxBrightness = (maxBrightness / 100) * parseInt(this.animation[pin]);
      maxBrightness = newMaxBrightness;
    }
    var newBrightness, result;
    if(reverse) {
      position = 100 - position;
    }
    newBrightness = minBrightness + (((maxBrightness - minBrightness) / 100) * position);
    result = Math.round(newBrightness);
    return (result < minBrightness) ? minBrightness : result;
 } 

  getMaxBrightnessForPin(pin, maxBrightness) {
    return Math.round((maxBrightness / 100) * parseInt(this.animation[pin]));
  }

  getMaxBrightnessForNextPin(pin, maxBrightness) {
    console.log("Max brightness for next pin: ", pin, maxBrightness);
    var nextPin = pin < this.animation.length ? pin + 1 : 0;
    return Math.round((maxBrightness / 100) * parseInt(this.animation[nextPin] || 0));
  }

    /**
     * Calculates brightness for a shifting position between two pins
     * Handles brightness transitions
     * Manages direction changes
     * Ensures smooth transitions
     * 
     * @param {number} position - Current position (0-100)
     * @param {number} pin - Current pin number
     * @param {number} minBrightness - Minimum brightness value
     * @param {number} maxBrightness - Maximum brightness value
     * @param {boolean} reverse - Whether to reverse the calculation
     * @returns {number} Calculated brightness value for the shift position
     */
  getBrightnessForShiftPosition(position, pin, minBrightness, maxBrightness, reverse) {
      console.log("Brightness for shift position!", position, pin);
      var currentMax = this.getMaxBrightnessForPin(pin, maxBrightness - minBrightness);
      var nextMax = this.getMaxBrightnessForNextPin(pin, maxBrightness - minBrightness);
      let diff = 0;
      if(currentMax > nextMax) {
        diff = currentMax - nextMax;
        return minBrightness + Math.round(nextMax +  ((diff / 100) * position));
      } else {
        diff = nextMax - currentMax;
        return minBrightness + Math.round(nextMax - ((diff / 100) * position));
      }
    }



 /**
   * Performs a single step of the fade animation
   * Handles fade in/out transitions
   * Updates all pin brightnesses
   * Manages state transitions
   * @private
   */
  fadeStep() {
    var currentPerc = this.getProgress();
    for(var i=0; i< this.animation.length; i++) {
      switch (this.CURRENT_STATE) {
        case STATES.FADE_START:
            this.CURRENT_FADE_BRIGHTNESS = this.getBrightnessForPosition(currentPerc, null, 0, this.FADE_BRIGHTNESS);
            this.pinmapper.setBrightness(i, this.CURRENT_FADE_BRIGHTNESS);
        break;
        case STATES.FADE_END:
          this.CURRENT_FADE_BRIGHTNESS = this.getBrightnessForPosition(currentPerc, null, 0, this.FADE_BRIGHTNESS, true);
          this.pinmapper.setBrightness(i, this.CURRENT_FADE_BRIGHTNESS);
        break;
      }
    } 

    if(currentPerc >= 100) {
      switch(this.CURRENT_STATE) {
        case STATES.FADE_START:
          this.CURRENT_STATE = STATES.RUNNING_START;
          this.startTime = Date.now();
          this.pinsAnimated = 0;
        break;
        case STATES.FADE_END:
          this.CURRENT_STATE = STATES.FINISHED;
          this.startTime = Date.now();
        break;
      }
    }
  }

 /**
   * Calculates current animation progress as percentage
   * Validates duration settings
   * Handles timing calculations
   * Ensures progress bounds
   * 
   * @returns {number} Progress percentage (0-100)
   * @throws {Error} If ANIM_DURATION is not a valid number
   */
  getProgress() {
    if (!Number.isInteger(this.ANIM_DURATION)) {
      throw new Error(`ANIM_DURATION invalid: ${this.ANIM_DURATION} is not a number!`);
    }
    var endtime = this.startTime + this.ANIM_DURATION;
    var starttime = this.startTime;
    var duration = endtime - starttime; 
    var position = Date.now() - this.startTime;

    var currentPos = (position / duration);
    if(currentPos > 100) {
      currentPos = 100;
    }
    return Math.round(currentPos, 2);
  }

  
  /**
   * Performs a single step of the main animation
   * Handles different animation strategies
   * Manages pin transitions
   * Controls shifting behavior
   * Updates pin states
   * @private
   */
  step() {
    var currentPerc = this.getProgress();
    console.log("Animation progress: ", currentPerc);
    var currentPin, currentBrightness, newBrightness;

    switch (this.CURRENT_STATE) {
      case STATES.RUNNING_START:
        switch(this.ANIM_STRATEGY) {
          case ANIM_STRATEGY.ONE_AT_A_TIME:
            currentPin = this.pinsAnimated;
           
            newBrightness = this.getBrightnessForPosition(currentPerc, currentPin, (this.USE_FADE_START ? this.FADE_BRIGHTNESS : 0), this.MAX_BRIGHTNESS);
            this.pinmapper.setBrightness(currentPin, Math.round(newBrightness));
           
            if(currentPerc == 100) {
              this.pinsAnimated++;
              this.startTime = Date.now();

               if (this.pinsAnimated >= this.animation.length) {
                 this.CURRENT_STATE = STATES.RUNNING_END;
                 this.startTime = Date.now();
                 this.pinsAnimated = 0;
                 return;
               }
            }

          break;
          case ANIM_STRATEGY.ALL_AT_ONCE:
            for(var i=0; i<this.animation.length; i++) {
              if (this.ANIM_SHIFTING) {
                newBrightness = this.getBrightnessForShiftPosition(currentPerc, i, (this.USE_FADE_START ? this.FADE_BRIGHTNESS : 0), this.MAX_BRIGHTNESS);
              } else {
                newBrightness = this.getBrightnessForPosition(currentPerc, i, (this.USE_FADE_START ? this.FADE_BRIGHTNESS : 0), this.MAX_BRIGHTNESS);
              }
              this.pinmapper.setBrightness(i, newBrightness);
            }

            if (currentPerc == 100) {
              this.startTime = Date.now();
              this.pinsAnimated = 0;
              if(this.ANIM_SHIFTING && this.CURRENT_SHIFT_STEP < this.ANIM_SHIFT_STEPS) {
                this.shift();
                return;
              }
              this.CURRENT_STATE = STATES.RUNNING_END;
              return;
            }
          break;
        }
      break;
      case STATES.RUNNING_END:
        switch (this.ANIM_OFF_STRATEGY) {
          case ANIM_OFF_STRATEGY.SEQUENCE:
            currentPin = this.pinsAnimated;
            newBrightness = this.getBrightnessForPosition(currentPerc, currentPin, (this.USE_FADE_END ? this.FADE_BRIGHTNESS : 0), this.MAX_BRIGHTNESS,true);
            this.pinmapper.setBrightness(currentPin, newBrightness);

            if (currentPerc == 100) {
              this.pinsAnimated++;
              this.startTime = Date.now();

              if (this.pinsAnimated >= this.animation.length) {
                this.CURRENT_STATE = STATES.FADE_END;
                this.startTime = Date.now();
                this.pinsAnimated = 0;
                return;
              }
            }
            break;
          case ANIM_OFF_STRATEGY.REVERSE_SEQUENCE:
            currentPin = this.pinsAnimated;
            newBrightness = this.getBrightnessForPosition(currentPerc, this.animation.length - currentPin, (this.USE_FADE_END ? this.FADE_BRIGHTNESS : 0), this.MAX_BRIGHTNESS, true);
            this.pinmapper.setBrightness(this.animation.length - currentPin, newBrightness);

            if (currentPerc == 100) {
              this.pinsAnimated++;
              this.startTime = Date.now();

              if (this.pinsAnimated >= this.animation.length) {
                this.CURRENT_STATE = STATES.FADE_END;
                this.startTime = Date.now();
                this.pinsAnimated = 0;
                return;
              }
            }
          break;
          case ANIM_OFF_STRATEGY.ALL_AT_ONCE:
            for (var i = 0; i < this.animation.length; i++) {
              newBrightness = this.getBrightnessForPosition(currentPerc, i, (this.USE_FADE_END ? this.FADE_BRIGHTNESS : 0), this.MAX_BRIGHTNESS, true);
              this.pinmapper.setBrightness(i, newBrightness);
            }

            if (currentPerc == 100) {
              this.CURRENT_STATE = STATES.FADE_END;
              this.startTime = Date.now();
              this.pinsAnimated = 0;
              return;
            }
            break;
        }
      break;
    }

  }



  /**
   * Handles animation bouncing behavior
   * Controls direction changes
   * Manages bounce steps
   * @private
   * @todo Implement bounce functionality
   */
  bounce() {
      /**
        if(amountShifted == sizes.length -1) { // when a full iteration has been made
          shiftDirection = shiftDirection == "right" ? "left" : "right"; // switch direction
          amountShifted = 0;          // and reset the counter
        }
        */
    if(CURRENT_BOUNCE_STEP == MAX_BOUNCE_STEPS) {
        BOUNCE_DIRECTION = (BOUNCE_DIRECTION == BOUNCE_DIRECTION_UP) ? BOUNCE_DIRECTION_DOWN : BOUNCE_DIRECTION_UP;
    }
    
  }

      

}

module.exports = AnimationEngine;
