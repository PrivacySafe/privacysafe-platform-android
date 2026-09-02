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

import { makeDelayFns } from "./ops/delay";
import { Url } from "./ops/url";
import { patchConsoleError, patchConsoleLog } from "./patches";

(function() {

  for (const [fnName, fn] of Object.entries(makeDelayFns())) {
    globalThis[fnName] = fn;
  }

  globalThis.URL = Url as any;

  (globalThis as any).self = globalThis;

  patchConsoleError();
  patchConsoleLog();

})();

import 'core-js/actual';
