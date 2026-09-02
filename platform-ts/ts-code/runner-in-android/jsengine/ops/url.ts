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

import { parse } from 'url';

export class Url implements URL {

	hash: string;
	host: string;
	hostname: string;
	href: string;
	origin: string;
	password: string;
	pathname: string;
	port: string;
	protocol: string;
	search: string;
	searchParams: URLSearchParams;
	username: string;

	constructor(strUrl: string) {
		const u = parse(strUrl);
		const { hash, host, hostname, pathname, port, protocol, search, href } = u;
		this.hash = hash ?? '';
		this.host = host ?? '';
		this.hostname = hostname ?? '';
		this.pathname = pathname ?? '';
		this.port = port ?? '';
		this.protocol = protocol ?? '';
		this.search = search ?? '';
		this.href = href ?? '';
	}

	toString(): string {
		return this.href;
	}

	toJSON(): string {
		return JSON.stringify(this);
	}
	
}
