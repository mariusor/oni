import {css, html, LitElement} from 'lit';

// Positioning library
import {autoPlacement, computePosition, flip, inline, offset, shift} from '@floating-ui/dom';

// Events to turn on/off the tooltip
const enterEvents = ['selectionchange', 'click', 'pointerenter'];
const leaveEvents = ['pointerleave'];
// const enterEvents = ['pointerenter', 'focus'];
// const leaveEvents = ['pointerleave', 'blur', 'keydown', 'click'];

export class SimpleTooltip extends LitElement {
    static properties = {
        showing: {reflect: true, type: Boolean},
        offset: {type: Number},
    };

    static styles = css`
    :host {
      /* Position fixed to help ensure the tooltip is "on top" */
      position: fixed;
      padding: 4px;
      border-radius: 4px;
      display: inline-block;
      pointer-events: none;

      /* Animate in */
      opacity: 0;
      transform: scale(0.75);
      transition: opacity, transform;
      transition-duration:  0.33s;
      font-size: 60%;
    }
    :host([showing]) {
      opacity: 1;
      transform: scale(1);
    }
  `;

    constructor() {
        super();
        // Finish hiding at end of animation
        this.addEventListener('transitionend', this.finishHide);
        // Attribute for styling "showing"
        this.showing = true;
        // Position offset
        this.offset = -10;
    }

    connectedCallback() {
        super.connectedCallback();
        console.debug('setting up connected callback', this.previousElementSibling)
        // Setup target if needed
        this.target ??= this.previousElementSibling;
        // Ensure hidden at start
        this.finishHide();
    }

    // Target for which to show tooltip
    _target = null;

    get target() {
        return this._target;
    }

    set target(target) {
        // Remove events from existing target
        if (this.target) {
            enterEvents.forEach((name) => this.target.removeEventListener(name, this.show));
            leaveEvents.forEach((name) => this.target.removeEventListener(name, this.hide));
        }
        if (target) {
            // Add events to new target
            enterEvents.forEach((name) => target.addEventListener(name, this.show));
            leaveEvents.forEach((name) => target.addEventListener(name, this.hide));
        }
        this._target = target;
    }

    show = () => {
        this.style.cssText = '';
        this.showing = true;
        console.debug(`showing tooltip`, this)
    };

    hide = () => {
        setTimeout(() => {
            this.showing = false;
            console.debug(`hiding tooltip`, this)
        }, 2000);
    };

    finishHide = () => {
        if (!this.showing) {
            this.style.display = 'none';
        }
    };

    render() {
        computePosition(this.target, this, {
            placement: "top",
            middleware: [
                inline()
            ],
        }).then(({x, y}) => {
            console.debug(`pos ${x}x${y}y`)
            this.style.left = `${x}px`;
            this.style.top = `${y}px`;
        });
        return html`<slot></slot>`;
    }
}
