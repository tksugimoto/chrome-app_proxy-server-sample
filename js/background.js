chrome.app.runtime.onLaunched.addListener(launch);

function launch() {
	chrome.app.window.create("index.html", {
		id: "-",
		"bounds": {
			"width":  800,
			"height": 600,
			"top":  0,
			"left": 0
		}
	});
}
