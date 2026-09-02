/*
 Copyright (C) 2017, 2019 3NSoft Inc.
 
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

function oneTimeCaller(f: () => void): () => void {
	let hasBeenCalled = false;
	return function(): void {
		if (hasBeenCalled) { return; }
		hasBeenCalled = true;
		f();
	}
}

/**
 * Lock allows for exclusive process flow.
 * Locking is done by calling a lock function that returns an unlocker. Unlocker
 * must be called when lock can be released, preferably in a finally clause.
 * @return a lock function.
 * CAUTION: Lock is not re-entrant.
 */
export function makeLock(): () => Promise<() => void> {
	
	let isLocked = false;
	const queue: ((unlock: () => void) => void)[] = [];
	
	function unlock(): void {
		if (queue.length === 0) {
			isLocked = false;
		} else {
			const next = queue.shift();
			if (!next) { return; }
			next(oneTimeCaller(unlock));
		}
	}
	
	async function lock(): Promise<() => void> {
		if (isLocked) {
			return await new Promise<() => void>((resolve) => {
				queue.push(resolve);
			});
		} else {
			isLocked = true;
			return oneTimeCaller(unlock);
		}
	}
	
	return lock;
}

/**
 * Read-write lock allows reads to occur concurrently, while writes exclude
 * both reads and other writes. Implementation uses fair locking policy.
 * Locking is done by calling proper function that returns an unlocker. Unlocker
 * must be called when lock can be released, preferably in finally clause.
 * CAUTION: Lock is not re-entrant.
 */
export interface ReadWriteLock {
	
	/**
	 * This method acquires lock for reading. This excludes writes, but does
	 * allows other reads, unless they have to be scheduled after an already
	 * waiting write (as per fair policy).
	 * @return a promise, resolvable to unlocking function.
	 */
	lockForRead(): Promise<() => void>;
	
	/**
	 * This method acquires lock for writing. This excludes both reads and other
	 * writes.
	 * @return a promise, resolvable to unlocking function.
	 */
	lockForWrite(): Promise<() => void>;
	
}

/**
 * @return new read-write lock
 */
export function makeReadWriteLock(): ReadWriteLock {
	
	interface Queued {
		isWrite: boolean;
		write?: (unlock: () => void) => void;
		reads?: ((unlock: () => void) => void)[];
	}
	
	let isLockedForWrite = false;
	let isLockedForRead = false;
	const queue: Queued[] = [];
	let readsInProgress = 0;
	
	async function lockForWrite(): Promise<() => void> {
		if (isLockedForRead || isLockedForWrite) {
			return await new Promise<() => void>((resolve) => {
				queue.push({
					isWrite: true,
					write: resolve
				});
			});
		} else {
			isLockedForWrite = true;
			return oneTimeCaller(unlockAfterWrite);
		}
	}
	
	function unlockAfterWrite(): void {
		if (queue.length === 0) {
			isLockedForWrite = false;
			return;
		}
		const next = queue.shift();
		if (!next) { return; }
		if (next.isWrite) {
			next.write!(oneTimeCaller(unlockAfterWrite));
		} else {
			isLockedForWrite = false;
			isLockedForRead = true;
			readsInProgress = next.reads!.length;
			for (const read of next.reads!) {
				read(oneTimeCaller(unlockAfterRead));
			}
		}
	}
	
	async function lockForRead(): Promise<() => void> {
		if (isLockedForRead) {
			if (queue.length === 0) {
				readsInProgress += 1;
				return oneTimeCaller(unlockAfterRead);
			} else {
				return await queueRead();
			}
		} else if (isLockedForWrite) {
			return await queueRead();
		} else {
			isLockedForRead = true;
			readsInProgress = 1;	// no plus, as it is the first read
			return oneTimeCaller(unlockAfterRead);
		}
	}
	
	async function queueRead():  Promise<() => void> {
		const last = queue[queue.length-1];
		if (!last || last.isWrite) {
			return await new Promise<() => void>((resolve) => {
				queue.push({
					isWrite: false,
					reads: [ resolve ]
				});
			});
		} else {
			return await new Promise<() => void>((resolve) => {
				last.reads!.push(resolve);
			});
		}
	}
	
	function unlockAfterRead(): void {
		readsInProgress -= 1;
		if (readsInProgress > 0) { return; }
		if (queue.length === 0) {
			isLockedForRead = false;
			return;
		}
		const next = queue.shift();
		if (!next) { return; }
		if (next.isWrite) {
			isLockedForWrite = true;
			isLockedForRead = false;
			next.write!(oneTimeCaller(unlockAfterWrite));
		} else {
			throw new Error('Read locking is incorrectly queued');
		}
	}
	
	return { lockForRead, lockForWrite };
}
