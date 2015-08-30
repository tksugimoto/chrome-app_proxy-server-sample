
function TreeSetting (settingTree, option) {
	this.settingTree = settingTree;
	// settingTreeにdefaultValue指定の無い設定があった場合のデフォルト値
	this.defaultValue = {
		boolean: false,
		text: "",
		password: "",
		number: 0,
		radio: null
	};
	if (!option) option = {};
	this.storageKey = option.storageKey || "tree-setting";
	this.onElementDisplayChange = option.onElementDisplayChange || function (){};
	
	this.isChromeApp = !!(window.chrome && chrome.app && chrome.app.window);
	this.enabledChromeStorage = !!(window.chrome && chrome.storage && chrome.storage.local);
	
	this.loaded = false;
	this.load();
	
	this.settingInfo = {};
	this.createSettingInfo(settingTree, "");
}

TreeSetting.idPrefix = "ts-";

TreeSetting.prototype.createSettingElement = function (tree, prefix){
	if (!tree) tree = this.settingTree;
	if (!prefix) prefix = "";
	var self = this;
	var createElement = TreeSetting.createElement;
	var container = createElement("ul");
	if (prefix) {
		container.className = "ts-child";
	}
	tree.forEach(function (object){
		var isRadioChild = prefix.slice(-1) === "=";
		var name = object.name;
		var type = object.type || "boolean";
		if (type === "radio") {
			var list = createElement("li", {
				
			}, name, function (){
				container.appendChild(this);
			});
			if (object.radio) {
				var nextPrefix = prefix + object.key + "=";
				var childElement = self.createSettingElement(object.radio, nextPrefix);
				list.appendChild(childElement);
			}
		} else {
			if (isRadioChild) {
				type = "radio";
				var key = prefix.slice(0, -1);
				var value = object.value;
				var checked = self.get(key) === value;
			} else {
				var key = prefix + object.key;
				var value = self.get(key);
				var checked = type === "boolean" ? value : null;
			}
			var input_and_label = settingElement(key, value, name, type, checked);
			var list = createElement("li", {
				
			}, input_and_label, function (){
				container.appendChild(this);
			});
			if (object.child) {
				var nextPrefix = (isRadioChild ? prefix + value : key) + ".";
				var childElement = self.createSettingElement(object.child, nextPrefix);
				childElement.setAttribute("data-ts-key", key);
				if (isRadioChild) childElement.setAttribute("data-ts-radio-value", value);
				list.appendChild(childElement).style.display = checked ? "" : "none";
			}
		}
	});
	return container;
	
	function settingElement(key, value, name, type, checked){
		var separator = " : ";
		if (type === "boolean") {
			var id = TreeSetting.idPrefix + key;
			return [
				createElement("input", {
					type: "checkbox",
					checked: checked,
					id: id,
					style: {
						cursor: "pointer"
					},
					onchange: function (){
						var checked  = this.checked;
						// 変更ごとに保存すると重いかも
						self.set(key, checked);
						// 本当はdisabledにして表示はされているけど編集できない状態にしたい
						var elems = document.querySelectorAll('[data-ts-key="' + key + '"]');
						for (var i= 0, len = elems.length; i < len; i++) {
							elems[i].style.display = checked ? "" : "none";
						}
						self.onElementDisplayChange();
					}
				}),
				createElement("label", {
					innerText: separator + name,
					htmlFor: id,
					style: {
						cursor: "pointer"
					}
				})
			];
		} else if (type === "radio") {
			var id = TreeSetting.idPrefix + key + "=" + value;
			return [
				createElement("input", {
					type: "radio",
					checked: checked,
					value: value,
					id: id,
					name: key,
					style: {
						cursor: "pointer"
					},
					onchange: function (){
						self.set(key, value);
						// 本当はdisabledにして表示はされているけど編集できない状態にしたい
						var elems = document.querySelectorAll('[data-ts-key="' + key + '"]');
						for (var i= 0, len = elems.length; i < len; i++) {
							var elem = elems[i];
							var checked = elem.getAttribute("data-ts-radio-value") === value;
							elem.style.display = checked ? "" : "none";
						}
						self.onElementDisplayChange();
					}
				}),
				createElement("label", {
					innerText: separator + name,
					htmlFor: id,
					style: {
						cursor: "pointer"
					}
				})
			];
		} else if (type === "number") {
			return [
				createElement("input", {
					type: "number",
					value: value,
					title: "Enterで保存",
					onkeyup: function (evt){
						// 数字のみ：Enter押下時のみ保存
						if (evt.keyCode === 13) {
							var value = parseFloat(this.value);
							if (isNaN(value)) value = undefined;
							self.set(key, value);
						}
					}
				}),
				createElement("label", {
					innerText: separator + name
				})
			];
		} else {
			return [
				createElement("input", {
					type: type,
					value: value,
					title: "Enterで保存",
					onkeyup: function (evt){
						// Enter押下時のみ保存
						if (evt.keyCode === 13) self.set(key, this.value);
					}
				}),
				createElement("label", {
					innerText: separator + name
				})
			];
		}
	}
};
TreeSetting.prototype.appendSettingElement = function (parentNode){
	if (this.loaded) {
		parentNode.appendChild(this.createSettingElement());
	} else {
		this.ready(function (){
			parentNode.appendChild(this.createSettingElement());
		});
	}
};

TreeSetting.prototype.createSettingInfo = function (tree, prefix){
	var self = this;
	tree.forEach(function (object){
		self.settingInfo[prefix + object.key] = object;
		if (object.child) {
			self.createSettingInfo(object.child, prefix + object.key + ".");
		}
		if (object.radio) {
			object.radio.forEach(function (radio){
				if (radio.child) {
					var key = object.key + "=" + radio.value;
					self.createSettingInfo(radio.child, prefix + key + ".");
				}
			});
		}
	});
};
TreeSetting.prototype.getAllSettings = function (){
	var settingData = {};
	var self = this;
	Object.keys(this.settingInfo).forEach(function(key){
		settingData[key] = self.get(key);
	});
	return settingData;
};

TreeSetting.prototype.load = function (){
	if (this.isChromeApp) {
		if (this.enabledChromeStorage) {
			var self = this;
			chrome.storage.local.get(this.storageKey, function (data){
				self.settingData = data[self.storageKey] || {};
				self.loaded = true;
				self.runReadyQueue();
			});
		} else {
			throw "storage権限が必要";
		}
	} else {
		this.settingData = JSON.parse(localStorage[this.storageKey] || "{}");
		this.loaded = true;
		this.runReadyQueue();
	}
};
TreeSetting.prototype.ready = function (fn){
	if (this.loaded) {
		fn.call(this);
	} else {
		this.readyQueue = this.readyQueue || [];
		this.readyQueue.push(fn);
	}
};
TreeSetting.prototype.runReadyQueue = function (){
	if (this.readyQueue) {
		this.readyQueue.forEach(function (fn){
			fn.call(this);
		}, this);
	}
};
TreeSetting.prototype.save = function (){
	if (this.isChromeApp) {
		if (this.enabledChromeStorage) {
			var data = {};
			data[this.storageKey] = this.settingData;
			chrome.storage.local.set(data);
		} else {
			throw "storage権限が必要";
		}
	} else {
		localStorage[this.storageKey] = JSON.stringify(this.settingData);
	}
};

TreeSetting.prototype.get = function (key){
	key = key.replace(/ /g, "");
	if (key.match(/^(.*)=([^.]+)$/)) {
		// ラジオボタン設定の場合
		key = RegExp.$1;
		var value = RegExp.$2;
		return this.get(key) === value;
	}
	var value = this.settingData[key];
	if (typeof value !== "undefined") {
		return value;
	} else {
		// setting情報のobjectから
		var info = this.settingInfo[key] || {};
		if (typeof info.defaultValue !== "undefined") {
			return info.defaultValue;
		} else {
			return this.defaultValue[info.type || "boolean"];
		}
	}
};
TreeSetting.prototype.set = function (key, value){
	if (this.settingInfo.hasOwnProperty(key)) {
		this.settingData[key] = value;
		this.save();
		return true;
	} else {
		return false;
	}
};

TreeSetting.createElement = function (elem, attrs, childs, callback){
	if (!elem) return null;
	if (typeof elem === "string") elem = document.createElement(elem);
	if (attrs) {
		Object.keys(attrs).forEach(function (key_attr){
			if (key_attr === "style") {
				var styles = attrs.style;
				Object.keys(styles).forEach(function (key_style){
					elem.style[key_style] = styles[key_style];
				});
			} else if (key_attr === "class") {
				elem.className = attrs.class;
			} else if (key_attr.indexOf("-") !== -1) {
				// data-** etc
				elem.setAttribute(key_attr, attrs[key_attr]);
			} else {
				elem[key_attr] = attrs[key_attr];
			}
		});
	}
	if (typeof childs === "function") {
		callback = childs;
		childs = null;
	}
	if (childs) {
		if (childs instanceof Array) {
			childs.forEach(function (child){
				if (child) {
					if (typeof child === "string") child = document.createTextNode(child);
					elem.appendChild(child);
				}
			});
		} else {
			if (typeof childs === "string") childs = document.createTextNode(childs);
			elem.appendChild(childs);
		}
	}
	if (typeof callback === "function") {
		callback.call(elem);
	}
	return elem;
}