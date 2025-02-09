/**
 * Manages animation timeline functionality including:
 * - Sequential and parallel animation scheduling
 * - Time-based animation triggering
 * - Animation state management
 * - Duration tracking and position updates
 * - Active animation filtering
 * 
 * The timeline holds instances of the TimelineAnimation class
 * Usage: 
 * ```
 * let line = (new TimeLine())
 *  .add(0, new FadeIn(options))
 *  .add(500, new FadeOut(options))
 *  .setStartTime(new Date());
 *  // time elapses
 *  line.setCurrentPosition(new Date());
 *  var activeItems = line.getActiveItems();
 * ```
 */
class TimeLine {

    constructor() {
        this.queue = {};
        this.startTime = 0;
        this.currentPosition = 0;
        this.duration = 0;
        this.diff = 0;
    }

    /**
     * Schedules a new animation at a specific timeline position
     * Maintains animation ordering and updates total timeline duration
     * Supports parallel animations at same timestamp
     * Updates internal duration if new animation extends beyond current end
     * @param {number} startTime Milliseconds from timeline start when animation begins
     * @param {TimelineAnimation} instance Animation to execute at specified time
     * @return {TimeLine} Current timeline instance for chaining
     */
    add(startTime, instance) {
        if(!(startTime in this.queue)) {
            this.queue[startTime] = [];
        }
        this.queue[startTime].push(instance.setRelativePosition(startTime));
        if(this.duration <= startTime + instance.duration) {
            this.duration = startTime + instance.duration;
        }
        return this;
    }

    /**
     * Retrieves all scheduled animations regardless of state
     * Flattens nested timeline structure into single array
     * Preserves animation ordering by start time
     * @return {TimelineAnimation[]} Complete list of scheduled animations
     */
    getAllItems() {
        let output = [];
        for( let time in this.queue) {
            for (let item in this.queue[time]) {
                output.push(this.queue[time][item]);
            }
        }
        return output;
    }

    /**
     * Initializes timeline execution starting point
     * Updates absolute start times for all scheduled animations
     * Maintains relative positioning between animations
     * @param {number} time Unix timestamp marking timeline start
     * @return {TimeLine} Current timeline instance for chaining
     */
    setStartTime(time) {
        this.startTime = time;
        for(let position in this.queue) {
            let items = this.queue[position];
            for(let i=0; i<items.length; i++) {
                items[i].setAbsolutePosition(time + parseInt(position));
            }
        }
        return this;
    }

    /**
     * Updates animation states based on current time
     * Calculates elapsed time since timeline start
     * Updates active state for all animations
     * Triggers animation progress updates
     * @param {number} time Current Unix timestamp
     * @return {TimeLine} Current timeline instance for chaining
     */
    setCurrentPosition(time) {
        this.currentPosition = time;
        this.diff = time - this.startTime;
        for (let position in this.queue) {
            this.queue[position].map(item => item.setCurrentPosition(time));
        }
        return this;
    }

    /**
     * Filters and returns currently active animations
     * Checks active flag on all scheduled animations
     * Updates internal activeItems cache
     * Used for determining which animations to render
     * @return {TimelineAnimation[]} List of animations currently in progress
     */
    getActiveItems() {
        let output = [];
        for(let position in this.queue) {
            for(let item in this.queue[position]) {
                if (this.queue[position][item].active) {
                     output.push(this.queue[position][item]);
                 }
            }
        }
        this.activeItems = output;
        return output;
    }

    /**
     * Resets timeline to initial state
     * Clears current position and start time
     * Resets all scheduled animations
     * Maintains animation schedule for future replay
     */
    reset() {
        this.currentPosition = null;
        this.startTime = null;
        for(let position in this.queue) {
            let items = this.queue[position];
            for(let i=0; i<items.length; i++) {
                items[i].reset();
            }
        }
    }
}


export default TimeLine;