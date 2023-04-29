import {css, html, LitElement, render} from 'lit';
import {Directive, directive} from 'lit/directive.js';

// Positioning library
import {autoPlacement, computePosition, offset, shift} from '@floating-ui/dom';

// Events to turn on/off the tooltip
const enterEvents = ['pointerenter', 'focus'];
const leaveEvents = ['pointerleave', 'blur', 'keydown', 'click'];

export class SimpleTooltip extends LitElement {
    static properties = {
        showing: {reflect: true, type: Boolean}, offset: {type: Number},
    };

    // Lazy creation
    static lazy(target, callback) {
        const createTooltip = () => {
            const tooltip = document.createElement('simple-tooltip');
            callback(tooltip);
            target.parentNode.insertBefore(tooltip, target.nextSibling);
            tooltip.show();
            // We only need to create the tooltip once, so ignore all future events.
            enterEvents.forEach((eventName) => target.removeEventListener(eventName, createTooltip));
        };
        enterEvents.forEach((eventName) => target.addEventListener(eventName, createTooltip));
    }

    static styles = css`
    :host {
      /* Position fixed to help ensure the tooltip is "on top" */
      position: fixed;
      border: 1px solid darkgray;
      background: #ccc;
      padding: 4px;
      border-radius: 4px;
      display: inline-block;
      pointer-events: none;

      /* Animate in */
      opacity: 0;
      transform: scale(0.75);
      transition: opacity, transform;
      transition-duration:  0.33s;
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
        this.showing = false;
        // Position offset
        this.offset = 4;
    }

    connectedCallback() {
        super.connectedCallback();
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
        computePosition(this.target, this, {
            strategy: 'fixed',
            middleware: [offset(this.offset), shift(), autoPlacement({allowedPlacements: ['top', 'bottom']}),],
        }).then(({x, y}) => {
            this.style.left = `${x}px`;
            this.style.top = `${y}px`;
        });
        this.showing = true;
    };

    hide = () => {
        this.showing = false;
    };

    finishHide = () => {
        if (!this.showing) {
            this.style.display = 'none';
        }
    };

    render() {
        return html`<slot></slot>`;
    }
}

class TooltipDirective extends Directive {
    didSetupLazy = false;
    tooltipContent;
    part;
    tooltip;

    render(tooltipContent = '') {
    }

    update(part, [tooltipContent]) {
        this.tooltipContent = tooltipContent;
        this.part = part;
        if (!this.didSetupLazy) {
            this.setupLazy();
        }
        if (this.tooltip) {
            this.renderTooltipContent();
        }
    }

    setupLazy() {
        this.didSetupLazy = true;
        SimpleTooltip.lazy(this.part.element, (tooltip) => {
            this.tooltip = tooltip;
            this.renderTooltipContent();
        });
    }

    renderTooltipContent() {
        render(this.tooltipContent, this.tooltip, this.part.options);
    }
}

export const tooltip = directive(TooltipDirective);