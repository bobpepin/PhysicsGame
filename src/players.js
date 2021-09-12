import {ObjectOfArrays} from "./utils.js"

class PlayerState extends ObjectOfArrays {
    constructor(N) {
        super();
        const dim = this.dim = 2;
        this.accelerations = new Float32Array(dim*N);
        this.ids = new Uint32Array(N);
        this.skins = new Uint32Array(N);
        this.flags = new Uint8Array(N); // collision: 1, collided: 2
        this.count = 0;
        this.time = 0;
        this.outgoingNetworkMessages = [];
    }
    
    addPlayer(id) {
        this.count++;        
        const index = this.count-1;
        this.ids[index] = id;
        return index;
    }
}

class Players {
    async init(game) {
        this.game = game;
//         this.availableSkins = await (await fetch("assets/skinList.json")).json();
        const N = game.parameters.maxPlayers;
        this.state = new PlayerState(N);
        this.nextState = new PlayerState(N);        
        this.state.count = 0;
        this.state.time = game.time;
    }
    
    async evolve() {
        const game = this.game;
        this.nextState.set(this.state);
        const state = this.nextState;
        const dim = state.dim;
        const input = game.input.state;
        const physics = game.physics.state;
        state.outgoingNetworkMessages = [];
        for(let k=0; k < input.count; k++) {
            if(!input.connected[k]) continue;
            let i = state.ids.indexOf(input.playerId[k]);
            if(i == -1) {
                i = state.addPlayer(input.playerId[k]);
                state.skins[i] = Math.random() * (2**32-1);
                state.outgoingNetworkMessages.push({
                    type: "newPlayer", 
                    id: input.playerId[k],
                    skin: state.skins[i]
                });
            }
            state.accelerations[dim*i] = input.inputX[k];
            state.accelerations[dim*i+1] = input.inputY[k];
        }
        let newPlayer = false;
        for(const msg of game.network.state.incoming) {
            if(msg.type == "newPlayer") {
                if(state.ids.indexOf(msg.id) != -1) continue;
                const i = state.addPlayer(msg.id);
                state.skins[i] = msg.skin;
                newPlayer = true;
            }
        }
        if(newPlayer) {
            this.broadcastPlayerState();
        }
        for(let i=0; i < state.count; i++) {
            state.flags[i] = 0;
            const id = state.ids[i];
            const k = physics.points.ids.indexOf(id);
            if(k != -1 && physics.collisions[k]) {
                state.flags[i] |= 1;
                if((this.state.flags[i] & 1) == 0) {
                    state.flags[i] |= 2;
                }
            }
        }
    }

    broadcastPlayerState() {
        for(let i=0; i < this.state.count; i++) {
            this.nextState.outgoingNetworkMessages.push({
                type: "newPlayer", 
                id: this.state.ids[i],
                skin: this.state.skins[i]
            });
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

export {Players}