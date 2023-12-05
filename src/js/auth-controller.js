export class AuthController {
    _authorization = {};

    static _hosts = [];

    static get hosts() {
        return this._hosts;
    }

    get authorization() {
        console.info("getter authorization")
        this._authorization = JSON.parse(localStorage.getItem('authorization')) || {};
        return this._authorization;
    }

    set authorization(auth) {
        if (auth === null) {
            console.info("unset authorization", auth);
            localStorage.removeItem('authorization');
        }
        console.info("set authorization", auth);
        localStorage.setItem('authorization', JSON.stringify(auth))
        for (const host of AuthController.hosts) {
            host.requestUpdate();
        }
    }

    get authorized() {
        return this.authorization.hasOwnProperty('access_token') && this.authorization.hasOwnProperty('token_type') &&
            this.authorization.access_token.length > 0 && this.authorization.token_type.length > 0;
    }

    constructor(host) {
        host.addController(this);
        AuthController.hosts.push(host);

        // this is a poor man's update on the slot content for the oni-mail oni-natural-language-values name="content"
        const content = host.querySelector('oni-natural-language-values[name=content]');
        if (content !== null) {
            AuthController.hosts.push(content);
        }
    }
}
