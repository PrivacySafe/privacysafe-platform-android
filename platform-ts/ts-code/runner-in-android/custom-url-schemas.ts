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

import { DEFAULT_SIGNUP_URL, PLATFORM_NAME } from "./bundle-confs";
import { SignupParamsViaURL } from "../platform/inject-defs/platform";
import { checkAndTransformAddress } from "../platform/lib-common/canonical-address";

type CmdParams = web3n.shell.commands.CmdParams;

export const appUrlSchema = 'w3n-app';
export const web3nUrlSchema = 'w3n';

export type SysCmd = 'add-contact';

export function parse3NWebURL(urlStr: string): {
	signupParams?: SignupParamsViaURL;
	systemCmd?: CmdParams;
} {
	try {
		const signupParams = parseSignupURL(urlStr);
		if (signupParams) {
			return { signupParams };
		}
		const systemCmd = parse3NWebServiceCommands(urlStr);
		if (systemCmd) {
			return { systemCmd };
		}
	} catch (err) {}
	return {};
}

function parseSignupURL(urlStr: string): SignupParamsViaURL|undefined {
	const stdSignup = `${web3nUrlSchema}://${PLATFORM_NAME.toLowerCase()}/signup/`;
	const customSignup = `${web3nUrlSchema}://signup/`;
	const indOfLastSlash = urlStr.lastIndexOf('/');
	if (indOfLastSlash < 0) {
		return;
	}
	const token = urlStr.substring(indOfLastSlash+1);
	if (urlStr.startsWith(customSignup)) {
		const signupUrl = (new URL(`https://${urlStr.substring(customSignup.length, indOfLastSlash+1)}`)).href;
		return {
			signupUrl,
			token
		};
	} else if (urlStr.toLowerCase().startsWith(stdSignup)) {
		return {
			signupUrl: DEFAULT_SIGNUP_URL,
			isStandardService: true,
			token
		};
	}
}

function parse3NWebServiceCommands(urlStr: string): CmdParams|undefined {
	if (urlStr.startsWith(`${web3nUrlSchema}://add-contact/?`)) {
		const url = new URL(urlStr);
		const address = url.searchParams.get('a');
		if (!address || !checkAndTransformAddress(address)) {
			return;
		}
		const paramForCmd = {
			mail: address,
			name: url.searchParams.get('n'),
			pkey: url.searchParams.get('pk'),
			kid: url.searchParams.get('kid')
		};
		const cmd: SysCmd = 'add-contact';
		return { cmd, params: [ paramForCmd ] };
	}
}

export interface AppCallViaURL {
	appDomain: string;
	path: string;
	hash: string|undefined;
}

export function parseAppURL(urlStr: string): AppCallViaURL|undefined {
	try {
		if (!urlStr.startsWith(`${appUrlSchema}://`)) {
			return;
		}
		const url = new URL(urlStr);
		return {
			appDomain: url.hostname,
			path: url.pathname,
			hash: (url.hash ? url.hash : undefined)
		};
	} catch (err) {}
}
