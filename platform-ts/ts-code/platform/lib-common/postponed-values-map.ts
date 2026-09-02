/*
 Copyright (C) 2024 3NSoft Inc.
 
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

import { Deferred, defer } from "./processes/deferred";

export class PostponedValuesFixedKeysMap<K, T> {

	private readonly slots = new Map<K, { value?: T, deferred?: Deferred<T> }>();

	constructor(possibleKeys: K[]) {
		for (const k of possibleKeys) {
			this.slots.set(k, { deferred: defer(), value: undefined });
		}
		Object.freeze(this);
	}

	async get(k: K): Promise<T> {
		const slot = this.slots.get(k);
		if (!slot) {
			throw new Error(`Key '${k}' is not known`);
		}
		return (slot.deferred ? slot.deferred.promise : slot.value!);
	}

	set(k: K, v: T): void {
		const slot = this.slots.get(k);
		if (!slot) {
			throw new Error(`Key '${k}' is not known`);
		}
		slot.value = v;
		slot.deferred?.resolve(v);
		slot.deferred = undefined;
	}

	resetSlot(k: K): void {
		const slot = this.slots.get(k);
		if (!slot) {
			throw new Error(`Key '${k}' is not known`);
		} if (!slot.deferred) {
			slot.value = undefined
			slot.deferred = defer();
		}
	}

	values(): T[] {
		return Array.from(this.slots.values())
		.map(({ value }) => value)
		.filter(value => !!value) as T[];
	}

}
Object.freeze(PostponedValuesFixedKeysMap.prototype);
Object.freeze(PostponedValuesFixedKeysMap);
