/*
 Copyright (C) 2025 3NSoft Inc.
 
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

import { ExposedObj, serviceSideJSONWrap as jsonSrv } from 'core-3nweb-client-lib/build/ipc';

type UI = web3n.ui.UI;

export function exposeUICAP(cap: UI): ExposedObj<UI> {
	return {
		uiFormFactor: jsonSrv.wrapReqReplySrvMethod(cap, 'uiFormFactor')
	};
}

