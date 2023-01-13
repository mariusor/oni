'use strict';

(function() {
    const $html = document.getRootNode().lastChild;
    const $body = $html.lastChild;

    const defaultBackground = $body.style.backgroundColor;

    function showErrors(object) {
        const errors = document.createElement('div');
        const err = (err) => {
            const error = document.createElement('p');
            error.textContent = `${err.status}: ${err.message}`;
            errors.appendChild(error);
        }
        if (typeof object.errors == 'object') {
            err(object.errors);
        } else if (typeof object.errors == 'array') {
            object.errors.forEach(err);
        }
        document.getElementById('main').appendChild(errors);
    }

    function rgb(r, g, b) {
        return `rgb(${r}, ${g}, ${b})`;
    }

    function imgFromUrl(url) {
        const img = document.createElement('img');
        img.src = url;
        return img
    }

    function buildPerson(it) {
        const object = document.createElement('main');
        if (typeof it.type != 'undefined') {
            object.className = it.type.toLowerCase();
        }

        if (typeof it.image != 'undefined') {
            if (typeof it.image == 'object') {
                object.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255255, 255, 0.3)), url(${it.image.url})`;
            }
            if (typeof it.image == 'string') {
                object.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.3), rgba(255, 255255, 255, 0.3)), url(${it.image})`;
            }
        }

        if (typeof it.icon != 'undefined') {
            if (typeof it.icon == 'object') {
                object.appendChild(imgFromUrl(it.icon.url));
            }
            if (typeof it.icon == 'string') {
                object.appendChild(imgFromUrl(it.icon));
            }
        }

        if (typeof it.preferredUsername != 'undefined') {
            const nameElement = document.createElement('h2');
            nameElement.textContent = it.preferredUsername;
            object.appendChild(nameElement);
        }

        if (typeof it.summary != 'undefined') {
            const summaryElement = document.createElement('span');
            summaryElement.textContent = it.summary;
            object.appendChild(summaryElement);
        }

        if (typeof it.content != 'undefined') {
            const contentElement = document.createElement('span');
            contentElement.textContent = it.content;
            object.appendChild(contentElement);
        }

        const collectionsElement = document.createElement('ul');

        if (typeof it.inbox != 'undefined') {
            const inboxLinkElement = document.createElement('a');
            inboxLinkElement.href = it.inbox;
            inboxLinkElement.textContent = "Inbox";

            const inboxElement = document.createElement('li');
            inboxElement.appendChild(inboxLinkElement)

            collectionsElement.appendChild(inboxElement);
        }

        if (typeof it.outbox != 'undefined') {
            const outboxLinkElement = document.createElement('a');
            outboxLinkElement.href = it.outbox;
            outboxLinkElement.textContent = "Outbox";

            const outboxElement = document.createElement('li');
            outboxElement.appendChild(outboxLinkElement)

            collectionsElement.appendChild(outboxElement);
        }
        if (collectionsElement.hasChildNodes()) {
            object.appendChild(collectionsElement);
        }
        return object;
    }

    function buildCollection(it) {
        let tag = 'ul';
        let items;
        if (it.type == 'OrderedCollection' || it.type == 'OrderedCollectionPage') {
            tag = 'ol';
            items = it.orderedItems;
        } else {
            items = it.items;
        }
        const object = document.createElement(tag);
        items.forEach(function (it, index) {
            const itLinkElement = document.createElement('a');
            itLinkElement.href = it.id;
            itLinkElement.textContent = it.id;

            const el = document.createElement('li');
            el.appendChild(itLinkElement)

            object.appendChild(el);
        });
        return object;
    }

    function buildObject(it) {
        const object = document.createElement('main');
        object.textContent = it.type;
        return object;
    }

    function buildActivityPubElement(it) {
        console.log(it);

        switch (it.type) {
            case 'Person':
                return buildPerson(it)
            case 'OrderedCollection', 'OrderedCollectionPage':
                return buildCollection(it)
            default:
                return buildObject(it);
        }
    }

    function renderActivityPubObject(object) {
        $body.appendChild(buildActivityPubElement(object));
    }

    const headers = {'Accept': 'application/activity+json'};

    fetch(window.location.href, { headers })
        .then((response) => {
            if (!response.ok) {
                response.json().then(showErrors).catch(console.error);
                return;
            }
            response.json().then(renderActivityPubObject);
        })
        .catch( console.error );
})();
