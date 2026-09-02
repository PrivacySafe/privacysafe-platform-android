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

import { wrapFnOnAndroidSide } from "../runtime-ipc-via-ports";
import { delay_op as pb } from '../../protos/delay-op.proto';
import { ProtoType } from "../../../platform/lib-common/protobuf-msg";

export function makeDelayFns() {

  const delayFn = wrapFnOnAndroidSide('delay');
  const argsType = ProtoType.for<{ millis: number; }>(pb.MillisArgs);

  async function delay(millis: number): Promise<void> {
    await delayFn(argsType.pack({ millis }));
  }

  function sanitizeTimeout(minVal: 0|1, timeout: number|undefined): number {
    if ((typeof timeout !== 'number') || (timeout < minVal)) {
      return minVal;
    }
    if (!Number.isInteger(timeout)) {
      timeout = Math.floor(timeout);
    }
    return ((timeout > 0x7fffffff) ? 0x7fffffff : timeout);
  }

  const setTimeout: typeof globalThis['setTimeout'] = function(handler, timeout, ...args) {
    if (typeof handler === 'string') {
      throw new TypeError(`This implementation can take function as handler, but string is considered insecure`);
    }
    timeout = sanitizeTimeout(0, timeout);
    const id = getIdFromPool();
    delay(timeout).then(() => {
      if (ids.has(id)) {
        ids.delete(id);
        handler.apply(globalThis, args);
      }
    });
    return id as any;
  } as any;

  // Doc https://developer.mozilla.org/en-US/docs/Web/API/Window/setInterval#delay_restrictions says
  // that ids' pool is shared, hence, we use one set here.
  const ids = new Set<number>();
  let nextId = 1;
  function getIdFromPool(): number {
    nextId += 1;
    while (ids.has(nextId)) {
      nextId += 1;
      if (nextId === Number.MAX_SAFE_INTEGER) {
        nextId = 1;
      }
    }
    ids.add(nextId);
    return nextId;
  }

  const clearTimeout: typeof globalThis['clearTimeout'] = function(id) {
    ids.delete(id!);
  };

  const setInterval: typeof globalThis['setInterval'] = function(handler, timeout, ...args) {
    if (typeof handler === 'string') {
      throw new TypeError(`This implementation can take function as handler, but string is considered insecure`);
    }
    timeout = sanitizeTimeout(1, timeout);
    const id = getIdFromPool();
    delay(timeout).then(async () => {
      while (ids.has(id)) {
        try {
          handler.apply(globalThis, args);
        } catch (err) {
          ids.delete(id);
          throw err;
        }
        await delay(timeout);
      }
    });
    return id as any;
  };

  const clearInterval: typeof globalThis['clearInterval'] = function(id) {
    ids.delete(id!);
  };

  const setImmediate = function(handler: Function, ...args: any[]) {
    return setTimeout(handler, 0, ...args);
  };

  const clearImmediate = function(id: number) {
    ids.delete(id);
  }

  return {
    setTimeout, clearTimeout,
    setInterval, clearInterval,
    setImmediate, clearImmediate
  };
}