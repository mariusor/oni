'use strict';

this.Element && function (a) {
    a.matchesSelector = a.matchesSelector || a.mozMatchesSelector || a.msMatchesSelector || a.oMatchesSelector || a.webkitMatchesSelector || function (b) {
        let c = this, e = (c.parentNode || c.document).querySelectorAll(b), f = -1;
        for (; e[++f] && e[f] != c;) ;
        return !!e[f]
    }, a.matches = a.matches || a.matchesSelector
}(Element.prototype);
this.Element && function (a) {
    a.closest = a.closest || function (b) {
        let c = this;
        for (; c.matches && !c.matches(b);) c = c.parentNode;
        return c.matches ? c : null
    }
}(Element.prototype);
let addEvent = function (a, b, c) {
    a.attachEvent ? a.attachEvent('on' + b, c) : a.addEventListener(b, c)
};
let removeEvent = function (a, b, c) {
    a.detachEvent ? a.detachEvent('on' + b, c) : a.removeEventListener(b, c)
};
let OnReady = function (a) {
    'loading' == document.readyState ? document.addEventListener && document.addEventListener('DOMContentLoaded', a) : a.call()
};
let $ = function (a, b) {
    return (b || document).querySelectorAll(a)
};
let $frag = function (html) {
    let frag = document.createDocumentFragment();
    let tmp = document.createElement('body');
    let child;

    tmp.innerHTML = html;
    while (child = tmp.firstChild) {
        frag.appendChild(child);
    }
    return frag;
};

OnReady(function() {
    const $html = $("html")[0];
    const $body = $html.lastChild;

    function showErrors(object) {
        const errors = document.createElement('div');
        const err = (err) => {
            const error = document.createElement('p');
            error.textContent = `${err.status}: ${err.message}`;
            errors.appendChild(error);
        }
        if (Array.isArray(object.errors)) {
            object.errors.forEach(err);
        } else {
            err(object.errors);
        }
        $body.appendChild(errors);
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

        let details = document.createElement('article');
        details.className = 'details';
        if (typeof it.image != 'undefined') {
            let imageSrc;
            if (typeof it.image == 'object') {
                imageSrc = it.image.url;
            }
            if (typeof it.image == 'string') {
                imageSrc = it.image;
            }
            details.style.backgroundImage = `linear-gradient(rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 1)), url(${imageSrc})`;
            const img = document.createElement('img');
            img.src = imageSrc;
            console.debug(getAverageImageRGB(img));
        }

        if (typeof it.icon != 'undefined') {
            let iconSrc;
            if (typeof it.icon == 'object') {
                iconSrc = it.icon.url;
            }
            if (typeof it.icon == 'string') {
                iconSrc = it.icon;
            }
            const icon = imgFromUrl(iconSrc);
            icon.className = "icon";
            details.appendChild(icon);
        }

        if (typeof it.preferredUsername != 'undefined') {
            const nameElement = document.createElement('h2');
            nameElement.textContent = it.preferredUsername;
            details.appendChild(nameElement);

            $html.querySelector("title").textContent += `: ${it.preferredUsername}`;
        }

        if (typeof it.summary != 'undefined') {
            const summaryElement = document.createElement('span');
            summaryElement.append($frag(it.summary));
            details.appendChild(summaryElement);
        }

        if (typeof it.url != 'undefined') {
            let aliasBox = document.createElement('div');

            if (Array.isArray(it.url)) {
                let aliases = document.createElement('ul');
                aliases.style.display = 'inline';
                it.url.forEach((url) => {
                    let alias = document.createElement('li');
                    let link = document.createElement('a');
                    link.textContent = url
                    link.href = url;
                    link.style.display = 'inline';
                    alias.appendChild(link);
                    aliases.appendChild(alias);
                });
                aliasBox.appendChild(aliases);
            } else {
                let alias = document.createElement('a');
                alias.href = it.url;
                aliasBox.appendChild(alias);
            }
            details.appendChild(aliasBox);
        }
        object.appendChild(details);

        if (typeof it.content != 'undefined') {
            const contentElement = document.createElement('article');
            contentElement.className = "content";
            contentElement.append($frag(it.content));
            object.appendChild(contentElement);
        }

        const collectionsBox = document.createElement('div');
        const collectionsElement = document.createElement('ul');
        if (typeof it.inbox != 'undefined') {
            // TODO(marius): this needs to be shown only when authenticated as the Actor
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
        if (typeof it.followers != 'undefined') {
            const followersLinkElement = document.createElement('a');
            followersLinkElement.href = it.followers;
            followersLinkElement.textContent = "Followers";

            const followersElement = document.createElement('li');
            followersElement.appendChild(followersLinkElement)

            collectionsElement.appendChild(followersElement);
        }
        if (typeof it.following != 'undefined') {
            const followingLinkElement = document.createElement('a');
            followingLinkElement.href = it.following;
            followingLinkElement.textContent = "Following";

            const followingElement = document.createElement('li');
            followingElement.appendChild(followingLinkElement)

            collectionsElement.appendChild(followingElement);
        }
        if (collectionsElement.hasChildNodes()) {
            collectionsBox.appendChild(collectionsElement);
            details.appendChild(collectionsBox);
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
});
