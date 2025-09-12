export class AuthController {
    _authorization = {};

    get authorization() {
        this._authorization = JSON.parse(localStorage.getItem('authorization')) || {};
        return this._authorization;
    }

    set authorization(auth) {
        console.debug('setting authorization', auth);
        if (auth === null) {
            localStorage.removeItem('authorization');
            return;
        }
        localStorage.setItem('authorization', JSON.stringify(auth))
    }

    get authorized() {
        return this.authorization.hasOwnProperty('access_token') && this.authorization.hasOwnProperty('token_type') &&
            this.authorization.access_token.length > 0 && this.authorization.token_type.length > 0;
    }

    constructor(host) {
        if (!host) return;
        host.addController(this);
    }

    addHeader(hdrs) {
        if (!hdrs || !(this._authorization.hasOwnProperty('token_type') && this._authorization.hasOwnProperty('access_token'))) {
            return;
        }
        hdrs.Authorization = `${this._authorization.token_type} ${this._authorization.access_token}`;
    }
}
