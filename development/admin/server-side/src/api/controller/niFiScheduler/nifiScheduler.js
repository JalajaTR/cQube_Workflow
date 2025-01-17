const router = require('express').Router();
const { logger } = require('../../lib/logger');
const auth = require('../../middleware/check-auth');
const axios = require('axios');
var schedule = require('node-schedule');
const fs = require('fs');
var shell = require('shelljs');

var filePath = `${process.env.BASE_DIR}/cqube/admin_dashboard/schedulers.json`;

router.get('/getProcessorId', auth.authController, async (req, res) => {
    try {
        logger.info('--- get nifi processor group id api ---')
        let url = `${process.env.NIFI_URL}/process-groups/root`
        let getGroupId = await axios.get(url);
        logger.info('--- get nifi processor group id api response sent ---')
        res.send({ processorId: getGroupId.data.id })
    } catch (e) {
        logger.error(`Error :: ${e}`);
        res.status(500).json({ errMsg: "Internal error. Please try again!!" });
    }
})

router.get('/getProcessorDetails/:id', auth.authController, async (req, res) => {
    try {
        logger.info('--- get nifi processor group details api ---');
        let groupId = req.params.id
        let url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`
        let getGroupDetails = await axios.get(url);
        let names = await axios.get(`${process.env.NIFI_URL}/flow/process-groups/${groupId}`);
        let processorGroups = [];
        names.data.processGroupFlow.flow.processGroups.forEach(item => {
            processorGroups.push(item.status.name);
        })
        var groupObj = []
        processorGroups.forEach(groupName => {
            getGroupDetails.data.processGroupFlow.flow.processGroups.forEach(result => {
                let state
                if (result.runningCount > 0 && (result.stoppedCount == 0 && result.invalidCount == 0)) {
                    state = 'RUNNING';
                } else if (result.runningCount == 0 && (result.stoppedCount > 0 || result.invalidCount > 0)) {
                    state = 'STOPPED';
                } else if (result.runningCount > 0 && (result.stoppedCount > 0 || result.invalidCount > 0)) {
                    state = 'STOPPED'
                }
                if (result.component.name == groupName) {
                    let groupNames = {
                        id: result.id,
                        name: result.component.name,
                        state: state
                    };
                    groupObj.push(groupNames)
                }
            });
        })
        logger.info('--- get nifi processor group details api response sent ---')
        res.send(groupObj)
    } catch (e) {
        logger.error(`Error :: ${e}`);
        res.status(500).json({ errMsg: "Internal error. Please try again!!" });
    }
});

router.post('/scheduleProcessor/:id/:name', auth.authController, async (req, res) => {
    try {
        logger.info('--- schedule processor api ---')
        var schedularData = [];
        var schedulerTime;
        var stopTime;
        var timePeriod = "";

        let groupId = req.params.id;
        let groupName = req.params.name;
        let state = req.body.state
        let day = '*'
        if (req.body.time.day) {
            day = req.body.time.day;
        }
        let month = '*'
        if (req.body.time.month) {
            month = req.body.time.month;
        }
        let date = '*'
        if (req.body.time.date) {
            date = req.body.time.date;
        }
        let hours = parseInt(req.body.time.hours);
        var mins = 0;
        if (req.body.time.minutes) {
            mins = parseInt(req.body.time.minutes);
        }

        let timeToStop = req.body.stopTime

        timeToStop = hours + timeToStop
        if (timeToStop >= 24) {
            timeToStop = timeToStop % 24;
            timeToStop = timeToStop < 0 ? 24 + timeToStop : +timeToStop;
        }

        //::::::::::::::::::::::::::::::::::::::
        if (day != "*") {
            timePeriod = "weekly";
            schedulerTime = `${mins} ${hours} * * ${day}`;
            stopTime = `${mins} ${timeToStop} * * ${day}`;
        } else if (date != "*" && month == "*") {
            timePeriod = "monthly";
            schedulerTime = `${mins} ${hours} ${date} * *`;
            stopTime = `${mins} ${timeToStop} ${date} * *`;
        } else if (date != "*" && month != "*") {
            timePeriod = "yearly";
            schedulerTime = `${mins} ${hours} ${date} ${month} *`;
            stopTime = `${mins} ${timeToStop} ${date} ${month} *`;
        } else {
            timePeriod = "daily";
            schedulerTime = `${mins} ${hours} * * *`;
            stopTime = `${mins} ${timeToStop} * * *`;
        }
        //stopTime = `${mins} ${timeToStop} * * *`;

        var url = '';
        //console.log(schedule.scheduledJobs);
        var job = await schedule.scheduledJobs[groupName + '_start'];
        var stopJob = await schedule.scheduledJobs[groupName + '_stop'];

        if (job != undefined && stopJob != undefined) {
            //console.log('Rescheduling...');
            //console.log(job.cancel(true));
            let obj = {
                groupId: groupId,
                groupName: groupName,
                state: state,
                day: day,
                date: date,
                month: month,
                mins: mins,
                hours: hours,
                timeToStop: timeToStop,
                scheduleUpdatedAt: `${new Date()}`
            }
            await changePermission();
            schedularData = JSON.parse(fs.readFileSync(filePath));
            let foundIndex = schedularData.findIndex(x => x.groupName == obj.groupName);
            schedularData[foundIndex] = obj;
            fs.writeFile(filePath, JSON.stringify(schedularData), function (err) {
                if (err) throw err;
                logger.info('Re-Scheduled RUNNING Job - Updated to file');
            });

            await job.reschedule(schedulerTime/*, async function () {
                var processorsList = await axios.get(`${process.env.NIFI_URL}/process-groups/root/process-groups`);
                processorsList.data.processGroups.map(process => {
                    if (groupName == process.component.name) {
                        groupId = process.component.id;
                    }
                })
                url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`;
                logger.info(`--- ${groupName} - Nifi processor group re-scheduling started ---`);
                let response = await startFun(url, groupId, state);
                logger.info(JSON.stringify(response))
                logger.info(`--- ${groupName} - Nifi processor group re-scheduling completed ---`);
            }*/);
            await stopJob.reschedule(stopTime/*, async function () {
                var processorsList = await axios.get(`${process.env.NIFI_URL}/process-groups/root/process-groups`);
                processorsList.data.processGroups.map(process => {
                    if (groupName == process.component.name) {
                        groupId = process.component.id;
                    }
                })
                url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`;
                logger.info(`--- ${groupName} - Nifi processor group re-scheduling stopping initiated ---`);
                let response = await stopFun(url, groupId);
                await changePermission();
                schedularData = JSON.parse(fs.readFileSync(filePath));
                schedularData.forEach(myJob => {
                    if (myJob.groupName == obj.groupName) {
                        myJob.state = "STOPPED";
                        myJob.scheduleUpdatedAt = `${new Date()}`;
                    }
                });
                fs.writeFile(filePath, JSON.stringify(schedularData), function (err) {
                    if (err) throw err;
                    logger.info('Re-Scheduled Job status changed to STOPPED - has updated to file');
                });
                setTimeout(() => {
                    logger.info(' --- executing nifi restart shell command ----');
                    shell.exec(`sudo ${process.env.BASE_DIR}/cqube/nifi/nifi/bin/nifi.sh restart`, function (code, stdout, stderr) {
                        logger.info('Exit code:', code);
                        logger.info('Program output:', stdout);
                        logger.info('Program stderr:', stderr);
                    });
                }, 120000);
                logger.info(JSON.stringify(response))
                logger.info(`--- ${groupName} - Nifi processor group re-scheduling stopping completed ---`);
            }*/);
        } else {
            let obj = {
                groupId: groupId,
                groupName: groupName,
                state: state,
                day: day,
                date: date,
                month: month,
                mins: mins,
                hours: hours,
                timeToStop: timeToStop,
                scheduleUpdatedAt: `${new Date()}`
            }
            if (fs.existsSync(filePath)) {
                await changePermission();
                schedularData = JSON.parse(fs.readFileSync(filePath));
            }
            let foundIndex = schedularData.findIndex(x => x.groupName == obj.groupName);
            if (foundIndex != -1) {
                schedularData[foundIndex] = obj;
            } else {
                schedularData.push(obj);
            }
            fs.writeFile(filePath, JSON.stringify(schedularData), function (err) {
                if (err) throw err;
                logger.info('Scheduled RUNNING Job - Updated to file');
            });

            await schedule.scheduleJob(groupName + '_start', schedulerTime, async function () {
                var processorsList = await axios.get(`${process.env.NIFI_URL}/process-groups/root/process-groups`);
                processorsList.data.processGroups.map(process => {
                    if (groupName == process.component.name) {
                        groupId = process.component.id;
                    }
                })
                url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`;
                logger.info(`--- ${groupName} - Nifi processor group scheduling started ---`);
                let response = await startFun(url, groupId, state);
                logger.info(JSON.stringify(response))
                logger.info(`--- ${groupName} - Nifi processor group scheduling completed ---`);
            });
            await schedule.scheduleJob(groupName + '_stop', stopTime, async function () {
                var processorsList = await axios.get(`${process.env.NIFI_URL}/process-groups/root/process-groups`);
                processorsList.data.processGroups.map(process => {
                    if (groupName == process.component.name) {
                        groupId = process.component.id;
                    }
                })
                url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`;
                logger.info(`--- ${groupName} - Nifi processor group scheduling stopping initiated ---`);
                let response = await stopFun(url, groupId);
                await changePermission();
                schedularData = JSON.parse(fs.readFileSync(filePath));
                schedularData.forEach(myJob => {
                    if (myJob.groupName == obj.groupName) {
                        myJob.state = "STOPPED";
                        myJob.scheduleUpdatedAt = `${new Date()}`;
                    }
                });
                fs.writeFile(filePath, JSON.stringify(schedularData), function (err) {
                    if (err) throw err;
                    logger.info('Scheduled Job status changed to STOPPED - has updated to file');
                });
                setTimeout(() => {
                    logger.info(' --- executing nifi restart shell command ----');
                    shell.exec(`sudo ${process.env.BASE_DIR}/cqube/nifi/nifi/bin/nifi.sh restart`, function (code, stdout, stderr) {
                        logger.info('Exit code:', code);
                        logger.info('Program output:', stdout);
                        logger.info('Program stderr:', stderr);
                    });
                }, 120000);
                logger.info(JSON.stringify(response))
                logger.info(`--- ${groupName} - Nifi processor group scheduling stopping completed ---`);
            });
        }
        const startFun = (nifiurl, groupid, input_state) => {
            return new Promise(async (resolve, reject) => {
                try {
                    let result = await axios.put(nifiurl, {
                        id: groupid,
                        state: "RUNNING",
                        disconnectedNodeAcknowledged: false
                    });
                    resolve(result.data)
                } catch (e) {
                    reject(e)
                }
            })
        }
        const stopFun = (nifiurl, groupid) => {
            return new Promise(async (resolve, reject) => {
                try {
                    let result = await axios.put(nifiurl, {
                        id: groupid,
                        state: 'STOPPED',
                        disconnectedNodeAcknowledged: false
                    });
                    resolve(result.data)
                } catch (e) {
                    reject(e)
                }
            })
        }
        logger.info('--- schedule processor api response sent ---')
        res.send({ msg: `Job rescheduled successfully at ${hours}: ${mins} ${timePeriod}` })
    } catch (e) {
        logger.error(`Error :: ${e}`);
        res.status(500).json({ errMsg: "Internal error. Please try again!!" });
    }
})

router.post('/scheduleNiFiProcessor/:id/:name', async (req, res) => {
    try {
        logger.info('--- schedule processor api ---')
        var schedularData = [];
        var schedulerTime;
        var stopTime;
        var timePeriod = "";

        let groupId = req.params.id;
        let groupName = req.params.name;
        let state = req.body.state
        let day = '*'
        if (req.body.time.day) {
            day = req.body.time.day;
        }
        let month = '*'
        if (req.body.time.month) {
            month = req.body.time.month;
        }
        let date = '*'
        if (req.body.time.date) {
            date = req.body.time.date;
        }
        let hours = parseInt(req.body.time.hours);
        var mins = 0;
        if (req.body.time.minutes) {
            mins = parseInt(req.body.time.minutes);
        }

        let timeToStop = req.body.stopTime

        timeToStop = hours + timeToStop
        if (timeToStop >= 24) {
            timeToStop = timeToStop % 24;
            timeToStop = timeToStop < 0 ? 24 + timeToStop : +timeToStop;
        }

        //::::::::::::::::::::::::::::::::::::::
        if (day != "*") {
            timePeriod = "weekly";
            schedulerTime = `${mins} ${hours} * * ${day}`;
            stopTime = `${mins} ${timeToStop} * * ${day}`;
        } else if (date != "*" && month == "*") {
            timePeriod = "monthly";
            schedulerTime = `${mins} ${hours} ${date} * *`;
            stopTime = `${mins} ${timeToStop} ${date} * *`;
        } else if (date != "*" && month != "*") {
            timePeriod = "yearly";
            schedulerTime = `${mins} ${hours} ${date} ${month} *`;
            stopTime = `${mins} ${timeToStop} ${date} ${month} *`;
        } else {
            timePeriod = "daily";
            schedulerTime = `${mins} ${hours} * * *`;
            stopTime = `${mins} ${timeToStop} * * *`;
        }
        //stopTime = `${mins} ${timeToStop} * * *`;

        var url = '';
        //console.log(schedule.scheduledJobs);
        var job = await schedule.scheduledJobs[groupName + '_start'];
        var stopJob = await schedule.scheduledJobs[groupName + '_stop'];

        if (job != undefined && stopJob != undefined) {
            //console.log('Rescheduling...');
            //console.log(job.cancel(true));
            let obj = {
                groupId: groupId,
                groupName: groupName,
                state: state,
                day: day,
                date: date,
                month: month,
                mins: mins,
                hours: hours,
                timeToStop: timeToStop,
                scheduleUpdatedAt: `${new Date()}`
            }
            await changePermission();
            schedularData = JSON.parse(fs.readFileSync(filePath));
            let foundIndex = schedularData.findIndex(x => x.groupName == obj.groupName);
            schedularData[foundIndex] = obj;
            fs.writeFile(filePath, JSON.stringify(schedularData), function (err) {
                if (err) throw err;
                logger.info('Re-Scheduled RUNNING Job - Updated to file');
            });

            await job.reschedule(schedulerTime/*, async function () {
                var processorsList = await axios.get(`${process.env.NIFI_URL}/process-groups/root/process-groups`);
                processorsList.data.processGroups.map(process => {
                    if (groupName == process.component.name) {
                        groupId = process.component.id;
                    }
                })
                url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`;
                logger.info(`--- ${groupName} - Nifi processor group re-scheduling started ---`);
                let response = await startFun(url, groupId, state);
                logger.info(JSON.stringify(response))
                logger.info(`--- ${groupName} - Nifi processor group re-scheduling completed ---`);
            }*/);
            await stopJob.reschedule(stopTime/*, async function () {
                var processorsList = await axios.get(`${process.env.NIFI_URL}/process-groups/root/process-groups`);
                processorsList.data.processGroups.map(process => {
                    if (groupName == process.component.name) {
                        groupId = process.component.id;
                    }
                })
                url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`;
                logger.info(`--- ${groupName} - Nifi processor group re-scheduling stopping initiated ---`);
                let response = await stopFun(url, groupId);
                await changePermission();
                schedularData = JSON.parse(fs.readFileSync(filePath));
                schedularData.forEach(myJob => {
                    if (myJob.groupName == obj.groupName) {
                        myJob.state = "STOPPED";
                        myJob.scheduleUpdatedAt = `${new Date()}`;
                    }
                });
                fs.writeFile(filePath, JSON.stringify(schedularData), function (err) {
                    if (err) throw err;
                    logger.info('Re-Scheduled Job status changed to STOPPED - has updated to file');
                });
                setTimeout(() => {
                    logger.info(' --- executing nifi restart shell command ----');
                    shell.exec(`sudo ${process.env.BASE_DIR}/cqube/nifi/nifi/bin/nifi.sh restart`, function (code, stdout, stderr) {
                        logger.info('Exit code:', code);
                        logger.info('Program output:', stdout);
                        logger.info('Program stderr:', stderr);
                    });
                }, 120000);
                logger.info(JSON.stringify(response))
                logger.info(`--- ${groupName} - Nifi processor group re-scheduling stopping completed ---`);
            }*/);
        } else {
            let obj = {
                groupId: groupId,
                groupName: groupName,
                state: state,
                day: day,
                date: date,
                month: month,
                mins: mins,
                hours: hours,
                timeToStop: timeToStop,
                scheduleUpdatedAt: `${new Date()}`
            }
            if (fs.existsSync(filePath)) {
                await changePermission();
                schedularData = JSON.parse(fs.readFileSync(filePath));
            }
            let foundIndex = schedularData.findIndex(x => x.groupName == obj.groupName);
            if (foundIndex != -1) {
                schedularData[foundIndex] = obj;
            } else {
                schedularData.push(obj);
            }
            fs.writeFile(filePath, JSON.stringify(schedularData), function (err) {
                if (err) throw err;
                logger.info('Scheduled RUNNING Job - Updated to file');
            });

            await schedule.scheduleJob(groupName + '_start', schedulerTime, async function () {
                var processorsList = await axios.get(`${process.env.NIFI_URL}/process-groups/root/process-groups`);
                processorsList.data.processGroups.map(process => {
                    if (groupName == process.component.name) {
                        groupId = process.component.id;
                    }
                })
                url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`;
                logger.info(`--- ${groupName} - Nifi processor group scheduling started ---`);
                let response = await startFun(url, groupId, state);
                logger.info(JSON.stringify(response))
                logger.info(`--- ${groupName} - Nifi processor group scheduling completed ---`);
            });
            await schedule.scheduleJob(groupName + '_stop', stopTime, async function () {
                var processorsList = await axios.get(`${process.env.NIFI_URL}/process-groups/root/process-groups`);
                processorsList.data.processGroups.map(process => {
                    if (groupName == process.component.name) {
                        groupId = process.component.id;
                    }
                })
                url = `${process.env.NIFI_URL}/flow/process-groups/${groupId}`;
                logger.info(`--- ${groupName} - Nifi processor group scheduling stopping initiated ---`);
                let response = await stopFun(url, groupId);
                await changePermission();
                schedularData = JSON.parse(fs.readFileSync(filePath));
                schedularData.forEach(myJob => {
                    if (myJob.groupName == obj.groupName) {
                        myJob.state = "STOPPED";
                        myJob.scheduleUpdatedAt = `${new Date()}`;
                    }
                });
                fs.writeFile(filePath, JSON.stringify(schedularData), function (err) {
                    if (err) throw err;
                    logger.info('Scheduled Job status changed to STOPPED - has updated to file');
                });
                setTimeout(() => {
                    logger.info(' --- executing nifi restart shell command ----');
                    shell.exec(`sudo ${process.env.BASE_DIR}/cqube/nifi/nifi/bin/nifi.sh restart`, function (code, stdout, stderr) {
                        logger.info('Exit code:', code);
                        logger.info('Program output:', stdout);
                        logger.info('Program stderr:', stderr);
                    });
                }, 120000);
                logger.info(JSON.stringify(response))
                logger.info(`--- ${groupName} - Nifi processor group scheduling stopping completed ---`);
            });
        }
        const startFun = (nifiurl, groupid, input_state) => {
            return new Promise(async (resolve, reject) => {
                try {
                    let result = await axios.put(nifiurl, {
                        id: groupid,
                        state: "RUNNING",
                        disconnectedNodeAcknowledged: false
                    });
                    resolve(result.data)
                } catch (e) {
                    reject(e)
                }
            })
        }
        const stopFun = (nifiurl, groupid) => {
            return new Promise(async (resolve, reject) => {
                try {
                    let result = await axios.put(nifiurl, {
                        id: groupid,
                        state: 'STOPPED',
                        disconnectedNodeAcknowledged: false
                    });
                    resolve(result.data)
                } catch (e) {
                    reject(e)
                }
            })
        }
        logger.info('--- schedule processor api response sent ---')
        res.send({ msg: `Job rescheduled successfully at ${hours}: ${mins} ${timePeriod}` })
    } catch (e) {
        logger.error(`Error :: ${e}`);
        res.status(500).json({ errMsg: "Internal error. Please try again!!" });
    }
})

const changePermission = async () => {
    try {
        let username = process.env.SYSTEM_USERNAME;
        username = username.replace(/\n/g, '');
        shell.exec(`sudo chown ${username}:${username} ${filePath}`);
        logger.info("File permission change succcessful");
    } catch (error) {
        logger.info(error);
    }
};

module.exports = router;
