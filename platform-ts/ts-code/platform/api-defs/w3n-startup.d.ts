/*
 Copyright (C) 2025 - 2026 3NSoft Inc.

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

declare namespace web3n.caps.startup {

	interface DefaultProviderSite {
		openInExternal: (url: string) => Promise<void>;
		openSiteInChildWindow: (url: string) => Promise<void>;
		closeSite: () => Promise<void>;
		getSignupToken: () => Promise<string>;
	}

	interface ViewBounds {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	interface W3N extends web3n.startup.W3N {
		provider: DefaultProviderSite;
		enableAutoLogin?: SetAutoLogin;
		scanUrlQR?: (prefixies: string[]) => Promise<string|undefined>;
	}

	type SetAutoLogin = (enable: boolean) => Promise<void>;

}