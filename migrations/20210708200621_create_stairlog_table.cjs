
exports.up = function(knex) {
    return knex.schema.createTable('stairlog', function(t) {

        t.increments('id').unsigned().primary();
        t.string('sensorname').notNull();
        t.integer('sensorvalue').notNull().defaultTo(0);
        t.string('effect').notNull();
        t.dateTime('createdAt').notNull().defaultTo(knex.fn.now());
    });
};

exports.down = function(knex) {
    return knex.schema.dropTable('stairlog');
};
