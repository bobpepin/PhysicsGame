import {ObjectOfArrays} from "./utils.js"

function loadImage(url) {
    const img = new Image();
    img.src = url;
    return new Promise((resolve, reject) => {
        img.onload = (() => resolve(img));
    });
}

class DisplayState extends ObjectOfArrays {
    constructor(N) {
        super();
        const dim = this.dim = 2;
        this.positions = new Float32Array(dim*N);
        this.skins = new Uint32Array(N);
        this.count = 0;
    }
}

class Display {
    async init(game) {
        this.game = game;
        const parameters = this.parameters = game.parameters;
        this.canvas = document.querySelector("#game-canvas");
        this.ctx = this.canvas.getContext("2d");
        const N = parameters.physics.maxPoints;
        this.state = new DisplayState(N);
        this.nextState = new DisplayState(N);
        const response = await fetch("assets/skinList.json")
        this.availableSkins = await response.json();
        this.skinImages = {};
    }
    
    async evolve() {
        const game = this.game;
        const physics = game.physics.state;
        const players = game.players.state;        
        this.nextState.set(this.state);
        this.nextState.count = players.count;        
        for(let i=0; i < players.count; i++) {
            const k = players.skins[i] % this.availableSkins.length;
            if(!this.skinImages[k]) {
                this.skinImages[k] = await loadImage(this.availableSkins[k]);
            }
            this.nextState.skins[i] = k;
        }
        for(let i=0; i < players.count; i++) {
            const id = players.ids[i];
            physics.getPlayerPosition(id, this.nextState.positions, 2*i);
        }
    }
    
    swapBuffers() {
        const tmp = this.state;
        this.state = this.nextState;
        this.nextState = tmp;
    }
    
    async sync() {
        this.swapBuffers();
        const w = this.canvas.width = this.canvas.width;
        const h = this.canvas.height;
        const positions = this.state.positions;
        const spriteRow = 1;
        const spriteCol = 1;
        const res = 32;
        const xOffset = -res / 2;
        const yOffset = -res / 2;        
        for(let i=0; i < this.state.count; i++) {
            const x = xOffset + w/2 + positions[2*i] * w/2;
            const y = h + yOffset - (h/2 - positions[2*i+1] * h/2);
            this.ctx.drawImage(
                this.skinImages[this.state.skins[i]], 
                spriteCol*res, spriteRow*res, res, res,
                x, y, res, res);
        }
    }
}

export {Display}