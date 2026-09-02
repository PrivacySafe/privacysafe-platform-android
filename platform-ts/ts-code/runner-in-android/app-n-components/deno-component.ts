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

import { AppComponentBase } from "../../platform/apps/app";
import type { AppCAPsAndSetup, Service } from "../../platform/inject-defs/apps";
import type { PostponedValuesFixedKeysMap } from '../../platform/lib-common/postponed-values-map';
import { startJSEngineComponent } from "../jsengine/ops/android-jsengine";


export class DenoComponent extends AppComponentBase {

	private readonly onCloseListeners: (() => void)[] = [];

	constructor(
		public readonly connectorId: string,
		domain: string,
		entrypoint: string,
		caps: AppCAPsAndSetup,
		services: PostponedValuesFixedKeysMap<string, Service>|undefined
	) {
		super('deno', domain, entrypoint, services);
		this.onCloseListeners.push(caps.close);
		caps.setApp(this);
	}

	async start(): Promise<void> {
		await startJSEngineComponent(this.connectorId, this.domain, this.entrypoint);
	}

	setCloseListener(onClose: () => void): void {
		this.onCloseListeners.push(onClose);
	}

	close(): void {
		for (const listener of this.onCloseListeners) {
			try {
				listener();
			} catch (_) {}
		}
		this.onCloseListeners.splice(0, this.onCloseListeners.length);
	}

}
