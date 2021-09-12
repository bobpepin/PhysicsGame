async function loadSoundData(ctx, url) {
    const response = await fetch(url);
    const data = await response.arrayBuffer();
    return await new Promise((resolve, reject) => {
        ctx.decodeAudioData(data, resolve, reject);
    });
}

class Jukebox {
    constructor(audioContext) {
        this.audioContext = audioContext;
        this.buffers = {};
    }
    
    async load(sources) {
        for(const name in sources) {
            this.buffers[name] = await loadSoundData(
                this.audioContext, sources[name]
            );
        }
    }
    
    play(name) {
        const ctx = this.audioContext;
        const buffer = this.buffers[name];
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(ctx.destination);
//         console.log("play", source, buffer);        
        source.start();
    }
}

export class Audio {
    async init(game) {
        this.game = game;
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        this.audioContext = new AudioContext();
        this.jukebox = new Jukebox(this.audioContext);
        this.state = {};
        const response = await fetch("assets/soundEffects.json")
        const effects = await response.json();
        await this.jukebox.load(effects);
        document.addEventListener("click", e => this.jukebox.play("collision"));
    }
    async evolve() {
        const game = this.game;
        const players = game.players.state;
        for(let i=0; i < players.count; i++) {
            const collided = (players.flags[i] & 2) ? true : false;
            if(collided) {
//                 console.log(`Player ${players.ids[i]} collided.`);
                this.jukebox.play("collision");
            }
        }
    }
    async sync() {}
}