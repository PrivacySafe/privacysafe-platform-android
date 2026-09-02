/*
 Copyright (C) 2015, 2024 3NSoft Inc.
 
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

import { Action } from "./single";

/**
 * This is a container of processes, labeled by some ids. It allows to track if
 * there is a process already in progress with a given id. And, it allows to
 * chain process, when needed.
 * 
 * Common use of such class is to reuse getting of some expensive resource(s).
 */
export class NamedProcs {
	
	private promises = new Map<string, Promise<any>>();
	
	constructor() {
		Object.freeze(this);
	}
	
	/**
	 * @param id is a string key of a process
	 * @return a promise of a process' completion, or undefined, if process with
	 * given id is unknown.
	 */
	getP<T>(id: string): Promise<T> | undefined {
		return this.promises.get(id);
	}
	
	private insertPromise<T>(id: string, promise: Promise<T>): Promise<T> {
		const promiseToRegister = promise.catch(noop).then(() => {
			if (this.promises.get(id) === promiseToRegister) {
				this.promises.delete(id);
			}
		});
		this.promises.set(id, promiseToRegister);
		return promise;
	}
	
	/**
	 * This method will add a promise of an already started process.
	 * @param id is a string key of a process
	 * @param promise of an already started process
	 * @return a promise of a process' completion.
	 */
	addStarted<T>(id: string, promise: Promise<T>): Promise<T> {
		if (this.promises.has(id)) {
			throw new Error('Process with id "'+id+'" is already in progress.');
		}
		return this.insertPromise(id, promise);
	}
	
	/**
	 * This method will start a given action only, if a process with a given id
	 * is not running.
	 * @param id is a string key of a process
	 * @param action is a function that starts some process
	 * @return a promise of a process' completion.
	 */
	start<T>(id: string, action: Action<T>): Promise<T> {
		if (this.promises.has(id)) {
			throw new Error('Process with id "'+id+'" is already in progress.');
		}
		return this.insertPromise(id, action());
	}
	
	/**
	 * This method will chain a given action to an already running process, or,
	 * if identified process is not running, this will start given action under
	 * a given id.
	 * @param id is a string key of a process
	 * @param action is a function that starts some process
	 * @return a promise of a process' completion.
	 */
	startOrChain<T>(id: string, action: Action<T>): Promise<T> {
		const promise = this.promises.get(id);
		if (promise) {
			const next = promise.then(() => action());
			return this.insertPromise(id, next);
		} else {
			return this.insertPromise(id, action());
		}
	}

	/**
	 * This method tells if there are any procs in this container.
	 * @returns true is there is at least on process, and false otherwise.
	 */
	hasProcs(): boolean {
		return (this.promises.size > 0);
	}
	
}
Object.freeze(NamedProcs.prototype);
Object.freeze(NamedProcs);


function noop() {}
