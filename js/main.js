
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
	var socketId = info.socketId;
	if (isRequestFromServer[socketId]) {
		// サーバー→ブラウザへのレスポンス
		var socketIdToBrowser = socketIdMapServerResponse2Browser[socketId];
		console.debug("サーバー→ブラウザ: ", socketId, "→", socketIdToBrowser);
		chrome.sockets.tcp.send(socketIdToBrowser, info.data, function(info) {
			console.debug("[送信完了] サーバー→ブラウザ: ", socketId, "→", socketIdToBrowser);
		});
	} else {
		// ブラウザ→サーバー
		if (isSslRequestFromBrowser[socketId]) {
			// SSL
			console.debug("SSLブラウザ→サーバー", socketId, sslConnectionSocketIdMap[socketId]);
			chrome.sockets.tcp.send(sslConnectionSocketIdMap[socketId], info.data, function(info) {
				
			});
		} else {
			isRequestFromBrowser[socketId] = true;
			var requestTextArray = arrayBuffer2string(info.data).split(MESSAGE_SEPARATOR);
			var firstLine = requestTextArray[0];
			if (firstLine.match(/^(GET|POST) (http:\/\/([^/]+)(\/[^ ]*)) (.*)$/i)) {
				var method = RegExp.$1;
				var url = RegExp.$2;
				var host = RegExp.$3;
				var path = RegExp.$4;
				var other = RegExp.$5;
				console.log(socketId, "Request: ", url);
				requestTextArray[0] = method + " " + path + " " + other;
				var arrayBuffer = string2arrayBuffer(requestTextArray.join(MESSAGE_SEPARATOR));
				requestToServer(socketId, host, arrayBuffer);
			} else if (firstLine.match(/^CONNECT ([^ ]+) (.*)$/i)) {
				var host = RegExp.$1;
				var other = RegExp.$2;
				console.log(socketId, "SSL CONNECT: ", host);
				connectToServer(socketId, host);
			} else {
				console.warn(socketId, "非対応プロトコル: ", requestTextArray)
			}
		}
	}
});

var NET_ERRORS = {
	SOCKET_NOT_CONNECTED: -15,
	CONNECTION_CLOSED: -100
};
chrome.sockets.tcp.onReceiveError.addListener(function(info) {
	var socketId = info.socketId;
	chrome.sockets.tcp.close(socketId);
	switch (info.resultCode) {
		case NET_ERRORS.SOCKET_NOT_CONNECTED:
		case NET_ERRORS.CONNECTION_CLOSED:
			if (isRequestFromServer[socketId]) {
				// サーバー→ブラウザ
				var socketIdFromBrowser = socketIdMapServerResponse2Browser[socketId];
				console.debug("通信終了（サーバー→ブラウザ）", socketId, socketIdFromBrowser);
				delete isRequestFromServer[socketId];
				delete socketIdMapServerResponse2Browser[socketId];
				
				var serverRequestsInfo = serverRequestsInfoMap[socketIdFromBrowser] || [];
				for (var i = 0, len = serverRequestsInfo.length; i < len; i++) {
					var serverRequestInfo = serverRequestsInfo[i];
					if (serverRequestInfo.socketId === socketId) {
						serverRequestsInfo.splice(i, 1);
						if (len === 1) {
							// TODO: ↓の処理が不完全。メッセージを受信する前にcloseする場合あり
							window.setTimeout(function (){
								if (isRequestFromBrowser[socketId] && serverRequestsInfoMap[socketIdFromBrowser].length === 0) {
									chrome.sockets.tcp.close(socketIdFromBrowser);
									delete isRequestFromBrowser[socketId];
									delete serverRequestsInfoMap[socketIdFromBrowser];
								}
							}, 2000);
						}
						break;
					}
				}
			} else if (isRequestFromBrowser[socketId]) {
				// ブラウザ→サーバー
				delete isRequestFromBrowser[socketId];
				(serverRequestsInfoMap[socketId] || []).forEach(function(serverRequestInfo) {
					chrome.sockets.tcp.close(serverRequestInfo.socketId);
				});
				delete serverRequestsInfoMap[socketId];
				console.debug("通信終了（ブラウザ→サーバー）", socketId);
			} else if (isSslRequestFromBrowser[socketId]) {
				// SSL通信：ブラウザ→サーバー
				console.log("切断：SSL通信：ブラウザ→サーバー");
				delete isSslRequestFromBrowser[socketId];
				delete sslConnectionSocketIdMap[socketId];
			} else {
				// たまに検知できてない通信の切断を検知する
				// console.warn("通信エラー（得体のしれない：たまにsocketIdが飛ぶ）", info);
			}
			break;
		default:
			console.error("通信エラー", info);
	}
});

var isRequestFromBrowser = {};
var isRequestFromServer = {};

var socketIdMapServerResponse2Browser = {};
var serverRequestsInfoMap = {};

function requestToServer(socketIdFromBrowser, host_port, arrayBuffer) {
	var serverRequestsInfo = serverRequestsInfoMap[socketIdFromBrowser] || [];
	for (var i = 0, len = serverRequestsInfo.length; i < len; i++) {
		var serverRequestInfo = serverRequestsInfo[i];
		if (serverRequestInfo.host_port === host_port) {
			var socketId = serverRequestInfo.socketId;
			// すでに同じサーバー宛のブラウザ→サーバー通信が存在する場合
			console.debug("コネクション使い回し", socketIdFromBrowser, "→", socketId);
			chrome.sockets.tcp.send(socketId, arrayBuffer, function(info) {
				console.debug("ブラウザ→サーバー: ", host_port, ": ", socketIdFromBrowser, "→", socketId);
			});
			return;
		}
	}
	// 新規コネクション
	var temp = host_port.split(":");
	var host = temp[0];
	var port = parseInt(temp[1] || 80);
	chrome.sockets.tcp.create(function(createInfo) {
		var socketId = createInfo.socketId;
		isRequestFromServer[socketId] = true;
		socketIdMapServerResponse2Browser[socketId] = socketIdFromBrowser;
		
		if (!serverRequestsInfoMap[socketIdFromBrowser]) serverRequestsInfoMap[socketIdFromBrowser] = [];
		serverRequestsInfoMap[socketIdFromBrowser].push({
			socketId: socketId,
			host_port: host_port
		});
			
		chrome.sockets.tcp.connect(socketId, host, port, function(result) {
			if (result < 0) {
				console.warn("chrome.sockets.tcp.connectエラー: ", result, host, port);
			} else {
				chrome.sockets.tcp.send(socketId, arrayBuffer, function(info) {
					console.debug("ブラウザ→サーバー: ", host_port, ": ", socketIdFromBrowser, "→", socketId);
				});
			}
		});
	});
}

var isSslRequestFromBrowser = {};
var sslConnectionSocketIdMap = {};
function connectToServer(socketIdFromBrowser, host_port) {
	// SSL通信の場合はコネクションを張るだけ
	var temp = host_port.split(":");
	var host = temp[0];
	var port = parseInt(temp[1] || 80);
	chrome.sockets.tcp.create(function(createInfo) {
		var socketId = createInfo.socketId;
		isRequestFromServer[socketId] = true;
		socketIdMapServerResponse2Browser[socketId] = socketIdFromBrowser;
		
		isSslRequestFromBrowser[socketIdFromBrowser] = true;
		sslConnectionSocketIdMap[socketIdFromBrowser] = socketId;
			
		chrome.sockets.tcp.connect(socketId, host, port, function(result) {
			if (result < 0) {
				console.warn("chrome.sockets.tcp.connectエラー: ", result, host, port);
			} else {
				var responseTextArray = ["HTTP/1.1 200 Connection established", "Connection: close", "", ""];
				var arrayBuffer = string2arrayBuffer(responseTextArray.join(MESSAGE_SEPARATOR));
				chrome.sockets.tcp.send(socketIdFromBrowser, arrayBuffer, function(info) {
					console.debug(socketId, "プロキシ→ブラウザ: コネクション確立", host_port);
				});
			}
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

function socketsInfo() {
	chrome.sockets.tcp.getSockets(function (socketsInfo){
		socketsInfo.forEach(function (socketInfo){
			console.log(socketInfo.socketId
			, socketInfo.localAddress + ":" + socketInfo.localPort
			, "→"
			, socketInfo.peerAddress + ":" + socketInfo.peerPort
			, socketInfo);
		});
	});
}
