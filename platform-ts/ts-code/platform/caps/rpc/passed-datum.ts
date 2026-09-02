/*
 Copyright (C) 2022 - 2023 3NSoft Inc.
 
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

import { CoreSideServices, EnvelopeBody, TransferableObj, exposeFSService, exposeFileService, Caller, makeFSCaller, FSMsg, FileMsg, exposeSrcService, exposeSinkService, makeSrcCaller, makeSinkCaller, makeFileCaller } from 'core-3nweb-client-lib/build/ipc';
import { ObjectReference, ProtoType } from '../../lib-common/protobuf-msg';
import { rpc as pb } from '../../protos/rpc.proto';

type PassedDatum = web3n.rpc.PassedDatum;
type File = web3n.files.File;
type FS = web3n.files.FS;
type FileByteSource = web3n.files.FileByteSource;
type FileByteSink = web3n.files.FileByteSink;

export interface SerialFormOfPassedData {
	bytes?: Uint8Array;
	passedObjs?: PassedObj[];
}

export interface PassedObj {
	ref?: ObjectReference<string>;
	file?: FileMsg;
	fs?: FSMsg;
}

export const datumType = ProtoType.for<SerialFormOfPassedData>(pb.PassedDatum);

export function datumFromSerialFormOnCoreSide(
	datum: SerialFormOfPassedData|undefined, expServices: CoreSideServices
): PassedDatum|undefined {
	if (!datum) { return; }
	const { bytes, passedObjs } = datum;
	if (!passedObjs || (passedObjs.length === 0)) {
		return ((bytes && (bytes.length > 0)) ? { bytes } : undefined);
	} else {
		return {
			bytes: ((bytes && (bytes.length > 0)) ? bytes : undefined),
			passedByReference: passedObjs.map(({ ref }) => expServices.getObjForTransfer(ref!))
		};
	}
}

export function 
datumToSerialFormOnCoreSide(
	datum: PassedDatum|undefined, expServices: CoreSideServices
): SerialFormOfPassedData|undefined {
	if (!datum?.passedByReference) { return datum; }
	const { bytes, passedByReference } = datum;
	if (passedByReference.length === 0) { return { bytes }; }
	return {
		bytes,
		passedObjs: passedByReference.map(({ o, type }: TransferableObj<string>) => {
			const ref = expServices.findRefIfAlreadyExposed(o);
			if (ref) { return { ref }; }
			return exposeTransferable(type as TransferableRefType, o, expServices);
		})
	}
}

export function packDatumOnCoreSide(
	datum: PassedDatum|undefined, expServices: CoreSideServices
): EnvelopeBody {
	return (datum ?
		datumType.pack(datumToSerialFormOnCoreSide(datum, expServices)!) :
		undefined
	);
}

type TransferableType = File | FS | FileByteSink | FileByteSource;
type TransferableRefType = 'FileImpl' | 'FSImpl' | 'FileByteSource' | 'FileByteSink';

function exposeTransferable(
	type: TransferableRefType, o: TransferableType, expServices: CoreSideServices
): PassedObj {
	switch (type) {
		case 'FSImpl':
			return { fs: exposeFSService(o as FS, expServices) };
		case 'FileImpl':
			return { file: exposeFileService(o as File, expServices) };
		case 'FileByteSource':
			return { ref: exposeSrcService(o as FileByteSource, expServices) };
		case 'FileByteSink':
			return { ref: exposeSinkService(o as FileByteSink, expServices) };
		default:
			throw Error(`Can't transfer object of type ${type}`);
	}
}

export function datumToSerialFormOnClientSide(
	datum: PassedDatum|undefined, caller: Caller
): SerialFormOfPassedData|undefined {
	if (!datum?.passedByReference) { return datum; }
	const { bytes, passedByReference } = datum;
	if (!passedByReference || (passedByReference.length === 0)) {
		return ((bytes && (bytes.length > 0)) ? { bytes } : undefined);
	} else {
		return {
			bytes: ((bytes && (bytes.length > 0)) ? bytes : undefined),
			passedObjs: passedByReference.map(o => ({ ref: caller.srvRefOf(o) }))
		};
	}
}

export function datumFromSerialFormOnClientSide(
	datum: SerialFormOfPassedData|undefined, caller: Caller
): PassedDatum|undefined {
	if (!datum) { return; }
	const { bytes, passedObjs } = datum;
	if (!passedObjs || (passedObjs.length === 0)) {
		return ((bytes && (bytes.length > 0)) ? { bytes } : undefined);
	} else {
		return {
			bytes: ((bytes && (bytes.length > 0)) ? bytes : undefined),
			passedByReference: passedObjs.map(({ ref, file, fs }) => {
				if (ref) {
					const found = caller.findCallingObjByRef(ref);
					if (found?.obj) { return found.obj; }
					const reconstructData = found?.reconstructData;
					if (reconstructData) {
						switch (ref.objType as TransferableRefType) {
							case 'FSImpl':
								return makeFSCaller(caller, reconstructData as FSMsg);
							case 'FileImpl':
								return makeFileCaller(caller, reconstructData as FileMsg);
							default:
								throw Error(`Failed to recreate proxy for object type ${ref.objType} from reconstructData`);
						}
					} else {
						switch (ref.objType as TransferableRefType) {
							case 'FileByteSource':
								return makeSrcCaller(caller, ref as ObjectReference<"FileByteSource">);
							case 'FileByteSink':
								return makeSinkCaller(caller, ref as ObjectReference<"FileByteSink">);
							default:
								throw Error(`Failed to create proxy for object type ${ref.objType} from a reference`);
						}
					}
				} else if (file) {
					return makeFileCaller(caller, file);
				} else if (fs) {
					return makeFSCaller(caller, fs);
				}
			})
		};
	}
}

export function unpackDatumOnClientSide(
	bytes: EnvelopeBody, caller: Caller
): PassedDatum|undefined {
	return (bytes ?
		datumFromSerialFormOnClientSide(datumType.unpack(bytes), caller) :
		undefined
	);
}


Object.freeze(exports);