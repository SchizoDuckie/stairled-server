import CRUD from './db/CRUD.js';

CRUD.DEBUG = true;

await CRUD.init({
    adapter: 'BunSQLiteAdapter',
    databaseName: './db.sqlite'
});
