import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


export class HandlebarsHelpers {

    static getServerHelpers(hbs) {
        return {
            ...this.getCommonHelpers(),
            includeRaw: (partialName) => {
                const partialPath = path.join(__dirname, '..', 'views', 'partials', `${partialName}.handlebars`);
                const content = fs.readFileSync(partialPath, 'utf8');
                return new hbs.SafeString(content);
            }
        };
    }

    static getClientHelpersScript() {
        return Object
            .entries(this.getCommonHelpers())
            .map(([name, fn]) => {
                return `Handlebars.registerHelper('${name}', ${fn.toString()});`;
            })
            .join('\n');
    }

    static getCommonHelpers() {
        return {
            eq: (a, b) => a === b,
            if_eq: function(a, b, opts) {
                return a === b ? opts.fn(this) : opts.inverse(this);
            },
            if_neq: function(a, b, opts) {
                return a !== b ? opts.fn(this) : opts.inverse(this);
            },
            inc: (value) => parseInt(value) + 1,
            json: (context) => JSON.stringify(context),
            includes: (array, item) => array ? array.includes(item) : false,
            range: (start, end) => {
                start = parseInt(start, 10);
                end = parseInt(end, 10);
                const range = [];
                for (let i = start; i <= end; i++) {
                    range.push(i);
                }
                return range;
            },
            or: (...args) => args.slice(0, -1).some(Boolean),
            and: (...args) => args.slice(0, -1).every(Boolean),
            not: (value) => !value,
            gt: (a, b) => a > b,
            gte: (a, b) => a >= b,
            lt: (a, b) => a < b,
            lte: (a, b) => a <= b,
            join: (array, separator) => array ? array.join(separator) : '',
            toLowerCase: (str) => typeof str === 'string' ? str.toLowerCase() : '',
            signalColor: (signalLevel) => {
                const level = parseInt(signalLevel);
                if (level >= -50) return 'success';
                if (level >= -70) return 'warning';
                return 'danger';
            },
            signalPercentage: (signalLevel) => {
                const min = -100; // Typical minimum signal
                const max = -30;  // Typical maximum signal
                const clamped = Math.min(Math.max(signalLevel, min), max);
                return Math.round(((clamped - min) / (max - min)) * 100);
            },
            
            /**
             * Calculates Bootstrap column size based on number of drivers
             * Returns appropriate col-md-* class for responsive grid
             * @param {number} drivers object
             * @returns {number} Bootstrap grid column size (4, if > 3, or 6 else)
             */
            colSize: (drivers) => {
                if (Object.keys(drivers).length >= 3) return 4;     
                return 6;
            },

            toString: (value) => String(value)
        };
    }
} 