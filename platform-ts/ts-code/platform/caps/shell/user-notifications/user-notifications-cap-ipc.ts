/*
 Copyright (C) 2022, 2025 3NSoft Inc.

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

import { Caller, CoreSideServices, ExposedObj, callerSideJSONWrap as jsonCall, serviceSideJSONWrap as jsonSrv } from 'core-3nweb-client-lib/build/ipc';

type UserNotifications = web3n.shell.notifications.UserNotifications;

export function exposeUserNotificationsCAP(
	cap: UserNotifications, expServices: CoreSideServices
): ExposedObj<UserNotifications> {
	return {
		addNotification: jsonSrv.wrapReqReplySrvMethod(cap, 'addNotification', {
			findReferencedObj: ref => expServices.getOriginalObj(ref)
		}),
		removeNotification: jsonSrv.wrapReqReplySrvMethod(cap, 'removeNotification'),
		watch: jsonSrv.wrapObservingFunc(obs => cap.watch(obs))
	};
}

export function makeUserNotifications(caller: Caller, objPath: string[]): UserNotifications {
	return {
		addNotification: jsonCall.makeReqRepObjCaller<UserNotifications, 'addNotification'>(
			caller, objPath, 'addNotification', { findRefOf: f => caller.srvRefOf(f) }
		),
		removeNotification: jsonCall.makeReqRepObjCaller<UserNotifications, 'removeNotification'>(
			caller, objPath, 'removeNotification'
		),
		watch: jsonCall.makeObservableFuncCaller(caller, objPath.concat('watch'))
	};
}


Object.freeze(exports);