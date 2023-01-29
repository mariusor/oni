import {css, LitElement} from "lit";

export class ActivitypubObject extends LitElement {
    static styles = css``;
    static properties = {it: {type: Object}};

    constructor() {
        super();
    }

    iri () {
        return this.it.iri != null ? this.it.id : "/";
    }
    type() {
        return this.it.type != null ? this.it.type : "tag";
    }

    render() {
    }
}
