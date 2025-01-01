import {authorization} from "./utils";

export async function fetchActivityPubIRI(iri) {
    let headers = fetchHeaders;
    if (isLocalIRI(iri)) {
        const auth = authorization();
        if (auth.hasOwnProperty('token_type') && auth.hasOwnProperty('access_token')) {
            headers.Authorization = `${auth.token_type} ${auth.access_token}`;
        }
    } else {
        // generate HTTP-signature for the actor
    }
    console.log(`fetching ${isLocalIRI(iri) ? 'local' : 'remote'} IRI ${iri}`);
    const opts = {
        headers: headers,
        cache: 'force-cache',
    };
    const response = await fetch(iri, opts).catch(console.error);
    if (!response) {
        return null
    }
    if (response.status === 200) {
        return await response.json().catch(console.warn);
    }
    response.json().then(console.warn).catch(console.warn);
    return null;
}

const jsonLDContentType = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"';
const fetchHeaders = {Accept: jsonLDContentType};

export function isLocalIRI(iri) {
    if (typeof iri !== 'string') {
        return false;
    }
    return iri.indexOf(window.location.hostname) > 0;
}


