startTime = new Date();

function sleep(ms) {
	return new Promise(resolve => setTimeout(resolve, ms));
}

async function update(ms){
	await sleep(ms)
	requestAnimationFrame(update)
}
