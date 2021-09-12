class ObjectOfArrays {
    set(source) {
        for(const k in this) {
            if(typeof this[k] === 'object' && this[k] !== null) {
                if(this[k].set !== undefined) {
                    this[k].set(source[k]);
                } else {
                    for(let i=0; i < this[k].length; i++) {
                        this[k][i] = source[k][i];
                    }
                }
            } else {
                this[k] = source[k];
            }
        }
    }
}

const keyProperty = Symbol();

class ObjectOfArrays1 {
    constructor(data) {
        this[keyProperty] = Object.keys(data);
        Object.assign(this, data);
    }

    slice(start, end) {
        const r = {};
        for(const k of this[keyProperty]) {
            r[k] = this[k].slice(start, end);
        }
        return new ObjectOfArrays(r);
    }
    
    set(source) {
        for(const k of this[keyProperty]) {
            this[k].set(source[k]);
        }
    }
}

export {ObjectOfArrays}