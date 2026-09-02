/*
 Copyright (C) 2017, 2021, 2026 3NSoft Inc.
 
 This program is free software: you can redistribute it and/or modify it under
 the terms of the GNU General Public License as published by the Free Software
 Foundation, either version 3 of the License, or (at your option) any later
 version.
 
 This program is distributed in the hope that it will be useful, but
 WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 See the GNU General Public License for more details.
 
 You should have received a copy of the GNU General Public License along with
 this program. If not, see <http://www.gnu.org/licenses/>.
*/

import { NODATA, NOTFOUND, CONNREFUSED, SERVFAIL, TIMEOUT, DnsResolver } from 'core-3nweb-client-lib/build/lib-client/service-locator';
import { makeRuntimeException } from '../../../lib-common/exceptions/runtime';
import { Logging } from '../../../inject-defs/confs';

export interface AppLocException extends web3n.RuntimeException {
	type: 'app-locating';
	appDomain: string;
	domainNotFound?: true;
	noAppRecord?: true;
}

function domainNotFoundExc(appDomain: string): AppLocException {
	const exc: AppLocException = {
		runtimeException: true,
		type: 'app-locating',
		appDomain,
		domainNotFound: true
	};
	return exc;
}

function noAppRecordExc(appDomain: string): AppLocException {
	const exc: AppLocException = {
		runtimeException: true,
		type: 'app-locating',
		appDomain,
		noAppRecord: true
	};
	return exc;
}

/**
 * This implementation extracts exactly one string value for a given service.
 * All other values are ignored, without raising error about misconfiguration.
 * In time we may have several records for the same service type, yet, for now
 * only one TXT per service per domain is considered valid.
 * @param txtRecords are TXT records from dns.
 * @param serviceLabel is a label of service, for which we want to get string
 * value from TXT record.
 * @return string value for a given service among given dns TXT records, or
 * undefined, when service record is not found.
 */
function extractPair(
	txtRecords: string[][], serviceLabel: string
): string|undefined {
	for (const txtRecord of txtRecords) {
		const txt = txtRecord.join(' ');
		const eqPos = txt.indexOf('=');
		if (eqPos < 0) { continue; }
		const name = txt.substring(0, eqPos).trim();
		if (name === serviceLabel) {
			const value = txt.substring(eqPos+1).trim();
			return value;
		}
	}
	return;
}

type DNSConnectException = web3n.DNSConnectException;

interface DnsError extends Error {
	code: string;
	hostname: string;
}

const W3N_APP_TXT_LABEL = 'w3n-app';

export async function getAppLocation(
	appDomain: string, dnsResolvers: DnsResolver[], logError: Logging['logError']
): Promise<string> {
	let prevConnectionExc: DNSConnectException|undefined = undefined;
	for (let i=0; i<dnsResolvers.length; i+=1) {
		const resolver = dnsResolvers[i]
		try {
			const txtRecords = await resolver.resolveTxt(appDomain);
			const recValue = extractPair(txtRecords, W3N_APP_TXT_LABEL);
			if (!recValue) { throw noAppRecordExc(appDomain); }
			const url = checkAndPrepareURL(recValue);
			return url;
		} catch (err) {
			await logError(err, `Resolver ${i+1} fails to get TXT records of app domain ${appDomain}`);
			const { code, hostname, message } = err as DnsError;
			if (code === NODATA) {
				throw noAppRecordExc(appDomain);
			} else if ((code === SERVFAIL)
				|| (code === CONNREFUSED)
				|| (code === TIMEOUT)) {
					if (!prevConnectionExc) {
						prevConnectionExc = noConnectionExc({ code, hostname, message });
					}
				} else if (code === NOTFOUND) {
				throw domainNotFoundExc(appDomain)
			} else {
				throw err;
			}
		}
	}
	throw prevConnectionExc;
}

function checkAndPrepareURL(value: string): string {
	// XXX insert some value sanity check
	
	return 'https://'+value;
}

function noConnectionExc(
	cause: { code: string; hostname: string; message: string; }
): DNSConnectException {
	return makeRuntimeException<DNSConnectException>(
		'connect', {
			connectType: 'dns',
			message: `The most likely cause of this error is device not connected. Next likely cause is DNS not setup, or not connecting properly. Like the saying goes: "It's not DNS. There is no way it's DNS. It was DNS."`,
			cause
		}, {}
	);
}


Object.freeze(exports);