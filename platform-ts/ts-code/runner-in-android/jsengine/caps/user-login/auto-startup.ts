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

type AutoStartup = web3n.system.AutoStartupSettings;

export function shouldSkipDashboard(): boolean {
	return false;
}

export async function isAutoStartupAvailable(): Promise<boolean> {
	return true;
}

export async function isAutoStartupSet(): Promise<boolean> {
	return true;
}

export async function setAutoStartup(enable: boolean): Promise<void> {
	console.error(`setAutoStartup() is called with enable == ${enable}, but we do nothing, and further implementation is needed`);
}

export function makeAutoStartupCAP(): AutoStartup {
	return {
		isAutoStartupAvailable,
		isAutoStartupSet,
		setAutoStartup
	};
}


Object.freeze(exports);