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

export type OpenURLWhitelistEntry = web3n.caps.OpenURLWhitelistEntry;

export function urlFitsFilter({
	schema, anyDomain, domain, subdomains
}: OpenURLWhitelistEntry, url: URL): boolean {
	if (url.protocol !== `${schema}:`) { return false; }
	if (anyDomain) { return true; }
	if (domain) {
		if (subdomains) {
			for (const subd of subdomains) {
				const sections = subd.split('.');
				if (sections[0] === '*') {
					return url.hostname.endsWith(`${
						(sections.length === 1) ? '' : `.${sections.slice(1).join('.')}`
					}.${domain}`);
				} else {
					return (url.hostname === `${subd}.${domain}`);
				}
			}
		} else {
			return (domain === url.hostname);
		}
	}
	return false;
}

