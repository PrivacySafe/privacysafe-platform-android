/*
 Copyright (C) 2024 - 2025 3NSoft Inc.
 
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

import { ExposedObj, CoreSideServices, CallerToClient, serviceSideJSONWrap as jsonSrv } from 'core-3nweb-client-lib/build/ipc';
import { setSelectDisplayMediaForCaptureHandler } from './handler-caps-ipc';

type MediaDevices = web3n.media.MediaDevices;

export function exposeMediaDevicesCAP(
	cap: MediaDevices, _expServices: CoreSideServices,
	callerToClient: CallerToClient
): ExposedObj<MediaDevices> {
	const wrap: ExposedObj<MediaDevices> = {
		isAudioCaptureAvailable: jsonSrv.wrapReqReplySrvMethod(cap, 'isAudioCaptureAvailable'),
		ensureDeviceAllowsScreenCapture: jsonSrv.wrapReqReplySrvMethod(cap, 'ensureDeviceAllowsScreenCapture')
	};
	if (cap.setSelectDisplayMediaForCaptureHandler) {
		wrap.setSelectDisplayMediaForCaptureHandler = setSelectDisplayMediaForCaptureHandler.expose(
			cap.setSelectDisplayMediaForCaptureHandler,
			callerToClient
		)
	}
	return wrap;
}
