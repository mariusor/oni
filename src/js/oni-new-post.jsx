import {html, css, LitElement} from 'lit';
import {Directive, directive} from 'lit/directive.js';
import {render} from 'lit';

export class NewPost extends LitElement {
	static properties = {}

	// Lazy creation
	static lazy(target, callback) {
		const createModal = () => {
			const modal = document.createElement('oni-new-post');
			callback(modal);
			target.parentNode.insertBefore(modal, target.nextSibling);
			//modal.show();
			// We only need to create the modal once, so ignore all future events.
		};
	}

	render() {
		return html`<dialog>New post</dialog>`;
	}
}

class ModalDirective extends Directive {
	didSetupLazy = false;

	modalContent;
	part;
	modal;

	render(modalContent = '') {}

	update(part, [modalContent]) {
		this.modalContent = modalContent;
		this.part = part;
		if (!this.didSetupLazy) {
			this.setupLazy();
		}
		if (this.modal) {
			this.renderModalContent();
		}
	}

	setupLazy() {
		this.didSetupLazy = true;
		SimpleModal.lazy(this.part.element, (modal) => {
			this.modal = modal;
			this.renderModalContent();
		});
	}

	renderModalContent() {
		render(this.modalContent, this.modal, this.part.options);
	}
}

export const newPostModal = directive(ModalDirective);

