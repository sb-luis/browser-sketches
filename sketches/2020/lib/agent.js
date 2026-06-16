// A simple random walker class dressed as a bubble
class Agent {
    constructor(x, y, r, mode = 'random') {
      this.pos = new Vector(x, y);
      this.dir = new Vector(x, y);
	  this.dirLen = 10;
	  this.drawDir = false;
      this.radius = r;
      this.alpha = 0;
      this.speed = 3;
	  this.mode = mode;
	  this.color = '#000000';
	  this.target = new Vector(window.innerWidth * 0.5, window.innerHeight * 0.5);
    }

	moveLevy(m = 10){
	  // Levy flight algorithm
	  let r = Math.random();
      let x = (Math.random() - 0.5) * 1.5;
      let y = (Math.random() - 0.5) * 1.5;

	  if(r < 0.01){
      	x *= m;
      	y *= m;
	  }

	  this.move(x,y);
	}

    moveRandom() {
      let x = (Math.random() - 0.5) * 1.5;
      let y = (Math.random() - 0.5) * 1.5;
	  this.move(x,y);
    }

	moveTowardsTarget(){
		this.lookTowardsTarget();
		this.move(this.dir.x, this.dir.y);
	}

	lookTowardsTarget(){
	  let newDir = Vector.sub(this.target, this.pos);
	  newDir = Vector.normalize(newDir);
	  this.dir.x = newDir.x;
	  this.dir.y = newDir.y;
	}

    move(dirX, dirY) {
      this.pos.x += dirX * this.speed;
      this.pos.y += dirY * this.speed;
    }

    display() {
      ctx.fillStyle = this.color;
      ctx.strokeStyle = this.color;
      ctx.beginPath();
      ctx.arc(this.pos.x, this.pos.y, this.radius, 0, Math.PI * 2, false); // x, y, radius, startAngle (radians), endAngle (radians), drawCounterClockwise?
      //ctx.stroke();
      ctx.fill();
	  if(this.drawDir){
		  //Draw Direction
		  ctx.beginPath();
		  ctx.moveTo(this.pos.x, this.pos.y);
		  ctx.lineTo(this.pos.x + this.dir.x * this.dirLen, this.pos.y + this.dir.y * this.dirLen);
		  ctx.stroke();
	  }
    }

    update() {
	  //Move agent
	  switch(this.mode){
		case 'random':
			this.moveRandom();
			//this.moveLevy();
			break;
		case 'chase':
	  		this.moveTowardsTarget();
			break;
		default:
			console.log('invalid agent mode')
			this.randomDir();
	  }
	  //Draw agent
      this.display();
    }
  }

