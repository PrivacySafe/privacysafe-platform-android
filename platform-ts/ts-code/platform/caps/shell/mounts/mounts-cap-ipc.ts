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

import { Caller, CoreSideServices, ExposedObj, FileMsg, FSMsg, callerSideJSONWrap as jsonCall, serviceSideJSONWrap as jsonSrv } from 'core-3nweb-client-lib/build/ipc';
import { file as filePb } from '../../../protos/file.proto';
import { fs as fsPb } from '../../../protos/fs.proto';
import { ProtoType } from 'core-3nweb-client-lib/build/lib-client/protobuf-type';

type MountsInOS = NonNullable<web3n.shell.ShellCAPs['mounts']>;

const filePbType = ProtoType.for<FileMsg>(filePb.File);
const fsPbType = ProtoType.for<FSMsg>(fsPb.FS);

export function exposeMountsCAP(
	cap: MountsInOS, expServices: CoreSideServices
): ExposedObj<MountsInOS> {
	const findReferencedObj = expServices.getOriginalObj.bind(expServices);
	const exposed: ExposedObj<MountsInOS> = {
		mountFile: jsonSrv.wrapReqReplySrvMethod(cap, 'mountFile', { findReferencedObj }),
		mountFolder: jsonSrv.wrapReqReplySrvMethod(cap, 'mountFolder', { findReferencedObj }),
		unmountPath: jsonSrv.wrapReqReplySrvMethod(cap, 'unmountPath'),
		unmountFile: jsonSrv.wrapReqReplySrvMethod(cap, 'unmountFile', { findReferencedObj }),
		unmountFolder: jsonSrv.wrapReqReplySrvMethod(cap, 'unmountFolder', { findReferencedObj })
	};
	return exposed;
}

export function makeMounts(
	caller: Caller, objPath: string[]
): MountsInOS {
	const mounts: MountsInOS = {
		mountFile: jsonCall.makeReqRepObjCaller<MountsInOS, 'mountFile'>(
			caller, objPath, 'mountFile', { findRefOf: caller.srvRefOf.bind(caller) }
		),
		mountFolder: jsonCall.makeReqRepObjCaller<MountsInOS, 'mountFolder'>(
			caller, objPath, 'mountFolder', { findRefOf: caller.srvRefOf.bind(caller) }
		),
		unmountPath: jsonCall.makeReqRepObjCaller<MountsInOS, 'unmountPath'>(caller, objPath, 'unmountPath'),
		unmountFile: jsonCall.makeReqRepObjCaller<MountsInOS, 'unmountFile'>(
			caller, objPath, 'unmountFile', { findRefOf: caller.srvRefOf.bind(caller) }
		),
		unmountFolder: jsonCall.makeReqRepObjCaller<MountsInOS, 'unmountFolder'>(
			caller, objPath, 'unmountFolder', { findRefOf: caller.srvRefOf.bind(caller) }
		)
	};
	return mounts;
}
