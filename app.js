var express = require('express');
var http = require('http');
var path = require('path');
var serialport = require('serialport');
var events = require('events');
var _ = require('underscore');

var app = express();
var server = http.createServer(app);

app.set('port', process.env.PORT || 3000);
app.use(express.favicon());
app.use(express.logger('dev'));
app.use(express.bodyParser());
app.use(express.methodOverride());
app.use(app.router);
app.use(express.static(path.join(__dirname, "public")));
app.use(express.errorHandler());

var io = require('socket.io').listen(server);
var EventEmitter = events.EventEmitter;
var serialPortConnection = new EventEmitter();

io.sockets.on('connection', function (socket) {
  socket.emit('waiting_for_arduino', "Waiting for Arduino");
  serialPortConnection.on('arduino_connected', function (message) {
    socket.emit('arduino_connected', "Arduino is connected");
  });
  serialPortConnection.on('arduino_disconnected', function (message) {
    socket.emit('arduino_disconnected', "Arduino was disconnected");
  });
  serialPortConnection.on('data', function(data) {
    socket.emit('data', data);
  });
});

(function connectToArduino () {
  serialport.list(function (err, results) {
    if (err) throw err;
    var comPort = _.find(results, function (item) {
      return /Arduino/.test(item.manufacturer) || /Arduino/.test(item.pnpId);
    });
    if (!comPort) {
      console.log("Arduino serial port not connected. Retrying in 1s...");
      setTimeout(connectToArduino, 1000);
    } else {
      console.log("Connecting to serial port", comPort.comName);
      var SerialPort = serialport.SerialPort;
      var port = new SerialPort(comPort.comName, {
        baudrate: 9600,
        parser: serialport.parsers.readline("\n")
      }, false);
      port.open(function (err) {
        if (!err) {
          serialPortConnection.emit('arduino_connected', { port: comPort.comName });
          port.on('data', function (data) {
            serialPortConnection.emit('data', data);
          });
        }
      });
      port.on('close', function () {
        serialPortConnection.emit('arduino_disconnected', { port: comPort.comName });
        setTimeout(connectToArduino, 1000);
      });
    }
  });
}());

server.listen(app.get('port'), function(){
  console.log("Express server listening on port ", app.get('port'));
});
