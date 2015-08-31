var createElement = TreeSetting.createElement;

var treeSetting = new TreeSetting([{
	key: "connection-kill",
	name: "接続を切断する機能"
}, {
	key: "secondary-proxy",
	name: "別のプロキシへ転送",
	child: [{
		key: "host",
		name: "プロキシサーバーのホスト",
		type: "text",
		defaultValue: "127.0.0.1"
	}, {
		key: "port",
		name: "プロキシサーバーのポート",
		type: "number",
		defaultValue: 8080
	}, {
		key: "always-connect-method",
		name: "すべて「CONNECT」でトンネルさせる"
	}]
}]);

treeSetting.ready(function (){
	treeSetting.appendSettingElement(document.getElementById("setting-container"));
	createConnectionKillSettingElement();
});

function createConnectionKillSettingElement() {
	var KEY_SETTING = "connection-kill";
	var elem = createElement("button", {
		"data-ts-key": KEY_SETTING,
		"data-default-text": "切断URLリスト更新（list/connection-kill-url.txt）",
		innerText: "切断URLリスト更新（list/connection-kill-url.txt）",
		onclick: function (){
			loadConnectionKillList(this);
		},
		style: {
			display: treeSetting.get(KEY_SETTING) ? "" : "none",
			marginLeft: "20px",
			cursor: "pointer"
		}
	});
	document.getElementById(TreeSetting.idPrefix + KEY_SETTING).parentNode.appendChild(elem);
}

var connectionKillList = [];
var connectionKillList_regexp = [];
var REGEXP_SPACE_ONLY = /^[\s　]*$/;
function loadConnectionKillList(elem) {
	if (elem) {
		elem.innerText = "更新中";
	}
	var xhr = new XMLHttpRequest();
	xhr.open("GET", "list/connection-kill-url.txt");
	xhr.onload = function() {
		if (xhr.readyState === 4) {
			if (xhr.status === 200) {
				connectionKillList = [];
				connectionKillList_regexp = [];
				
				xhr.responseText.split(/\r*\n/).forEach(function (line){
					if (REGEXP_SPACE_ONLY.test(line)) return;
					if (line.lastIndexOf("#", 0) === 0) return;
					if (line.lastIndexOf("r:", 0) === 0) {
						// 正規表現
						connectionKillList_regexp.push(new RegExp("^" + line.substring(2)));
					} else {
						if (line.lastIndexOf("https://", 0) === 0) {
							line = line.replace(/^(https:\/\/[^/]+).*/, "$1/")
						}
						connectionKillList.push(line);
					}
				});
				if (elem) {
					elem.innerText = "更新完了";
					window.setTimeout(function (){
						elem.innerText = elem.getAttribute("data-default-text");
					}, 2000);
				}
			}
		}
	};
	xhr.send(null);
}
loadConnectionKillList();