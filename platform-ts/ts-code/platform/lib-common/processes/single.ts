/*
 Copyright (C) 2015, 2017, 2019, 2024 3NSoft Inc.
 
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

/**
 * This represents a function that will create a promise, potentially starting
 * some background process, only when it is called. Such wrap of code is needed
 * for scheduling, as very often any start of an action must be postponed till
 * later time. Scheduler needs a not-yet-started activity, as scheduler has
 * control action's start.
 */
export type Action<T> = () => Promise<T>;

/**
 * This is a container of process. It allows to track if a process is already
 * in progress. It also allows to chain process, when needed.
 * 
 * Common use of such class is to reuse getting of some expensive resource, or
 * do ning something as an exclusive process.
 */
export class SingleProc {
	
	private promise: Promise<any>|undefined = undefined;
	
	constructor() {
		Object.seal(this);
	}
	
	private insertPromise<T>(promise: Promise<T>): Promise<T> {
		const promiseToRegister = promise.catch(noop).then(() => {
			if (this.promise === promiseToRegister) {
				this.promise = undefined;
			}
		});
		this.promise = promiseToRegister;
		return promise;
	}
	
	getP<T>(): Promise<T>|undefined {
		return this.promise;
	}
	
	addStarted<T>(promise: Promise<T>): Promise<T> {
		if (this.promise) { throw new Error('Process is already in progress.'); }
		return this.insertPromise(promise);
	}
	
	start<T>(action: Action<T>): Promise<T> {
		if (this.promise) { throw new Error('Process is already in progress.'); }
		return this.insertPromise(action());
	}
	
	startOrChain<T>(action: Action<T>): Promise<T> {
		if (this.promise) {
			const next = this.promise.then(() => { return action(); });
			return this.insertPromise(next);
		} else {
			return this.insertPromise(action());
		}
	}
	
}
Object.freeze(SingleProc.prototype);
Object.freeze(SingleProc);

function noop() {}

/**
 * This wraps given function/method into syncing wrap.
 */
export function makeSyncedFunc<T extends Function>(
	syncProc: SingleProc, thisArg: any, func: T
): T {
	return ((...args: any[]) => syncProc.startOrChain(
		() => func.apply(thisArg, args))
	) as any as T;
}

/**
 * This is a cycling process, that ensures single execution.
 * It cycles while given "while" predicate returns true. When predicate returns
 * false, process goes to idle. Pushing this process into action is done via
 * startIfIdle() method.
 */
export class SingleCyclicProc {

	private proc: Promise<void>|undefined = undefined;
	
	/**
	 * @param cycleWhile is a "while" predicate. When it returns true, process
	 * continues to cycle, and when it returns false, process goes to idle.
	 * @param action is an async cycle body to run at each iteration.
	 */
	constructor(
		private cycleWhile: () => boolean,
		private action: () => Promise<void>
	) {
		Object.seal(this);
	}

	/**
	 * This starts process, if it is idle.
	 */
	startIfIdle(): void {
		if (this.proc) { return; }
		this.proc = this.action();
		this.proc.then(this.cycleOrIdle);
	}

	private cycleOrIdle = () => {
		if (this.cycleWhile()) {
			this.proc = this.action();
		} else {
			this.proc = undefined;
		}
	};

	isRunning(): boolean {
		return !!this.proc;
	}

	/**
	 * This makes process unusable and unstartable. Waiting on a return promise,
	 * awaits the completion of the last iteration this process is in (if any).
	 */
	async close(): Promise<void> {
		this.cycleWhile = () => false;
		this.action = () => {
			throw new Error('This cyclic process has already been closed');
		};
		await this.proc;
	}

}
Object.freeze(SingleCyclicProc.prototype);
Object.freeze(SingleCyclicProc);
