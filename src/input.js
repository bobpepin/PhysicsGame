import {ObjectOfArrays} from "./utils.js"

const InputTypes = {
    CPU: 1,
    POINTER: 2
}

class InputState extends ObjectOfArrays {
    constructor(N) {
        super();
        this.count = 0;
        this.types = new Uint8Array(N);
        this.connected = new Uint8Array(N);
        this.type = new Uint8Array(N);
        this.playerId = new Uint32Array(N);
        this.inputX = new Float32Array(N);
        this.inputY = new Float32Array(N);
        this.action = new Uint8Array(N);
        this.time = 0;
    }
}

class Input {
    constructor() {
        const elt = document.querySelector("#input");
        this.pointerJoystick = new PointerJoystick(elt);
    }
    
    async init(game) {
        this.game = game;
        const N = game.parameters.input.maxControllers;
        this.state = new InputState(N);
        this.nextState = new InputState(N);
        const {cpuControllers, playerControllers} = game.parameters.input;
        for(let i=0; i < playerControllers+cpuControllers; i++) {
            this.state.types[i] = i < playerControllers ? InputTypes.POINTER : InputTypes.CPU;
            this.state.connected[i] = 1;
            this.state.playerId[i] = Math.random() * (2**32-1);
            this.state.inputX[i] = 0;
            this.state.inputY[i] = 0;
        }
        this.state.count = playerControllers + cpuControllers;        
        this.state.time = game.time;
        this.pointerJoystick.init();
    }
    
    async cleanup() {
        this.pointerJoystick.cleanup();
    }
    
    async evolve() {
        const game = this.game;
        this.nextState.set(this.state);
        const dt = game.time - this.state.time;        
        const state = this.nextState;
        state.time = game.time;
        for(let i=0; i < state.count; i++) {
            if(state.types[i] == InputTypes.CPU) {
                if(Math.random() < 1*dt) {
                    state.inputX[i] = 2*(Math.random() - 0.5);
                    state.inputY[i] = 2*(Math.random() - 0.5); 
                }
            } else if(state.types[i] == InputTypes.POINTER) {
                state.inputX[i] = this.pointerJoystick.axes[0];
                state.inputY[i] = this.pointerJoystick.axes[1];
            }
        }
    }

    swapBuffers() {
        const tmp = this.state;
        this.state = this.nextState;
        this.nextState = tmp;
    }    

    async sync() {
        this.swapBuffers();
    }        
}

class PointerJoystick {
    constructor(elt, radius) {
        this.radius = radius || 64;
        this.listeners = {
            mousedown: e => this.handleDown(e),
            mouseup: e => this.handleUp(e),
            mousemove: e => this.handleMove(e),
            touchstart: e => this.handleTouchStart(e),
            touchend: e => this.handleTouchEnd(e),
            touchcancel: e => this.handleTouchEnd(e),
            touchmove: e => this.handleTouchMove(e)
        };
        this.elt = elt;
    }
    
    init() {
        for(const k in this.listeners) {
            this.elt.addEventListener(k, this.listeners[k]);
        }      
        this.canvas = this.elt;
        this.context = this.elt.getContext("2d");
        this.active = false;
        this.tap = false;
        this.moved = false;
        this.startTime = -Infinity;
        this.stopTime = -Infinity;
        this.axes = [0, 0];
        this.lastOffset = [0, 0];
    }
    
    cleanup() {
        for(const k in this.listeners) {
            this.elt.removeEventListener(k, this.listeners[k]);
        }              
    }
    
    handleDown(event) {
        console.log("down", event);
        event.preventDefault();
        event.stopPropagation();
//         this.start(event.offsetX, event.offsetY);
        this.start(event.clientX, event.clientY);
    }
    
    getTouchOffset(event) {
        const touch = event.targetTouches[0];
//        document.querySelector("#logger").innerHTML = `touchoffset`;
        return [touch.clientX, touch.clientY];
    }
                
    handleTouchStart(event) {
//         document.querySelector("#logger").innerHTML = `touchstart`;        
//         console.log("touchstart");
        event.preventDefault();
        event.stopPropagation();
        if(event.changedTouches.length == 0)
            return;
        const [offsetX, offsetY] = this.getTouchOffset(event);
        this.start(offsetX, offsetY);
    }   
    
    start(clientX, clientY) {
//         console.log("start", offsetX, offsetY);
        if(this.active) return;
        this.startTime = performance.now();
        if(this.startTime - this.stopTime > 10) {
            const eltRect = this.canvas.getBoundingClientRect();
            const offsetX = clientX - eltRect.left;
            const offsetY = clientY - eltRect.top;        
            this.origin = [offsetX, offsetY];
            this.lastOffset[0] = offsetX;
            this.lastOffset[1] = offsetY;
            this.moved = false;
        } else {
            this.tap = true;
        }
        this.active = true;
        this.move(clientX, clientY);
    }
    
    handleUp(event) {
        event.preventDefault();
        event.stopPropagation();
        this.stop();
    }
    
    handleTouchEnd(event) {
//         document.querySelector("#logger").innerHTML = `touchend`;        
        event.preventDefault();
        event.stopPropagation();
        if(event.targetTouches.length == 0)
            this.stop();
    }
    
    stop() {
        this.active = false;
        this.axes = [0, 0];
        const {context, canvas} = this;
        context.clearRect(0, 0, canvas.width, canvas.height);        
        this.stopTime = performance.now()
        if(this.stopTime - this.startTime < 1000 && !this.moved) {
            this.tap = true;
        }
    }
    
    handleMove(event) {
        event.preventDefault();
        event.stopPropagation();
        this.move(event.clientX, event.clientY);
    }
    
    handleTouchMove(event) {
//         document.querySelector("#logger").innerHTML = `touchmove`;        
        event.preventDefault();
        event.stopPropagation();
//         if(event.changedTouches.length == 0)
//             return;
        const [offsetX, offsetY] = this.getTouchOffset(event);
//         document.querySelector("#logger").innerHTML = `touchmove (${offsetX},${offsetY})`;        
        this.move(offsetX, offsetY);
    }
    
    move(clientX, clientY) {
        if(!this.active) return;
        const {context, canvas} = this;
        const eltRect = this.canvas.getBoundingClientRect();
        canvas.width = eltRect.width;
        canvas.height = eltRect.height;
        context.clearRect(0, 0, canvas.width, canvas.height);        
        const offsetX = clientX - eltRect.left;
        const offsetY = clientY - eltRect.top; 
        // TODO: Stay on a circle of radius "radius"
        const deltaX = offsetX - this.lastOffset[0];
        const deltaY = offsetY - this.lastOffset[1];
        const [x0, y0] = this.origin;
        const [x, y] = [offsetX, offsetY];
//         document.querySelector("#logger").innerHTML = `(x0,y0) = (${x0}, ${y0}); (x, y) = (${x}, ${y})`;
        this.axes = [x-x0, y0-y].map(a => Math.max(Math.min(a, this.radius), -this.radius)/this.radius);
        if(this.axes[0]**2 + this.axes[1]**2 > 1) {
            this.moved = true;
        }
        context.beginPath();
        context.strokeStyle = "black";
        context.lineWidth = 1;
        context.moveTo(x0, y0);
        context.lineTo(x, y);
        context.stroke();
        context.closePath();
    }
    
    reset() {
        this.tap = false;
    }
}

export {Input}