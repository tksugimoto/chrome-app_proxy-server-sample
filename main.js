
var tcpServerSocketId;
var host = "127.0.0.1";
var port = 80;
var MESSAGE_SEPARATOR = "\r\n";

chrome.sockets.tcpServer.create(function(createInfo) {
	console.log("chrome.sockets.tcpServer.create", createInfo);
	tcpServerSocketId = createInfo.socketId;

	chrome.sockets.tcpServer.listen(tcpServerSocketId, host, port, function(result) {
		console.log("chrome.sockets.tcpServer.listen", result);
	});
});

chrome.sockets.tcpServer.onAccept.addListener(function(info) {
	if (info.socketId === tcpServerSocketId) {
		var paused = false;
		chrome.sockets.tcp.setPaused(info.clientSocketId, paused);
	}
});

chrome.sockets.tcp.onReceive.addListener(function(info) {
	var clientSocketId = info.socketId;
	var socketIdFromServer = serverResponse[clientSocketId];
	if (typeof socketIdFromServer !== "undefined") {
		// サーバー→ブラウザへのレスポンス
		chrome.sockets.tcp.send(socketIdFromServer, info.data, function(info) {
			
		});
	} else {
		// ブラウザ→サーバー
		var requestTextArray = arrayBuffer2string(info.data).split(MESSAGE_SEPARATOR);
		var firstLine = requestTextArray[0];
		if (firstLine.match(/^(GET|POST) (http:\/\/([^/]+)(\/[^ ]+)) (.*)$/i)) {
			var method = RegExp.$1;
			var url = RegExp.$2;
			var host = RegExp.$3;
			var path = RegExp.$4;
			var other = RegExp.$5;
			console.log(clientSocketId, "Request: ", url);
			requestTextArray[0] = method + " " + path + " " + other;
			var arrayBuffer = string2arrayBuffer(requestTextArray.join(MESSAGE_SEPARATOR));
			createNewConnect(clientSocketId, host, arrayBuffer);
		} else if (firstLine.match(/^CONNECT ([^ ]+) (.*)$/i)) {
			var host = RegExp.$1;
			var other = RegExp.$2;
			console.log("SSL CONNECT: ", host)
		} else {
			console.warn("非対応プロトコル: ", requestTextArray)
		}
	}
});

var serverResponse = {};

function createNewConnect(socketIdFromBrowser, host, arrayBuffer) {
	var temp = host.split(":");
	hots = temp[0];
	var port = parseInt(temp[1] || 80);
	chrome.sockets.tcp.create(function(createInfo) {
		var clientSocketId = createInfo.socketId;
		serverResponse[clientSocketId] = socketIdFromBrowser;
		chrome.sockets.tcp.connect(clientSocketId, host, port, function(result) {
			chrome.sockets.tcp.send(clientSocketId, arrayBuffer, function(info) {
				console.debug(host, ": ", socketIdFromBrowser, "→", clientSocketId);
			});
		});
	});
}


function string2arrayBuffer(string) {
	return new TextEncoder("utf-8").encode(string).buffer;
}

function arrayBuffer2string(arrayBuffer) {
	var uint8Array = new Uint8Array(arrayBuffer);
	return new TextDecoder("utf-8").decode(uint8Array);
}