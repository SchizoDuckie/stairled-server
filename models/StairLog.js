import { Model } from 'objection';

/**
 * stairlog
 * --------
 * id
 * sensorname
 * sensorvalue
 * createdAt
 * updatedAt
 * deletedAt
 */
class StairLog extends Model {
    static get tableName() {
        return 'stairlog';
    }

}

export default StairLog;