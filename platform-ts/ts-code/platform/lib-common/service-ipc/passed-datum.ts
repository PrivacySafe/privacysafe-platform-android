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

import { utf8 } from "../buffer-utils";

type PassedDatum = web3n.rpc.PassedDatum;

export function packIntoDatum(data: any): PassedDatum {
	if (ArrayBuffer.isView(data)) {
		return partsToDatum({ type: 'byte-array', bytes: data as Uint8Array });
	} else if ((typeof data !== 'object') || !data) {
		return partsToDatum({ type: 'pure-json', json: data });
	} else if ((data as ObjectFromCore)._isObjectFromCore) {
		return partsToDatum({ type: 'referenced-obj', passedByReference: data });
	} else {
		const { parts, objToSkipInJSON } = separateObjectParts(data);
		return partsToDatum(parts, objToSkipInJSON);
	}
}

interface ObjectFromCore {
	_isObjectFromCore: true;
}

interface RefdObject {
	type: 'referenced-obj';
	passedByReference: any;
}

interface PureJson {
	type: 'pure-json';
	json: any;
}

interface BytesArray {
	type: 'byte-array';
	bytes: Uint8Array;
}

interface MixedParts {
	type: 'mix';
	json: any;
	byteArrays?: Uint8Array[];
	byteArrayPlacesInJson?: { place: (string|number)[]; arrLen: number; }[];
	passedByReference?: any[];
	refdObjPlaceInJson?: ((string|number)[])[];
}

type SeparatedDataParts = PureJson | BytesArray | RefdObject | MixedParts;

type SerializedMixedParts = Omit<MixedParts, 'byteArrays' | 'passedByReference' | 'type'>;

const typeByteValues: Record<Exclude<SeparatedDataParts['type'], 'referenced-obj'>, number> = {
	'byte-array': 1,
	'pure-json': 2,
	'mix': 3
};

function partsToDatum(parts: SeparatedDataParts, objToSkipInJSON?: Set<any>): PassedDatum {
	const replacer = (objToSkipInJSON ? (k: string, v: any) => (objToSkipInJSON.has(v) ? null : v) : undefined);
	switch (parts.type) {
		case 'referenced-obj': {
			return { passedByReference: [ parts.passedByReference ] };
		}
		case 'byte-array': {
			const bytes = new Uint8Array(1 + parts.bytes.length);
			bytes[0] = typeByteValues["byte-array"];
			bytes.set(parts.bytes, 1);
			return { bytes };
		}
		case 'pure-json': {
			const jsonBytes = utf8.pack(JSON.stringify(parts.json, replacer));
			const bytes = new Uint8Array(1 + jsonBytes.length);
			bytes[0] = typeByteValues["pure-json"];
			bytes.set(jsonBytes, 1);
			return { bytes };
		}
		case 'mix': {
			const { json, byteArrays, byteArrayPlacesInJson, passedByReference, refdObjPlaceInJson } = parts;
			const serial: SerializedMixedParts = { json, byteArrayPlacesInJson, refdObjPlaceInJson };
			const serialJsonBytes = utf8.pack(JSON.stringify(serial, replacer));
			const lengthOfBinaryArrays = totalLenOf(byteArrays);
			const bytes = new Uint8Array(1 + 4 + lengthOfBinaryArrays + serialJsonBytes.length);
			bytes[0] = typeByteValues["mix"];
			let ofs = 1;
			packUintTo4Bytes(lengthOfBinaryArrays, bytes, ofs);
			ofs += 4;
			if (byteArrays) {
				for (const binArr of byteArrays) {
					bytes.set(binArr, ofs);
					ofs += binArr.length;
				}
			}
			bytes.set(serialJsonBytes, ofs);
			return { bytes, passedByReference };
		}
	}
}

export function unpackDatum({ bytes, passedByReference }: PassedDatum): any {
	if (bytes) {
		switch (bytes[0]) {
			case typeByteValues['byte-array']: {
				return bytes.subarray(1);
			}
			case typeByteValues['pure-json']: {
				return JSON.parse(utf8.open(bytes.subarray(1)));
			}
			case typeByteValues['mix']: {
				let ofs = 1;
				const lengthOfBinaryArrays = uintFrom4Bytes(bytes, ofs);
				ofs += 4;
				const serialJsonBytes = bytes.subarray(ofs + lengthOfBinaryArrays);
				const {
					json, byteArrayPlacesInJson, refdObjPlaceInJson
				}: SerializedMixedParts = JSON.parse(utf8.open(serialJsonBytes));
				const byteArrays = ((byteArrayPlacesInJson && (byteArrayPlacesInJson.length > 0)) ?
					([] as Uint8Array[]) : undefined
				);
				if (byteArrays) {
					for (const { arrLen } of byteArrayPlacesInJson!) {
						byteArrays.push(bytes.subarray(ofs, ofs+arrLen));
						ofs += arrLen;
					}
				}
				return combineObjectParts({
					json, byteArrays, byteArrayPlacesInJson, passedByReference, refdObjPlaceInJson
				});
			}
			default:
				throw new TypeError(`Unexpected type byte value ${bytes[0]}`);
		}
	} else {
		return passedByReference?.[0];
	}
}

function totalLenOf(byteArrs?: Uint8Array[]): number {
	let totalLen = 0;
	if (byteArrs && (byteArrs.length > 0)) {
		for (const bytes of byteArrs) {
			totalLen += bytes.length;
		}
	}
	return totalLen;
}

/**
 * @param u is an unsigned integer up to 32-bits to be stored big-endian way in 4 bytes.
 */
function packUintTo4Bytes(u: number, b: Uint8Array, i: number): void {
	if (u > 0xffffffff) {
		throw new Error('Cannot store number bigger than 2^32-1');
	}
	if (b.length < i+4) {
		throw new Error('Given array has less than 4 bytes, starting with a given index.');
	}
	b[i] = u >>> 24;
	b[i+1] = u >>> 16;
	b[i+2] = u >>> 8;
	b[i+3] = u;
}

/**
 * @param x
 * @param i
 * @return unsigned integer (up to 32 bits), stored big-endian way in 4 bytes of x, starting at index i.
 */
function uintFrom4Bytes(x: Uint8Array, i = 0): number {
	if (x.length < i+4) {
		throw new Error('Given array has less than 4 bytes, starting with a given index.');
	}
	// Note that (x << 24) may produce negative number, probably due to
	// treating intermediate integer as signed, and pulling sign to resulting
	// float number. Hence, we need a bit different operation here.
	return (x[i] * 0x1000000) + ((x[i+1] << 16) | (x[i+2] << 8) | x[i+3]);
}

function separateObjectParts<T extends object>(o: T): { parts: SeparatedDataParts; objToSkipInJSON?: Set<any>; } {
	const byteArrays: Uint8Array[] = [];
	const byteArrayPlacesInJson: { place: (string|number)[]; arrLen: number; }[] = [];
	const passedByReference: any[] = [];
	const refdObjPlaceInJson: ((string|number)[])[] = [];
	const objToSkipInJSON = new Set<any>();

	function separateNonJsonPartsIteratively(obj: object, objPath: (string|number)[]): void {
		if (Array.isArray(obj)) {
			for (let i=0; i<obj.length; i+=1) {
				skipSeparateOrIterate(obj[i], i, objPath);
			}
		} else {
			for (const [ field, value ] of Object.entries(obj)) {
				skipSeparateOrIterate(value, field, objPath);
			}
		}
	}
	function skipSeparateOrIterate(v: any, field: string|number, parentPath: (string|number)[]) {
		if ((typeof v !== 'object') || !v) {
			return;
		} else if (ArrayBuffer.isView(v)) {
			byteArrays.push(v as Uint8Array);
			byteArrayPlacesInJson.push({
				place: parentPath.concat(field),
				arrLen: (v as Uint8Array).length
			});
			objToSkipInJSON.add(v);
		} else if ((v as ObjectFromCore)._isObjectFromCore) {
			passedByReference.push(v);
			refdObjPlaceInJson.push(parentPath.concat(field));
			objToSkipInJSON.add(v);
		} else {
			separateNonJsonPartsIteratively(v, parentPath.concat(field));
		}
	}
	separateNonJsonPartsIteratively(o, []);

	if ((byteArrays.length > 0) || (passedByReference.length > 0)) {
		return {
			parts: {
				type: 'mix', json: o,
				byteArrays: ((byteArrays.length > 0) ? byteArrays : undefined),
				byteArrayPlacesInJson: ((byteArrayPlacesInJson.length > 0) ? byteArrayPlacesInJson : undefined),
				passedByReference: ((passedByReference.length > 0) ? passedByReference : undefined),
				refdObjPlaceInJson: ((refdObjPlaceInJson.length > 0) ? refdObjPlaceInJson : undefined)
			},
			objToSkipInJSON
		};
	} else {
		return {
			parts: { type: 'pure-json', json: o }
		};
	}
}

function combineObjectParts({
	json, byteArrays, byteArrayPlacesInJson, passedByReference, refdObjPlaceInJson
}: Omit<MixedParts, 'type'>): any {
	if (byteArrays) {
		for (let i=0; i<byteArrayPlacesInJson!.length; i+=1) {
			setValueIn(json, byteArrayPlacesInJson![i].place, byteArrays[i]);
		}
	}
	if (passedByReference) {
		for (let i=0; i<refdObjPlaceInJson!.length; i+=1) {
			setValueIn(json, refdObjPlaceInJson![i], passedByReference[i]);
		}
	}
	return json;
}

function setValueIn(o: any, path: (string|number)[], value: any): void {
	let parent = o;
	for (let i=0; i<(path.length-1); i+=1) {
		parent = parent[path[i]];
	}
	parent[path[path.length-1]] = value;
}
