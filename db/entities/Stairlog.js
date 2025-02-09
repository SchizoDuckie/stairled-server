import CRUD from '../CRUD.js';
import Entity from '../CRUD.Entity.js';

class Stairlog extends Entity {
    constructor() {
        super();
    }
}
CRUD.define(Stairlog, {
    table: 'stairlog',
    primary: 'id',
    fields: ['id', 'sensorname', 'sensorvalue', 'effect', 'createdAt'],
    createStatement: `
        CREATE TABLE stairlog (
            'id' integer not null primary key autoincrement,
            'sensorname' varchar(255) not null,
            'sensorvalue' integer not null default '0',
            'effect' varchar(255) not null, 
            'createdAt' datetime not null default CURRENT_TIMESTAMP
        )`
});

export default Stairlog;
