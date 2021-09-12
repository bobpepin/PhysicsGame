class Network {
    async init(game) {
        this.game = game;
        const hostname = document.location.hostname;
        this.state = { incoming:  [] };
        this.nextState = { incoming: [] };
        this.outgoing = [];
        try {
            this.websocket = new WebSocket(`ws://${hostname}:8080`);
            this.websocket.onmessage = async (event) => {
                let text;
                try {
                    text = await event.data.text();
                } catch(e) {
                    text = event.data;
                }
//                 console.log("Received network message", text);
                const msg = JSON.parse(text);
                this.nextState.incoming.push(msg);
            }
        } catch (e) {
            console.error("Websocket connection failed:", `ws://${hostname}:8080`, e);
        }
    }
    
    async evolve() {
        for(const k in this.game.systems) {
            const messages = this.game.systems[k].state.outgoingNetworkMessages;
            if(messages) {
                this.outgoing.push(...messages);
            }
        }
    }
    
    swapBuffers() {
        const tmp = this.state;
        this.state = this.nextState;
        this.nextState = tmp;
    }

    async sync() {
        this.state.incoming = [];
        this.swapBuffers();
        if(this.websocket.readyState != 1) return;        
        for(const msg of this.outgoing) {
            const text = JSON.stringify(msg);
//             console.log("Sent network message", text);                  
            this.websocket.send(text);
        }
        this.outgoing = [];
    }
}

export {Network}