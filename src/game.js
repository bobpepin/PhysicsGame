import {Display} from "./display-webgl.js"
import {PhysicsDisplay} from "./display-physics-pbd.js"
// import {Display} from "./display-canvas.js"
import {Audio} from "./audio.js"
import {Physics} from "./physics-pbd.js"
import {Players} from "./players.js"
import {Input} from "./input.js"
import {Network} from "./network.js"

export async function run() {
    const parameters = {
        display: {
            pointImage: "assets/Point.png"
        },
        input: {
            maxControllers: 8,
            cpuControllers: 0,
            playerControllers: 1
        },
        physics: {
            maxPoints: 1024,
            gamma: 5,
            acceleration: 10,
            playerRadius: 0.2
        },
        maxPlayers: 16
    }
    while(true) {
        const game = new Game(parameters);
        await game.run();
    }
}

function waitForAnimationFrame() {
    return new Promise((resolve, reject) => requestAnimationFrame(time => resolve(time)));
}

class Game {
    constructor(parameters) {
        this.parameters = parameters;
        this.systems = {
            display: new Display(),
            physicsDisplay: new PhysicsDisplay(),
            audio: new Audio(),
            physics: new Physics(),
            players: new Players(),
            input: new Input(),
            network: new Network()
        }
        Object.assign(this, this.systems);
        this.time = null;
    }
    
    async run() {
        this.time = await waitForAnimationFrame() / 1000;
        for(const k in this.systems) {
            await this.systems[k].init(this);
        }
        while(true) {
            this.time = await waitForAnimationFrame() / 1000;            
            for(const k in this.systems) {
                await this.systems[k].evolve(this)
            }
            for(const k in this.systems) {
                await this.systems[k].sync()
            }
        }
    }
}