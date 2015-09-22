"use strict";

var conn;
var jobs = [];
var schedule = {};

var logger, sun;

module.exports = function(c, l) {

    conn = c;
    logger = l.child({component: 'Schedule'});

    var cfg = require('../configuration.js');
    schedule = cfg.get('schedule_jobs', {});

    if (Object.keys(schedule).length > 0) {
        reloadSchedule();
    }

    setupSunEvents();

    conn.on('addNewJob', function (command) {
        addNewJob.apply(command, command.args);
    });

    conn.on('updateJob', function (command) {
        updateJob.apply(command, command.args);
    });

    conn.on('updateJobItems', function (command) {
        updateJobItems.apply(command, command.args);
    });

    conn.on('removeJob', function (command) {
        removeJob.apply(command, command.args);
    });

    conn.on('getJobs', function (command) {
        getJobs.apply(command, command.args);
    });
};


function addNewJob(name, dateTime, actions, cb)
{
    var id = require('node-uuid').v4();

    var item = {
        name: name,
        dateTime: dateTime,
        actions: actions
    };

    schedule[id] = item;

    save(function () {
        conn.broadcast('jobAdded', item);
        if (cb) cb(id);
    });

    logger.debug('Added new schedule item');
}

function updateJob(id, name, dateTime, cb)
{
    schedule[id].name = name;
    schedule[id].dateTime = dateTime;

    logger.debug('Updated schedule');

    save(cb);
}

function updateJobItems(id, actions, cb)
{
    schedule[id].actions = actions;

    logger.debug('Updated schedule actions');

    save(cb);
}

function getJobs(cb)
{
    var s = hash_to_array(schedule);

    if (cb) cb(s);
}

function removeJob(id, cb)
{
    delete schedule[id];

    logger.debug('Deleted schedule item');

    save(cb);
}

function save(cb)
{
    var cfg = require('../configuration.js');
    cfg.set('schedule_jobs', schedule);

    reloadSchedule(cb);
}

function reloadSchedule(cb)
{
    jobs.forEach(function (j) {
        j.cancel();
    });

    logger.debug('Cleared schedule');

    if (Object.keys(schedule).length === 0) {
        if (cb) cb([]);
        return;
    }

    var scheduler = require('node-schedule');

    var s, valid;

    for (var i in schedule) {

        s = schedule[i];
        valid = true;

        if (s.dateTime === 'sunset' || s.dateTime === 'sunrise') {
            continue;
        }

        var intervals = ['year', 'month', 'day', 'hour', 'minute', 'second'];

        intervals.forEach(function (interval) {

            if (s.dateTime.hasOwnProperty(interval)) {
                s.dateTime[interval] = parseInt(s.dateTime[interval]);
            }
        });

        if (s.dateTime.dayOfWeek) {

            if (Array.isArray(s.dateTime.dayOfWeek)) {

                if (s.dateTime.dayOfWeek.length === 0) {
                    valid = false;
                }

                for (var d = 0; d < s.dateTime.dayOfWeek.length; d++) {
                    if (typeof s.dateTime.dayOfWeek[d] !== 'number') {
                        valid = false;
                        break;
                    }
                }

            } else {
                valid = false;
            }
        }

        if (!valid) {
            logger.error('Invalid schedule', s.name);
            continue;
        }

        var j = scheduler.scheduleJob(s.dateTime, jobRunner(s));

        jobs.push(j);

        logger.debug('Scheduled job');
    }

    if (cb) cb(schedule);
}

function jobRunner(s)
{
    return function () {

        s.actions.forEach(function (jobAction) {

            var command = {
                name: jobAction.emit_name,
                args: jobAction.params
            };

            command.log = function (deviceid, devicename, action) {

                var entry = {
                    user: s.name,
                    id: deviceid,
                    device: devicename,
                    action: action
                };

                conn.send('appendActionLog', entry);
            };

            conn.emit(command.name, command);
        });
    };
}

function setupSunEvents()
{
    var cfg = require('../configuration.js');

    var latitude = cfg.get('latitude', null);
    var longitude = cfg.get('longitude', null);

    if (latitude !== null && longitude !== null) {

        sun = require('iotdb-timers');
        sun.setLogger(logger);

        sun.setLocation(latitude, longitude);

        sun.sunrise(function (event) {
            logger.debug('Sunrise', event);
            sunEvent('sunrise');
        });

        sun.sunset(function (event) {
            logger.debug('Sunset', event);
            sunEvent('sunset');
        });
    }
}

function sunEvent(which)
{
    for (var i in schedule) {

        if (schedule[i].dateTime === which) {
            jobRunner(schedule[i])();
        }
    }
}

function hash_to_array(hash)
{
    var array = [], object;

    for (var key in hash) {

        object = {
            id: key
        };

        for (var key2 in hash[key]) {
            object[key2] = hash[key][key2];
        }

        array.push(object);
    }

    return array;
}
