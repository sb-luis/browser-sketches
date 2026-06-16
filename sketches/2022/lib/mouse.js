	let mouse = {x: innerWidth * 0.5, y: innerHeight * 0.5};
	let mouseDown = false;
	let mouseUp = false;
	let mouseHeld = false;

	function setMouseDown(){
		mouseHeld = true;
		mouseDown = true;
		requestAnimationFrame(() => mouseDown = false);
	}

	function setMouseUp(){
		mouseHeld = false;
		mouseUp = true;
		requestAnimationFrame(() => mouseUp = false);
	}

	function setMousePos(x, y){
		mouse.x = x;
		mouse.y = y;
	}

	// --- Desktop ---
	window.addEventListener("mousedown", function(e) {
		setMousePos(e.x, e.y);
		setMouseDown();
	});

	window.addEventListener("mousemove", function(e){
		setMousePos(e.x, e.y);
	});

	window.addEventListener("mouseup", setMouseUp);

	// --- Mobile ---
	window.addEventListener("touchstart", function(e) {
		setMousePos(e.targetTouches[0].pageX, e.targetTouches[0].pageY);
		setMouseDown();
	});

	window.addEventListener("touchmove", function(e) {
		setMousePos(e.targetTouches[0].pageX, e.targetTouches[0].pageY);
	});

	window.addEventListener("touchend", setMouseUp);
