(function() {
  "use strict";

  angular
    .module('services')
    .service('dataService', ['$q', '$rootScope', 'socket', function($q, $rootScope, socket) {

      // data
      var allDev, allBlacklistedDev, allRemoteBridges, allBridges, allScenes, allSchedules, allCategories, allRemotes, actionLog, serverLog, allRecorings;

      var activeUser, userList;

      // connect to socket via net
      this.socketConnect = function(token, serverId) {
        var deferred = $q.defer();
        socket.connect(token, serverId);
        deferred.resolve();
        return deferred.promise;
      };
      // connect to socket localy
      this.localSocketConnect = function(ip) {
        var deferred = $q.defer();
        socket.connectLocal(ip);
        deferred.resolve();
        return deferred.promise;
      };

      // get data form socket
      this.dataPending = function() {
        var deferred = $q.defer();

        // get reotes
        socket.emit('getCustomRemotes', null, function(customRemotes) {
          allRemotes = {};
          allRemotes.tv = [];
          allRemotes.ac = [];
          allRemotes.multi = [];

          angular.forEach(customRemotes, function(rem) {
            if (rem.type === 'tv') {
              allRemotes.tv.push(rem)
            } else if (rem.type === 'ac') {
              allRemotes.ac.push(rem)
            } else if (rem.type === 'multi') {
              allRemotes.multi.push(rem)
            }
          });
        });
        socket.emit('getCategories', null, function(categories) {
          allCategories = categories;
        });
        // get all devices
        socket.emit('getDevices', null, function(data) {
          allDev = {};
          allBlacklistedDev = [];

          angular.forEach(data, function(dev, index) {
            dev.count = index;
            allDev[dev.type] = allDev[dev.type] || [];
            if (!dev.blacklisted) {
              allDev[dev.type].push(dev);
            } else {
              allBlacklistedDev.push(dev);
            }
          });
          console.log(allDev, allBlacklistedDev);
          deferred.resolve(allDev);
        });
        // get blacklist devices
        // socket.emit('getBlacklist', 'devices', function(blacklistedDev) {
        //   allBlacklistedDev = blacklistedDev;
        // });
        /* get scenes from server */
        socket.emit('getScenes', null, function(scenes) {
          allScenes = scenes;
        });
        /* get schedules */
        socket.emit('getJobs', null, function(schedules) {
          allSchedules = schedules;
        });
        /* get camera recordings */
        socket.emit('getRecordings', null, function(recordings){
          console.log(recordings);
          allRecorings = recordings;
        });

        //check for service worker and implement it
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.register('serviceWorker.js').then(function(reg) {
            console.dir(reg);
            reg.pushManager.subscribe({
              userVisibleOnly: true
            }).then(function(sub) {
              if(sub.endpoint){
                socket.emit('GCMRegister', sub.endpoint.slice(40), function(response){
                  console.log(response);
                })
              }
              console.log(sub);
            })
          }).catch(function(err) {
            console.log('nooo', err);
          })
        }


        socketListeners();
        return deferred.promise;
      };

      var socketListeners = function() {

        /* sensor value change */
        socket.on('sensorValue', function(sensorChange) {
          angular.forEach(allDev, function(dev) {
            if (dev.id === sensorChange.id) {
              dev.value = sensorChange.value;
            }
          });
        });
        socket.on('cameraAdded', function(newCam) {
          console.log(newCam);
          allDev.camera.push(newCam);
          window.navigator.vibrate(250);
        });
        socket.on('cameraDeleted', function(deletedCamId) {
          angular.forEach(allDev.camera, function(cam, index) {
            if (cam.id === deletedCamId) {
              allDev.camera.splice(index, 1);
              window.navigator.vibrate(50);
            }
          });
        });
        socket.on('customRemoteAdded', function(newRemote) {
          newRemote.count = allRemotes[newRemote.type].length;
          allRemotes[newRemote.type].push(newRemote);
          window.navigator.vibrate(250);
        });
        socket.on('customRemoteDeleted', function(remoteID) {
          angular.forEach(allRemotes.tv, function(rem) {
            if (rem.id === remoteID) {
              allRemotes.tv.splice(allRemotes.tv.indexOf(rem), 1);
              window.navigator.vibrate(50);
            }
          });
        });
        socket.on('customRemoteUpdated', function(updateRemote) {
          angular.forEach(allRemotes[updateRemote.type], function(remote) {
            if (remote.id === updateRemote.id) {
              remote = updateRemote;
              window.navigator.vibrate(150);
            };
          });
        });
        socket.on('deviceRenamed', function(devId, devName) {
          angular.forEach(allDev, function(dev) {
            if (dev.id === devId) {
              dev.name = devName;
              window.navigator.vibrate(150);
            }
          });
        });
        /*  scene deleted */
        socket.on('sceneDeleted', function(sceneId) {
          angular.forEach(allScenes, function(scene) {
            if (scene.id === sceneId) {
              allScenes.splice(allScenes.indexOf(scene), 1);
              window.navigator.vibrate(50);
            }
          });
        });
        /* new scene added */
        socket.on('sceneAdded', function(sceneObj) {
          allScenes.push(sceneObj);
          window.navigator.vibrate(250);
        });
        socket.on('jobRemoved', function(scheduleId) {
          angular.forEach(allSchedules, function(schedule) {
            if (schedule.id === scheduleId) {
              allSchedules.splice(allSchedules.indexOf(schedule), 1);
              window.navigator.vibrate(50);
            }
          });
        });
        /* schedule added */
        socket.on('jobAdded', function(scheduleObj) {
          allSchedules.push(scheduleObj);
          window.navigator.vibrate(250);
        });

        socket.on('deviceBlacklisted', function(devType, devId) {
          angular.forEach(allDev, function(devArr) {
            angular.forEach(devArr, function(dev, index) {
              if (dev.id === devId) {
                devArr.splice(index, 1);
                allBlacklistedDev.push(dev);
                window.navigator.vibrate(75);
              }
            })
          });
        });

        socket.on('deviceUnblacklisted', function(devType, devId) {
          console.log(devType, devId);
          angular.forEach(allBlacklistedDev, function(dev, index) {
            if (dev.id === devId) {
              allBlacklistedDev.splice(index, 1);
              allDev[dev.type].push(dev);
              window.navigator.vibrate(150);
            }
          });
        });

        /* listen for bridge updates */
        // socket.on('bridgeInfo', function(bridge) {
        //   console.log(bridge);
        //   bridges.push(bridge);
        // });

        /* listen for server log updates */
        socket.on('log', function(newLog) {
          serverLog.unshift(newLog)
        });

        serverSettingsData();
      };

      var serverSettingsData = function() {

        /* get uset profile, LEVEL */
        socket.emit('getUserProfile', null, function(user) {
          console.log(user);
          activeUser = user;
        });
        /* get bridges */
        socket.emit('getBridges', null, function(bridges) {
          allBridges = bridges || [];
        });
        // get remote bridges
        socket.emit('getRemotes', null, function(remoteBridges) {
          allRemoteBridges = remoteBridges;
          allBridges = allBridges.concat(remoteBridges);
        });
        /* get full list of users */
        socket.emit('permServerGet', null, function(allUsers) {
          userList = allUsers;
        });
        /* get activity log, listen for updates */
        socket.emit('getActionLog', null, function(log) {
          actionLog = log.reverse();
        });
        /* get server log */
        socket.emit('getLog', null, function(log) {
          serverLog = log.reverse();
        });
      };

      /* return devices */
      this.allDev = function() {
        return allDev;
      };
      this.allBlacklistedDev = function() {
        return allBlacklistedDev;
      };
      this.allCustomRemotes = function() {
        return allRemotes;
      };
      this.bridges = function() {
        return allRemoteBridges;
      };
      this.scenes = function() {
        return allScenes;
      };
      this.schedules = function() {
        return allSchedules;
      };
      this.recordings = function(){
        return allRecorings;
      };
      /* server status */
      this.user = function() {
        return activeUser
      };
      this.bridge = function() {
        return allBridges;
      };
      this.userList = function() {
        return userList;
      };
      this.getLog = function() {
        return serverLog;
      };
      this.getActionLog = function() {
        return actionLog;
      };
      /* categories stuff */
      this.categories = function() {
        return allCategories;
      };

      // helper functions
      this.sortDevicesByType = function(devArr, type) {
        var arr = [];
        angular.forEach(devArr, function(dev) {
          if (dev.type === type) {
            arr.push(dev);
          }
        });
        return arr;
      };

      this.sortRemotesByType = function(remotesArr, type) {
        var arr = [];
        angular.forEach(remotesArr, function(remote) {
          if (remote.type === type) {
            arr.push(remote);
          }
        });
        return arr;
      };

      this.blobToImage = function(imageData) {
        if (Blob && 'undefined' != typeof URL) {
          var blob = new Blob([imageData], {
            type: 'image/jpeg'
          });
          return URL.createObjectURL(blob);
        } else if (imageData.base64) {
          return 'data:image/jpeg;base64,' + imageData.data;
        } else {
          return 'about:blank';
        }
      };

      this.fullScreen = function(element) {
        if (element.requestFullscreen) {
          element.requestFullscreen();
        } else if (element.mozRequestFullScreen) {
          element.mozRequestFullScreen();
        } else if (element.webkitRequestFullscreen) {
          element.webkitRequestFullscreen();
        } else if (element.msRequestFullscreen) {
          element.msRequestFullscreen();
        }
      };
    }]);
}());
