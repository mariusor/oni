//import {makeAutoObservable} from "mobx";

import {makeAutoObservable} from "mobx";

class Auth {
    _authorization = JSON.parse(localStorage.getItem('authorization')) || {}

    get authorization() {
        console.debug("getter authorization")
        return this._authorization;
    }

    set authorization(auth) {
         console.debug("set authorization", auth);
         localStorage.setItem('authorization', JSON.stringify(auth))
     }

    get authorized() {
        return this.authorization.hasOwnProperty('access_token') && this.authorization.hasOwnProperty('token_type') &&
            this.authorization.access_token.length > 0 && this.authorization.token_type.length > 0;
    }

    constructor() {
        makeAutoObservable(this);
    }
}

export let auth = new Auth();
