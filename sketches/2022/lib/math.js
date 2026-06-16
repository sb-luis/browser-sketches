// A simple 2D Vector class
class Vector{
    constructor(x = 1,y = 1){
      this.x = x;
      this.y = y;
    }

    //Pseudo-properties
    get length(){
      return Math.sqrt(this.x * this.x + this.y * this.y);
    }

    //Instance Methods
    add(other){
      try{
        this.x += other.x;
        this.y += other.y;
	  	return this;
      }
      catch(err){
        console.log(err);
      }
    }

    sub(other){
      try{
        this.x -= other.x;
        this.y -= other.y;
	  	return this;
      }
      catch(err){
        console.log(err);
      }
    }

    mult(scalar){
      this.x *= scalar;
      this.y *= scalar;
	  return this;
    }

    div(scalar){
      this.x /= scalar;
      this.y /= scalar;
	  return this;
    }

    normalize(){
	  const len = this.length;
      this.x /= len;
      this.y /= len;
	  return this;
    }

    //Static Methods
    static add(v1, v2){
	  return new Vector(v1.x + v2.x, v1.y + v2.y);
    }

    static sub(v1, v2){
      return new Vector(v1.x - v2.x, v1.y - v2.y);
    }

    static mult(v1, scalar){
      return new Vector(v1.x * scalar, v1.y * scalar);
    }

    static div(v1, scalar){
      return new Vector(v1.x / scalar, v1.y / scalar);
    }

    static dot(v1, v2){
      return v1.x * v2.x + v1.y * v2.y;
    }

    static normalize(v1){
      return new Vector(v1.x / v1.length, v1.y / v1.length);
    }
  }

