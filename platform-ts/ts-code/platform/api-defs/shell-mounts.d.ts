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


declare namespace web3n.shell.mounts {

	interface MountsIntoOS {
		mountFolder(path: string[], fs: web3n.files.FS): Promise<void>;
		mountFile(path: string[], file: web3n.files.File): Promise<void>;
		unmountPath(path: string[]): Promise<void>;
		unmountFolder(fs: web3n.files.FS): Promise<void>;
		unmountFile(file: web3n.files.File): Promise<void>;
	}

	interface MountException extends RuntimeException {
		type: 'mount';
		notMounted?: true;
		cantMount?: true;
		alreadyMounted?: true;
		badPath?: true;
		pathIsUsed?: true;
		notFound?: true;
	}

}
