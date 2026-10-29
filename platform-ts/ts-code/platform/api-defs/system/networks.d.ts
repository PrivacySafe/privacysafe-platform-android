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

declare namespace web3n.system.networks {

	interface Networks {

		dnsAndIP: DnsAndIP;

		onion?: Onion;

		// XXX other networks with identities, like <public_key>.[onion|i2p], i.e. inbuilt verifyable naming
		// i2p?: I2P;

	}

	interface DnsAndIP {

		/**
		 * This tests connectivity with given proxy setup, or connectivity of current proxy, returning true if test is
		 * fine, and false, if test fails.
		 * @param opts is a proxy setup to test, with undefined testing currently set proxy.
		 */
		testProxySetup: (opts?: ProxiesForDnsAndIP) => Promise<boolean>;

		currentProxy: () => Promise<ProxiesForDnsAndIP|undefined>;

		/**
		 * Sets or removes current proxy.
		 * Setting proxy will test proxy setup, and throw if test fails.
		 * @param opts 
		 */
		setCurrentProxy: (opts: ProxiesForDnsAndIP|undefined) => Promise<void>;

	}

	type ProxiesForDnsAndIP = Socks5ProxySetup | 'tor';

	interface Socks5ProxySetup {
		type: 'socks5';
		hostname: string;
		port: number;
	}

	interface Onion {

		/**
		 * This tests connectivity with given Tor settings, or connectivity of current setup, returning true if test is
		 * fine, and false, if test fails.
		 * @param opts 
		 */
		testConnection: (opts?: TorProxySetup) => Promise<boolean>;

		currentSetup: () => Promise<TorProxySetup>;

		setTorProxy: (opts: TorProxySetup) => Promise<void>;

	}

	interface TorProxySetup {
		localhostPort: number;
	}

}