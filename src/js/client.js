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
    console.log(`fetching ${isLocalIRI(iri) ? 'local' : 'remote'} IRI ${iri}`)
    const response = await fetch(iri, {headers: headers, mode: 'no-cors'}).catch(console.error);
    if (response.status === 200) {
        const it =  await response.json();
        return it;
    }
    response.json().then(console.warn).catch(console.warn);
    return null;
}

const fetchHeaders = {Accept: 'application/activity+json;' /*, 'Cache-Control': 'no-store'*/};

export function isLocalIRI(iri) {
    if (typeof iri !== 'string') {
        return false;
    }
    return iri.indexOf(window.location.hostname) > 0;
}


