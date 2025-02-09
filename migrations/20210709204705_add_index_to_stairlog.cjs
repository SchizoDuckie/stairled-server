
exports.up = function(knex) {
    return knex.schema.alterTable('stairlog',(table) => {
        return table.index('sensorname');
    });
};

exports.down = function(knex) {
    return knex.schema.alterTable('stairlog', function(table) {
        return table.dropIndex('sensorname');
    });
};
