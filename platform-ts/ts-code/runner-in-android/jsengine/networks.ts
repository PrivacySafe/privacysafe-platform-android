/*
 Copyright (C) 2026 3NSoft Inc.

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

import { dohAt } from 'core-3nweb-client-lib';
import { DnsResolver, wrapNetworkFns } from 'core-3nweb-client-lib/build/lib-client/networks';
import { dohURLs } from './confs';
import { OpenServiceEventsSource, RequestFn } from 'core-3nweb-client-lib/build/lib-client/request-utils';
import { makeRequestFromAndroid } from './ops/request';

type Networks = web3n.system.networks.Networks;
type DnsAndIP = web3n.system.networks.DnsAndIP;
type ProxiesForDnsAndIP = web3n.system.networks.ProxiesForDnsAndIP;


class DnsAndIPNet implements DnsAndIP {

	private proxySetup: ProxiesForDnsAndIP|undefined = undefined;

	private currentRequestFn: RequestFn<unknown>;
	private currentEventsSourceFn: OpenServiceEventsSource;
	private currentResolvers: DnsResolver[];

	constructor() {
		this.setRegularFns();
		this.setDnsResolvers();
		Object.seal(this);
	}

	async currentProxy(): Promise<ProxiesForDnsAndIP|undefined> {
		return this.proxySetup;
	}

	private setRegularFns(): void {
		const { requestFromAndroid, openServiceEventsSource } = makeRequestFromAndroid();
		this.currentRequestFn = requestFromAndroid;
		this.currentEventsSourceFn = openServiceEventsSource;
	}

	async setCurrentProxy(opts: ProxiesForDnsAndIP|undefined): Promise<void> {
		throw new Error(`Setting proxy is not implemented on Android, yet`);
	}

	private setDnsResolvers(): void {
		this.currentResolvers = dohURLs.map(({ url, type }) => dohAt(this.requests, url, type));
	}

	wrapCAP(): Networks['dnsAndIP'] {
		return {
			currentProxy: this.currentProxy.bind(this),
			setCurrentProxy: this.setCurrentProxy.bind(this),
			testProxySetup: this.testProxySetup.bind(this)
		};
	}

	async testProxySetup(opts?: ProxiesForDnsAndIP): Promise<boolean> {

		// XXX testing should happen here

		return true;
	}

	readonly requests: RequestFn<unknown> = (opts, reqContentType, reqBody) => {
		return this.currentRequestFn(opts, reqContentType, reqBody);
	};

	readonly openServiceEventsSource: OpenServiceEventsSource = req => {
		return this.currentEventsSourceFn(req);
	};

	readonly namingFns = (): DnsResolver[] => {
		return this.currentResolvers;
	};

}
Object.freeze(DnsAndIPNet.prototype);
Object.freeze(DnsAndIPNet);


export function makeNetworksParts() {

	const dnsAndIPNet = new DnsAndIPNet();

	const networks: Networks = {
		dnsAndIP: dnsAndIPNet.wrapCAP(),
	};

	const { makeNet: makeNetClient, makeLocator: makeServiceLocator } = wrapNetworkFns({
		regular: {
			requests: dnsAndIPNet.requests,
			openServiceEventsSource: dnsAndIPNet.openServiceEventsSource,
			naming: dnsAndIPNet.namingFns
		}
	});

	return { makeNetClient, makeServiceLocator, networks };
}


Object.freeze(exports);